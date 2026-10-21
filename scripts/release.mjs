#!/usr/bin/env node
// Cuts a release from `main`, in one go:
//
//   pnpm release                  uses the changesets already in .changeset/, or asks for the bump
//   pnpm release minor            patch, minor or major: drafts the changeset from the commits
//                                 since the last release and opens it in your git editor
//   pnpm release --yes            no confirmation before pushing
//   pnpm release --no-checks      skips typecheck, lint and tests
//
// It versions every `@soromi/*` package and the Rust crates (`pnpm version-packages`), writes the
// changelogs, commits `chore: release X.Y.Z`, tags it `X.Y.Z` and pushes both at once. The tag runs
// the Release workflow, which builds every platform and publishes the GitHub release with this
// version's changelog as its notes.
//
// Nothing is committed until you confirm; answering no puts the tree back as it was.

import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CHANGESETS = join(ROOT, '.changeset')
const BUMPS = ['patch', 'minor', 'major']
const PACKAGE = '@soromi/desktop'
const REPO = 'soromi/soromi'

const USAGE = 'usage: pnpm release [patch|minor|major] [--yes] [--no-checks]'

async function main() {
  const args = process.argv.slice(2)
  const yes = args.includes('--yes')
  const checks = !args.includes('--no-checks')
  const positional = args.filter((arg) => !arg.startsWith('--'))
  let bump = positional[0]
  if (positional.length > 1 || (bump && !BUMPS.includes(bump))) fail(USAGE)

  step('Checking the repository')
  preflight()

  const pending = pendingChangesets()
  if (pending.length && bump) {
    fail(
      `There are changesets already (${pending.join(', ')}). Run \`pnpm release\` without a bump.`,
    )
  }
  if (!pending.length) {
    bump ??= await ask(`No changesets. Which bump? (${BUMPS.join('/')}) `, BUMPS)
    draftChangeset(bump)
  }
  const saved = Object.fromEntries(
    pendingChangesets().map((name) => [name, readFileSync(join(CHANGESETS, name), 'utf8')]),
  )

  if (checks) {
    step('Running the checks')
    run('pnpm', ['typecheck'])
    run('pnpm', ['check'])
    run('pnpm', ['test'])
  }

  step('Versioning the packages and crates')
  const untracked = new Set(lines(git(['ls-files', '--others', '--exclude-standard'])))
  const rollback = () => restore(untracked, saved)
  run('pnpm', ['version-packages'], rollback)
  const version = readVersion()
  const tag = version

  if (git(['tag', '--list', tag]) || git(['ls-remote', '--tags', 'origin', `refs/tags/${tag}`])) {
    rollback()
    fail(`The tag ${tag} exists already.`)
  }

  console.log(`\n${git(['status', '--short'])}\n`)
  console.log(changelogSection(version) || '(no changelog entry)')
  if (
    !yes &&
    (await ask(`\nRelease ${version}? This commits, tags and pushes. (y/n) `, ['y', 'n'])) !== 'y'
  ) {
    rollback()
    console.log('Nothing was released. The changesets are kept for the next `pnpm release`.')
    return
  }

  step(`Releasing ${version}`)
  run('git', ['add', '-A'])
  run('git', ['commit', '-m', `chore: release ${version}`])
  run('git', ['tag', '-a', tag, '-m', `Soromi ${version}`])
  // Atomic, so the tag never lands without its commit or the other way round.
  run('git', ['push', '--atomic', 'origin', 'main', tag], () =>
    console.error(
      `\nThe commit and tag are made locally. Once fixed: git push --atomic origin main ${tag}`,
    ),
  )

  console.log(`\nReleased ${version}. The Release workflow builds and publishes it:`)
  console.log(`  https://github.com/${REPO}/actions/workflows/release.yml`)
  console.log(`  https://github.com/${REPO}/releases/tag/${tag}`)
}

/** On `main`, level with `origin/main`, nothing uncommitted outside .changeset/, and the tools. */
function preflight() {
  const branch = git(['branch', '--show-current'])
  if (branch !== 'main') fail(`Releases are cut from main, not ${branch || 'a detached HEAD'}.`)

  const dirty = lines(git(['status', '--porcelain'])).filter(
    (line) => !line.slice(3).startsWith('.changeset/'),
  )
  if (dirty.length) fail(`Commit or stash these first:\n${dirty.join('\n')}`)

  run('git', ['fetch', '--quiet', '--tags', 'origin', 'main'])
  const [behind, ahead] = git(['rev-list', '--left-right', '--count', 'origin/main...HEAD']).split(
    /\s+/,
  )
  if (behind !== '0') fail(`main is ${behind} commit(s) behind origin/main. Pull first.`)
  if (ahead !== '0') warn(`main has ${ahead} unpushed commit(s); they go out with the release.`)

  if (spawnSync('cargo', ['release', '--version'], { stdio: 'ignore' }).status !== 0) {
    fail('cargo-release is missing: `cargo install cargo-release`.')
  }
}

