---
name: my-to-impl
description: Transition one local project specification from ~/.agents/notes/<project-name>/proposed into implementation and begin implementing it. Dynamically choose between continuing in the current Pi session or creating a Herdr Git worktree and launching a new Pi session forked from the current one. Reuse the current session when it is already in a suitable Herdr worktree.
argument-hint: "[mode=current|worktree] [branch=<branch>] [base=<ref>] [focus=true|false]"
disable-model-invocation: true
---

# My To Impl

Promote exactly one proposed spec into active implementation, then start implementation either in this Pi session or in a new forked Pi session inside a Herdr worktree.

The spec lifecycle transition is:

```text
~/.agents/notes/<project-name>/proposed/<category>/<filename>.md
  -> ~/.agents/notes/<project-name>/implementation/<category>/<filename>.md
```

`<category>` remains one of `architecture`, `bug-fix`, `feature`, or `chore`. Preserve the category and filename.

## Dynamic Parameters

Accept these optional arguments when the user supplies them:

- `mode=current` — move the spec and implement in this Pi session and checkout.
- `mode=worktree` — create a Herdr worktree and start implementation in a new Pi session forked from this session.
- `branch=<branch>` — required for `mode=worktree`; ask when omitted.
- `base=<ref>` — optional worktree base; default to the exact current `HEAD` commit.
- `focus=true|false` — whether to focus the new Herdr agent; default `false`.

Natural-language equivalents are valid. Reject unknown or contradictory values rather than guessing. Arguments settle questions they answer explicitly; ask only for missing decisions.

## Process

### 1. Resolve the project and proposed spec

Derive `<project-name>` consistently across normal checkouts and Git worktrees:

1. Prefer the repository name from `git remote get-url origin`, stripping the path and trailing `.git`.
2. Otherwise use the Git repository root basename.
3. Outside Git, use the current working-directory basename.
4. Replace unsafe directory-name characters with `-` without otherwise renaming the project.

List Markdown files under:

```text
~/.agents/notes/<project-name>/proposed/{architecture,bug-fix,feature,chore}/
```

If the user supplied a path, filename, or topic, use it to select a unique file. If exactly one proposal exists, select it. If several match, show a concise numbered list with title, category, and filename, then ask the user to choose. If none exist, stop without creating an implementation directory.

Resolve the absolute source path and verify it is contained under the expected project `proposed` directory. Read the entire document.

Require frontmatter containing:

```yaml
status: proposed
category: <category>
project: <project-name>
```

The category must match the source parent directory. If metadata and location disagree, stop and ask whether to repair them; do not guess which is authoritative.

### 2. Check implementation readiness

Summarize:

- proposal title and intended outcome,
- acceptance criteria,
- testing decisions,
- unresolved questions or assumptions, and
- relevant out-of-scope boundaries.

If an unresolved question prevents safe implementation, ask for that decision before moving the spec. Keep non-blocking risks in the document. Do not rewrite the proposal into a different plan or silently broaden scope.

### 3. Detect whether this session is already in a Herdr worktree

Check `HERDR_ENV` first:

```bash
test "${HERDR_ENV:-}" = 1
```

If it is `1`, learn the installed Herdr CLI before inspecting the current pane:

```bash
herdr --help
herdr pane
herdr pane current --current
```

Inspect Git identity:

```bash
git rev-parse --show-toplevel
git rev-parse --absolute-git-dir
git rev-parse --path-format=absolute --git-common-dir
git branch --show-current
git rev-parse HEAD
git status --short
```

Treat this as an existing Herdr worktree when:

- `HERDR_ENV=1`,
- the current Herdr pane is inside the resolved repository root,
- the repository corresponds to `<project-name>`, and
- the absolute Git directory differs from the absolute common Git directory, identifying a linked worktree.

A suitable existing worktree must also be on the intended implementation branch rather than detached, `main`, `master`, or an unrelated branch.

