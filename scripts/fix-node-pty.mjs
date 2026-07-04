// node-pty ships prebuilt binaries, but pnpm's extraction drops the execute bit on the
// unix `spawn-helper`, which makes PTY spawning fail with "posix_spawnp failed". Restore
// it after every install. Idempotent and safe to run when node-pty is absent.
import { chmodSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const pnpmDir = join(process.cwd(), 'node_modules', '.pnpm')
if (!existsSync(pnpmDir)) process.exit(0)

const platforms = ['darwin-arm64', 'darwin-x64', 'linux-x64', 'linux-arm64']

for (const entry of readdirSync(pnpmDir)) {
  if (!entry.startsWith('node-pty@')) continue
  const prebuilds = join(pnpmDir, entry, 'node_modules', 'node-pty', 'prebuilds')
  for (const platform of platforms) {
    const helper = join(prebuilds, platform, 'spawn-helper')
    if (existsSync(helper)) chmodSync(helper, 0o755)
  }
}