function pendingChangesets() {
  return readdirSync(CHANGESETS).filter((name) => name.endsWith('.md') && name !== 'README.md')
}

/** A changeset for `bump`, its text drafted from the commits since the last release, then edited. */
function draftChangeset(bump) {
  const last = git(['describe', '--tags', '--abbrev=0'], { allowFail: true })
  const range = last ? `${last}..HEAD` : 'HEAD'
  const commits = lines(git(['log', range, '--no-merges', '--format=%s']))
    .filter((subject) => !/^chore: (release|version packages)/i.test(subject))
    .map((subject) => `- ${subject.replace(/^\w+(\(.+?\))?!?:\s*/, '')}`)

  const scratch = mkdtempSync(join(tmpdir(), 'soromi-release-'))
  const file = join(scratch, 'CHANGESET.md')
  writeFileSync(
    file,
    [
      `# What this ${bump} release changes, as it should read in the changelog and on GitHub.`,
      `# Drafted from the commits since ${last || 'the beginning'}. Lines starting with # are dropped;`,
      '# leave it empty to cancel.',
      '',
      ...commits,
      '',
    ].join('\n'),
  )
  const editor = git(['var', 'GIT_EDITOR'])
  const edited = spawnSync(`${editor} "${file}"`, { shell: true, stdio: 'inherit' })
  if (edited.status !== 0) fail('The editor exited with an error.')

  const text = readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => !line.startsWith('#'))
    .join('\n')
    .trim()
  rmSync(scratch, { recursive: true, force: true })
  if (!text) fail('Empty summary; nothing was released.')

  const name = `release-${Date.now()}.md`
  writeFileSync(join(CHANGESETS, name), `---\n"${PACKAGE}": ${bump}\n---\n\n${text}\n`)
  console.log(`wrote .changeset/${name}`)
}

/** Back to HEAD, with the changesets as they were before versioning consumed them. */
function restore(untracked, saved) {
  run('git', ['restore', '--source=HEAD', '--staged', '--worktree', '--', '.'])
  for (const file of lines(git(['ls-files', '--others', '--exclude-standard']))) {
    if (!untracked.has(file)) rmSync(join(ROOT, file), { force: true })
  }
  for (const [name, text] of Object.entries(saved)) writeFileSync(join(CHANGESETS, name), text)
}

function readVersion() {
  return JSON.parse(readFileSync(join(ROOT, 'apps/desktop/package.json'), 'utf8')).version
}

/** This version's entry in the desktop changelog, without its heading. */
function changelogSection(version) {
  const file = join(ROOT, 'apps/desktop/CHANGELOG.md')
  if (!existsSync(file)) return ''
  const text = readFileSync(file, 'utf8')
  const start = text.indexOf(`\n## ${version}\n`)
  if (start === -1) return ''
  const body = text.slice(start + `\n## ${version}\n`.length)
  const end = body.search(/\n## /)
  return (end === -1 ? body : body.slice(0, end)).trim()
}

async function ask(question, answers) {
  const prompt = createInterface({ input: process.stdin, output: process.stdout })
  try {
    for (;;) {
      const answer = (await prompt.question(question)).trim().toLowerCase()
      if (answers.includes(answer)) return answer
    }
  } finally {
    prompt.close()
  }
}

function git(args, { allowFail = false } = {}) {
  const result = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' })
  if (result.status !== 0) {
    if (allowFail) return ''
    fail(`git ${args.join(' ')} failed\n${result.stderr}`)
  }
  // Only the end: a status line can start with a space that is part of its code.
  return result.stdout.trimEnd()
}

function lines(text) {
  return text ? text.split('\n') : []
}

function run(command, args, onFail) {
  const result = spawnSync(command, args, { cwd: ROOT, stdio: 'inherit' })
  if (result.status !== 0) {
    onFail?.()
    fail(`${command} ${args.slice(0, 3).join(' ')} failed`)
  }
}

function step(text) {
  console.log(`\n==> ${text}`)
}

function warn(text) {
  console.warn(`warning: ${text}`)
}

function fail(text) {
  console.error(`error: ${text}`)
  process.exit(1)
}

main()