When a suitable existing Herdr worktree is detected and no mode was supplied, ask only:

```text
This session is already in Herdr worktree <path> on <branch>. Start implementation in this session? (yes/no)
```

On yes, resolve to `mode=current`. On no, stop and ask what placement the user wants; do not create another worktree automatically. If the user explicitly requested `mode=worktree` despite already being in a suitable Herdr worktree, explain that another worktree is normally unnecessary and require confirmation before creating it.

### 4. Resolve implementation mode

If mode remains unspecified and this session is not already in a suitable Herdr worktree, ask:

```text
Where should implementation start?
1. This Pi session and current checkout
2. A new Herdr worktree with a forked Pi session
```

Do not move the spec until mode and all mode-specific blocking decisions are settled.

## Mode: Current Session

### 5A. Verify the current checkout

Confirm the current repository corresponds to `<project-name>`, then inspect:

```bash
git branch --show-current
git rev-parse HEAD
git status --short
```

If the branch is detached, `main`, `master`, or unrelated to the proposal, report it and ask for confirmation or a branch decision. Do not create a worktree unless the user changes the mode to `worktree`.

If the working tree is dirty, report the changes and ask for confirmation before mixing this implementation with them. Never stash, reset, clean, commit, or discard existing changes automatically.

### 6A. Move the spec transactionally

Compute:

```text
source:      ~/.agents/notes/<project-name>/proposed/<category>/<filename>.md
destination: ~/.agents/notes/<project-name>/implementation/<category>/<filename>.md
```

If the destination exists, stop. Do not overwrite, merge, rename, or create a numbered duplicate; the collision may mean implementation already started.

Create only the destination category directory, move the file, then change exactly:

```yaml
status: proposed
```

to:

```yaml
status: implementation
```

If the status update fails, immediately move the file back to its proposed path and report the failure. Preserve all other content and the filename.

### 7A. Start implementation in this session

Load and follow the available `implement` skill with the absolute implementation spec path as its input. If it is unavailable, follow this minimum contract:

1. Re-read the moved spec.
2. Inspect the current code and revalidate the spec's assumptions.
3. Stop and report if the code invalidates a core decision.
4. Implement only the stated scope.
5. Use test-driven development at the agreed seams where practical.
6. Run focused tests and typechecking regularly, then the full relevant suite.
7. Review the final diff against every acceptance criterion.
8. Run the available code-review workflow.
9. Commit only when authorized or required by the loaded implementation workflow.

Do not end the turn after moving the spec; begin implementation in the current Pi session.

## Mode: New Herdr Worktree and Forked Pi Session

### 5B. Validate prerequisites

Before any Herdr control command:

```bash
test "${HERDR_ENV:-}" = 1
```

If it fails, explain that a Herdr worktree cannot be controlled from outside Herdr and stop with the spec still in `proposed`.

This mode requires a persisted source Pi session:

```bash
test -n "${PI_SESSION_FILE:-}" && test -f "$PI_SESSION_FILE"
```

If unavailable, stop. Do not synthesize or copy session JSONL manually.

Learn current command syntax:

```bash
herdr --help
herdr worktree
herdr agent
```

Do not run bare `herdr`; it launches or attaches the TUI.

Record the repository boundary and existing topology:

```bash
git rev-parse --show-toplevel
git branch --show-current
git rev-parse HEAD
git status --short
git worktree list --porcelain
herdr worktree list --cwd <repo-root>
herdr agent list
```

A new worktree does not inherit uncommitted changes. If the source checkout is dirty, report the changed paths and ask whether branching from clean `HEAD` is correct. Never transfer dirty changes without an explicit user-approved method.

### 6B. Require branch and infer the worktree name

`branch=<branch>` is required. Ask for it if omitted; do not invent the branch from the spec because repositories have different naming policies.

Infer the worktree name from the final non-empty slash-delimited branch segment:

