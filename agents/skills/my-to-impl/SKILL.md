---
name: my-to-impl
description: Transition one local project specification from ~/.agents/notes/<project-name>/proposed into implementation and begin implementing it. Always decide explicitly whether to work in the current checkout or create a dedicated Git worktree; when requested, use Herdr to create the worktree, launch a fresh Pi agent, and start implementation there.
disable-model-invocation: true
---

# My To Impl

Promote exactly one proposed spec into active implementation, then start the implementation rather than stopping after the file move.

The spec lifecycle is:

```text
~/.agents/notes/<project-name>/proposed/<category>/<filename>.md
  -> ~/.agents/notes/<project-name>/implementation/<category>/<filename>.md
```

`<category>` must remain one of `architecture`, `bug-fix`, `feature`, or `chore`. Preserve the category and filename during the move.

## Process

### 1. Resolve the project and proposed spec

Derive `<project-name>` the same way across normal checkouts and Git worktrees:

1. Prefer the repository name from `git remote get-url origin`, stripping the path and trailing `.git`.
2. Otherwise use the Git repository root basename.
3. Outside Git, use the current working-directory basename.
4. Replace unsafe directory-name characters with `-` without otherwise renaming the project.

List Markdown files under:

```text
~/.agents/notes/<project-name>/proposed/{architecture,bug-fix,feature,chore}/
```

If the user supplied a path, filename, or topic as an argument, use it to select a unique file. If exactly one proposal exists, select it. If several match, show a concise numbered list containing title, category, and filename, then ask the user to choose. If none exist, stop without creating an empty implementation directory.

Resolve the absolute source path and verify that it is contained under the expected project `proposed` directory. Read the entire document before continuing.

Require frontmatter containing:

```yaml
status: proposed
category: <category>
project: <project-name>
```

The frontmatter category must match the source parent directory. If metadata or location is inconsistent, stop and ask whether to repair it; do not guess which state is authoritative.

### 2. Check implementation readiness

Summarize:

- proposal title,
- intended outcome,
- acceptance criteria,
- testing decisions,
- unresolved questions or assumptions, and
- relevant out-of-scope boundaries.

If an unresolved question prevents safe implementation, ask for that decision before moving the spec. Non-blocking risks can remain recorded in the spec.

Do not rewrite the proposal into a new plan or silently broaden scope.

### 3. Ask about worktree placement

Always ask this explicit question unless the user's invocation already answered it unambiguously:

```text
Create a dedicated Herdr worktree for this implementation? (yes/no)
```

Do not move the spec until this placement decision and any required branch decision are settled.

## Current-Checkout Path

Use this path when the answer is no.

### 4A. Verify the current checkout

Confirm the current repository corresponds to `<project-name>`, then inspect:

```bash
git branch --show-current
git rev-parse HEAD
git status --short
```

If the working tree is dirty, report the changes and ask for confirmation before mixing this implementation with them. Never stash, reset, clean, commit, or discard existing changes automatically.

### 5A. Move the spec transactionally

Compute:

```text
source:      ~/.agents/notes/<project-name>/proposed/<category>/<filename>.md
destination: ~/.agents/notes/<project-name>/implementation/<category>/<filename>.md
```

If the destination already exists, stop. Do not overwrite, merge, rename, or create a numbered duplicate automatically; the collision may mean implementation already started.

Create only the destination category directory, move the file, then change exactly:

```yaml
status: proposed
```

to:

```yaml
status: implementation
```

If the status update fails, immediately move the file back to its original proposed path and report the failure. Preserve all other content and the original filename.

### 6A. Start implementation in the current agent

Load and follow the available `implement` skill using the absolute implementation spec path as its input. If that skill is unavailable, follow this minimum contract:

1. Re-read the implementation spec from its new path.
2. Inspect the current code and verify the spec's assumptions.
3. Stop and report if the code invalidates a core decision.
4. Implement only the stated scope.
5. Use test-driven development at the agreed seams where practical.
6. Run focused tests and typechecking regularly, then the full relevant suite at the end.
7. Review the final diff against every acceptance criterion.
8. Run the available code-review workflow.
9. Commit only the implementation changes when the user has authorized commits or the loaded implementation workflow requires one.

