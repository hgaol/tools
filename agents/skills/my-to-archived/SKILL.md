---
name: my-to-archived
description: Archive one local project specification by moving it from ~/.agents/notes/<project-name>/implementation to the matching archived category after implementation is complete or the user explicitly chooses to close it. Use when active implementation work should leave the implementation queue while preserving the spec as durable history.
disable-model-invocation: true
---

# My To Archived

Transition exactly one implementation spec into the archived state.

The lifecycle transition is:

```text
~/.agents/notes/<project-name>/implementation/<category>/<filename>.md
  -> ~/.agents/notes/<project-name>/archived/<category>/<filename>.md
```

`<category>` must remain one of `architecture`, `bug-fix`, `feature`, or `chore`. Preserve the category and filename.

This skill archives the spec document only. It does not delete branches or worktrees, stop Herdr agents, merge code, create releases, or modify issue trackers.

## Process

### 1. Resolve the project and implementation spec

Derive `<project-name>` consistently across checkouts and worktrees:

1. Prefer the repository name from `git remote get-url origin`, stripping the path and trailing `.git`.
2. Otherwise use the Git repository root basename.
3. Outside Git, use the current working-directory basename.
4. Replace unsafe directory-name characters with `-` without otherwise renaming the project.

List Markdown files under:

```text
~/.agents/notes/<project-name>/implementation/{architecture,bug-fix,feature,chore}/
```

If the user supplied a path, filename, or topic as an argument, use it to select a unique file. If exactly one implementation spec exists, select it. If several match, show a concise numbered list containing title, category, and filename, then ask the user to choose. If none exist, stop without creating an empty archive directory.

Resolve the absolute source path and verify that it is contained under the expected project `implementation` directory. Read the entire document.

Require frontmatter containing:

```yaml
status: implementation
category: <category>
project: <project-name>
```

The frontmatter category must match the source parent directory. If metadata or location is inconsistent, stop and ask whether to repair it rather than guessing.

### 2. Check archive readiness

Summarize the proposal title and inspect:

- acceptance criteria,
- testing decisions and any recorded results,
- unresolved risks or open questions,
- implementation state reflected in the current conversation, and
- whether the work is complete, superseded, abandoned, or otherwise intentionally closed.

If acceptance criteria remain unchecked, verification is missing, or the conversation indicates active work remains, report that evidence and ask for explicit confirmation before archiving. Do not mark criteria complete merely because the user invoked this skill.

Archiving is still allowed for superseded or abandoned work when the user explicitly confirms closure. Preserve that disposition if it is already documented; do not invent a completion claim.

### 3. Move the spec transactionally

Compute:

```text
source:      ~/.agents/notes/<project-name>/implementation/<category>/<filename>.md
destination: ~/.agents/notes/<project-name>/archived/<category>/<filename>.md
```

If the destination already exists, stop. Do not overwrite, merge, rename, or create a numbered duplicate automatically; the collision may indicate the spec was already archived.

Create only the destination category directory, move the file, then change exactly:

```yaml
status: implementation
```

to:

```yaml
status: archived
```

If the status update fails, immediately move the file back to its original implementation path and report the failure. Preserve all other content and the original filename.

Do not modify repository files as part of this transition.

### 4. Report completion

Report:

- source and destination paths,
- category and proposal title,
- why it was considered ready to archive,
- whether any acceptance criteria or questions remain open, and
- whether the archive represents completion, supersession, abandonment, or another user-confirmed disposition.

Do not paste the entire document unless asked.

## Safety Rules

- Transition exactly one spec per invocation.
- Never archive active work silently.
- Never overwrite an existing archived spec.
- Never leave frontmatter status intentionally inconsistent with its lifecycle directory.
- Never claim implementation or verification completed without evidence.
- Never delete or modify Git branches, worktrees, commits, Herdr panes, or agents.
- Never publish or remove external tracker items.