```text
feat/xxx   -> xxx
fix/xxx    -> xxx
u/name/xxx -> xxx
xxx        -> xxx
```

Do not ask separately for a worktree name. Normalize the inferred name for display and Herdr identifiers by replacing unsupported characters with `-` and trimming separators.

Use the inferred name as the Herdr workspace label. Derive a unique agent name such as `impl-<worktree-name>`, lowercase, matching `[a-z][a-z0-9_-]{0,31}`; truncate safely and resolve collisions using `herdr agent list`.

Default the base to the exact recorded source `HEAD`. If `base=<ref>` was supplied, resolve it to a commit before creating anything and report when it differs from the diagnosed/current commit.

If the requested branch or corresponding worktree already exists, do not overwrite or remove it. Ask whether to open the existing worktree, choose another branch, or cancel.

### 7B. Create the Herdr worktree

Keep focus unchanged unless `focus=true`:

```bash
herdr worktree create \
  --cwd <repo-root> \
  --branch <branch> \
  --base <resolved-base-commit> \
  --label <inferred-worktree-name> \
  --no-focus
```

Do not require a separate filesystem path. Let Herdr infer its managed worktree path from the repository and branch unless the user explicitly supplies a path.

Parse the actual worktree path, workspace ID, tab ID, and root pane ID from the JSON response. IDs are opaque; never predict them.

### 8B. Start a new Pi session by forking this session

Verify the returned root pane is an available shell, then pass Pi's native `--fork` argument through Herdr:

```bash
herdr agent start <agent-name> \
  --kind pi \
  --pane <root-pane-id> \
  -- \
  --fork <absolute-PI_SESSION_FILE>
```

This must be a Pi session fork, not a fresh unrelated Pi session. The fork preserves conversation context while setting the new session's `cwd` to the target worktree.

If worktree creation or agent startup fails, leave the spec in `proposed`, preserve any worktree that was created, and report recovery details rather than deleting anything.

### 9B. Move the spec and start implementation in the forked session

Only after the forked Pi agent starts successfully, move the spec to `implementation/<category>` and update its status using the transactional rules from step 6A.

Submit a prompt that starts with the skill command so Pi expands it, followed by the worktree-specific instructions as arguments:

```text
/skill:implement <absolute-implementation-spec-path>

This session was forked into a new implementation worktree. Confirm pwd,
branch, HEAD, and git status; re-read the spec and verify its assumptions
before editing. Stop and report if the target code invalidates a core decision.
```

Send the complete text as one `herdr agent prompt` call without waiting unless the user explicitly requested a wait. If prompt submission fails, keep the spec in `implementation` because the worktree and forked agent exist; report the exact recovery prompt.

If `focus=true`, focus the target agent after successful prompt submission. Otherwise keep it in the background. Do not close the source pane or session.

## Completion Report

Always report:

- selected mode (`current` or `worktree`),
- source and destination spec paths,
- category and title,
- branch and starting commit,
- whether implementation actually began, and
- blockers or changed assumptions.

For an existing Herdr worktree reused in current mode, report its path and that no new worktree or session was created.

For new worktree mode, additionally report:

- requested branch and inferred worktree name,
- actual target worktree path,
- Herdr workspace/tab/pane IDs,
- forked Pi agent name and observed state,
- source Pi session path or ID,
- whether the implementation prompt was accepted, and
- any dirty-state or stale-base warning.

## Safety Rules

- Transition exactly one spec per invocation.
- Never move a spec before mode and blocking decisions are settled.
- Never overwrite a lifecycle destination.
- Never leave frontmatter status intentionally inconsistent with its lifecycle directory.
- Never claim a new worktree contains uncommitted changes from the source checkout.
- Never create a second worktree when the current Pi session is already in a suitable Herdr worktree unless the user explicitly confirms it.
- Never force-create or force-remove a branch or worktree.
- Never delete a worktree, pane, session, or agent to hide a partial failure.