Do not end the turn after moving the spec; begin implementation.

## Herdr Worktree Path

Use this path when the answer is yes.

### 4B. Verify Herdr and Git

Before any Herdr control command:

```bash
test "${HERDR_ENV:-}" = 1
```

If this fails, explain that a Herdr worktree cannot be controlled from outside a Herdr-managed pane and stop with the spec still in `proposed`.

The installed Herdr CLI is authoritative. Inspect it before mutation:

```bash
herdr --help
herdr worktree
herdr agent
```

Do not run bare `herdr`; it launches or attaches the TUI.

Record the repository root, current branch, exact `HEAD`, status, and existing worktrees:

```bash
git rev-parse --show-toplevel
git branch --show-current
git rev-parse HEAD
git status --short
git worktree list --porcelain
herdr worktree list --cwd <repo-root>
herdr agent list
```

A new worktree does not inherit uncommitted changes. If the source checkout is dirty, report that fact and ask whether branching from clean `HEAD` is correct. Never transfer dirty changes without an explicit user-approved method.

Ask for or confirm:

- feature branch name,
- base ref, defaulting to the exact recorded `HEAD` commit,
- optional worktree path, and
- whether the new agent should remain in the background or receive focus.

Suggest a branch derived from the spec topic, but respect repository branch conventions and do not create it until confirmed. Derive a short unique Herdr agent name matching `[a-z][a-z0-9_-]{0,31}`.

### 5B. Create the worktree and Pi agent

If the branch or path already exists, do not overwrite or remove it. Ask whether to open the existing worktree, choose another location, or cancel.

Create the worktree without stealing focus by default:

```bash
herdr worktree create \
  --cwd <repo-root> \
  --branch <feature-branch> \
  --base <exact-base-commit> \
  --label <feature-branch> \
  --no-focus
```

Add `--path <requested-path>` only when explicitly selected. Parse the actual worktree path, workspace ID, tab ID, and root pane ID from the JSON response; never predict identifiers.

Verify the returned root pane is an available shell, then start a fresh Pi agent there:

```bash
herdr agent start <agent-name> --kind pi --pane <root-pane-id>
```

`agent start` does not create layout. If worktree creation or agent startup fails, leave the spec in `proposed`, preserve any worktree that was created, and report recovery details rather than deleting anything.

### 6B. Move the spec and start remote implementation

Only after the target Pi agent starts successfully, move the spec from `proposed/<category>` to `implementation/<category>` using the transactional status-update rules from step 5A.

Then submit this through the Herdr agent surface without waiting unless the user asked to wait:

```text
/skill:implement <absolute-implementation-spec-path>
```

Use:

```bash
herdr agent prompt <agent-name> "/skill:implement <absolute-implementation-spec-path>"
```

If prompt submission fails, keep the spec in `implementation` because the worktree and implementation agent exist; report the exact recovery command. Inspect blocked or unknown states with `herdr agent get` and `herdr agent read` before sending further input.

Focus the target only if requested. Do not close the source pane or any created workspace.

## Completion Report

For current-checkout implementation, report:

- source and destination spec paths,
- category and title,
- branch and starting commit,
- whether implementation actually began, and
- blockers or assumption changes.

For Herdr implementation, additionally report:

- target branch and worktree path,
- Herdr workspace/tab/pane IDs,
- target agent name and observed state,
- whether the implementation prompt was accepted, and
- any dirty-state or stale-base warning.

## Safety Rules

- Transition exactly one spec per invocation.
- Never move a spec before placement and blocking decisions are settled.
- Never overwrite a lifecycle destination.
- Never leave frontmatter status intentionally inconsistent with its lifecycle directory.
- Never claim a worktree contains uncommitted changes from another checkout.
- Never force-create or force-remove a branch or worktree.
- Never delete a worktree or agent to hide a partial failure.
