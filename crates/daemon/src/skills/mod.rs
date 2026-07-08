use std::fs;
use std::path::{Path, PathBuf};

use soromi_protocol::{Skill, SkillKind, SkillScope};

/// Lists a Claude session's slash commands (`commands/`) and skills, from the account's config
/// dir (user scope) and each project root's `.claude/` (project scope).
pub fn claude_skills(config_dir: &Path, project_roots: &[PathBuf]) -> Vec<Skill> {
    scan(config_dir, project_roots, ".claude", "commands")
}

/// Lists a Codex session's slash commands (`prompts/`) and skills, from the account's config dir
/// (user scope) and each project root's `.codex/` (project scope).
pub fn codex_skills(config_dir: &Path, project_roots: &[PathBuf]) -> Vec<Skill> {
    scan(config_dir, project_roots, ".codex", "prompts")
}

/// Scans an agent's commands and skills. `project_roots` are the folders the session runs at
/// (the selected work folders, not just the workspace root). `project_dir` is the per-project
/// config folder (e.g. `.claude`); `commands_dir` is the slash-command folder name. Read-only.
fn scan(
    config_dir: &Path,
    project_roots: &[PathBuf],
    project_dir: &str,
    commands_dir: &str,
) -> Vec<Skill> {
    let mut skills = Vec::new();
    collect_commands(
        &config_dir.join(commands_dir),
        SkillScope::User,
        &mut skills,
    );
    collect_skills(&config_dir.join("skills"), SkillScope::User, &mut skills);
    for root in project_roots {
        collect_commands(
            &root.join(project_dir).join(commands_dir),
            SkillScope::Project,
            &mut skills,
        );
        collect_skills(
            &root.join(project_dir).join("skills"),
            SkillScope::Project,
            &mut skills,
        );
    }
    skills.sort_by(|a, b| a.name.cmp(&b.name));
    skills.dedup_by(|a, b| a.name == b.name && a.kind == b.kind);
    skills
}

/// Slash commands: `*.md` files, invoked as `/<stem>`.
fn collect_commands(dir: &Path, scope: SkillScope, out: &mut Vec<Skill>) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("md") {
            continue;
        }
        let Some(name) = path.file_stem().and_then(|s| s.to_str()) else {
            continue;
        };
        let description = fs::read_to_string(&path)
            .ok()
            .and_then(|content| frontmatter(&content, "description"));
        out.push(Skill {
            name: name.to_string(),
            description,
            kind: SkillKind::Command,
            scope,
        });
    }
}

/// Skills: `<dir>/<name>/SKILL.md`, with `name`/`description` frontmatter.
fn collect_skills(dir: &Path, scope: SkillScope, out: &mut Vec<Skill>) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let Ok(content) = fs::read_to_string(path.join("SKILL.md")) else {
            continue;
        };
        let name = frontmatter(&content, "name").unwrap_or_else(|| {
            path.file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .into_owned()
        });
        out.push(Skill {
            name,
            description: frontmatter(&content, "description"),
            kind: SkillKind::Skill,
            scope,
        });
    }
}

/// Extracts a scalar field from a leading `--- ... ---` YAML frontmatter block. Line-based (no
/// YAML dep): good enough for the simple `key: value` frontmatter these files use.
fn frontmatter(content: &str, key: &str) -> Option<String> {
    let mut lines = content.lines();
    if lines.next()?.trim() != "---" {
        return None;
    }
    let prefix = format!("{key}:");
    for line in lines {
        let line = line.trim();
        if line == "---" {
            break;
        }
        if let Some(rest) = line.strip_prefix(&prefix) {
            let value = rest.trim().trim_matches(['"', '\'']).to_string();
            if !value.is_empty() {
                return Some(value);
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn lists_commands_and_skills_with_descriptions() {
        let config = tempdir().unwrap();
        let root = tempdir().unwrap();
        fs::create_dir_all(config.path().join("commands")).unwrap();
        fs::write(
            config.path().join("commands/deploy.md"),
            "---\ndescription: Ship it\n---\nrun the deploy",
        )
        .unwrap();
        fs::create_dir_all(root.path().join(".claude/skills/reviewer")).unwrap();
        fs::write(
            root.path().join(".claude/skills/reviewer/SKILL.md"),
            "---\nname: reviewer\ndescription: Reviews code\n---\n",
        )
        .unwrap();

        let skills = claude_skills(config.path(), &[root.path().to_path_buf()]);
        assert_eq!(skills.len(), 2);
        let deploy = skills.iter().find(|s| s.name == "deploy").unwrap();
        assert_eq!(deploy.kind, SkillKind::Command);
        assert_eq!(deploy.scope, SkillScope::User);
        assert_eq!(deploy.description.as_deref(), Some("Ship it"));
        let reviewer = skills.iter().find(|s| s.name == "reviewer").unwrap();
        assert_eq!(reviewer.kind, SkillKind::Skill);
        assert_eq!(reviewer.scope, SkillScope::Project);
    }

    #[test]
    fn codex_uses_prompts_and_skills_folders() {
        let config = tempdir().unwrap();
        let root = tempdir().unwrap();
        fs::create_dir_all(config.path().join("prompts")).unwrap();
        fs::write(
            config.path().join("prompts/draftpr.md"),
            "---\ndescription: Draft a PR\n---\n",
        )
        .unwrap();
        fs::create_dir_all(config.path().join("skills/lint")).unwrap();
        fs::write(
            config.path().join("skills/lint/SKILL.md"),
            "---\nname: lint\ndescription: Lint the repo\n---\n",
        )
        .unwrap();

        let skills = codex_skills(config.path(), &[root.path().to_path_buf()]);
        let draftpr = skills.iter().find(|s| s.name == "draftpr").unwrap();
        assert_eq!(draftpr.kind, SkillKind::Command);
        assert_eq!(draftpr.description.as_deref(), Some("Draft a PR"));
        let lint = skills.iter().find(|s| s.name == "lint").unwrap();
        assert_eq!(lint.kind, SkillKind::Skill);
    }

    #[test]
    fn finds_project_skills_in_each_selected_folder() {
        let config = tempdir().unwrap();
        let workspace = tempdir().unwrap();
        fs::create_dir_all(workspace.path().join("api/.claude/commands")).unwrap();
        fs::write(workspace.path().join("api/.claude/commands/deploy.md"), "").unwrap();
        fs::create_dir_all(workspace.path().join("web/.claude/commands")).unwrap();
        fs::write(workspace.path().join("web/.claude/commands/build.md"), "").unwrap();

        let roots = vec![workspace.path().join("api"), workspace.path().join("web")];
        let skills = claude_skills(config.path(), &roots);
        assert!(
            skills
                .iter()
                .any(|s| s.name == "deploy" && s.scope == SkillScope::Project)
        );
        assert!(
            skills
                .iter()
                .any(|s| s.name == "build" && s.scope == SkillScope::Project)
        );
    }
}
