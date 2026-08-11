---
name: my-fork-herdr-worktree
description: Promote the current persisted Pi diagnostic session into a dedicated Git feature worktree and launch a forked Pi agent there through Herdr. Use when investigation started on main or master, the user decides the fix should become a PR, and they want to preserve the diagnostic context while moving implementation into an isolated worktree.
compatibility: Requires Git worktrees, Pi, the Herdr CLI, and execution inside a Herdr-managed pane with HERDR_ENV=1.
---

# My Fork Herdr Worktree

Move a diagnosed task from the base worktree into a PR implementation worktree without losing Pi session context.

Treat this as a context promotion, not a filesystem transfer:

- Keep the source worktree and diagnostic session intact.
- Create the feature branch from the exact diagnosed commit by default.
- Fork the persisted Pi session into the target worktree with `pi --fork`.
- Make the target agent re-read the repository before editing.
- Never assume uncommitted source-worktree changes exist in the target.

## Inputs

Collect or derive:

- **Branch name**: required; ask if the user did not provide one.
- **Base ref**: default to the source worktree's exact `HEAD` commit, not a moving branch name.
- **Worktree path**: optional; let Herdr choose unless the user specifies one.
- **Agent name**: derive a short unique name from the branch, matching `[a-z][a-z0-9_-]{0,31}`.
- **Next action**: either launch the target Pi idle, or submit an implementation prompt when the user explicitly asked it to continue.

Do not guess issue numbers, branch policy, or whether existing dirty changes should be transferred.

## Procedure

### 1. Verify the environment

Before any Herdr control command:

```bash
test "${HERDR_ENV:-}" = 1
```

If this fails, say that the current agent is not running inside Herdr and stop. Do not control a focused Herdr session from outside Herdr.

Confirm this is a persisted Pi session and a Git repository:

```bash
test -n "${PI_SESSION_FILE:-}" && test -f "$PI_SESSION_FILE"
git rev-parse --show-toplevel
git rev-parse HEAD
git status --short
git worktree list --porcelain
```

If `PI_SESSION_FILE` is unavailable, stop and explain that `pi --fork` needs a persisted source session. Do not copy or synthesize session JSONL manually.

If the source worktree is dirty, report the changed paths and ask whether to:

1. leave them behind and branch from `HEAD`,
2. commit them first,
3. transfer an explicit patch, or
4. cancel.

Never silently carry, discard, stash, commit, or patch dirty changes.

### 2. Learn the installed Herdr CLI

The installed binary is authoritative. Inspect syntax before mutation:

```bash
herdr --help
herdr worktree
herdr agent
```

Do not run bare `herdr`; it launches or attaches the TUI. Do not probe a mutating nested command by omitting arguments.

Use explicit caller context or IDs. Do not rely on another client's focused pane.

### 3. Fix the promotion boundary

Record:

- source repository root,
- source worktree path,
- source branch,
- exact source `HEAD` commit,
- absolute `PI_SESSION_FILE`, and
- requested feature branch.

Default the worktree base to the recorded commit. If the user instead requests current `main`, `master`, or another moving ref, honor it but state that the target agent must revalidate the diagnosis against potentially newer code.

Before creating anything, present a compact plan containing the source session, branch, base commit, and requested path. Ask for confirmation when the branch/base decision was not already explicit in the user's request.

### 4. Create the Herdr worktree

First inspect existing Herdr worktrees and live agents:

```bash
herdr worktree list --cwd <repo-root>
herdr agent list
```

If the requested branch or path already exists, do not remove or overwrite it. Report the collision and ask whether to open the existing worktree, choose another branch/path, or cancel.

Create a background worktree workspace, keeping the user's current focus unless they explicitly requested otherwise:

```bash
herdr worktree create \
  --cwd <repo-root> \
  --branch <feature-branch> \
  --base <recorded-base-commit> \
  --label <feature-branch> \
  --no-focus
```

Add `--path <requested-path>` only when the user supplied a path.

Read the actual worktree path, workspace ID, and root pane ID from the JSON response. IDs are opaque; never predict them from examples or sidebar order.

### 5. Start a forked Pi agent in the target pane

Verify the returned root pane is an available shell pane, then start Pi with the source session passed as a native Pi argument:

```bash
herdr agent start <agent-name> \
  --kind pi \
  --pane <root-pane-id> \
  -- \
  --fork <absolute-source-session-file>
```

`herdr agent start` does not create layout, so always use the pane returned by worktree creation. Read the returned state instead of assuming startup succeeded.

Do not use interactive `/fork` in the source Pi for this transition: `/fork` keeps the current working directory. Starting Pi from the target worktree with `--fork` creates a new session whose `cwd` is the target while retaining the source history and `parentSession` lineage.

### 6. Revalidate before implementation

If the user asked only to open the continuation agent, leave it idle and report how to focus it.

If the user explicitly asked the target agent to continue implementation, submit a prompt through the Herdr agent surface. Prefix the requested work with this handoff contract:

```text
This Pi session was forked from a diagnostic session in another worktree.

Source worktree: <source-path>
Source commit: <source-commit>
Target worktree: <target-path>
Target branch: <feature-branch>

Treat the inherited history as diagnostic evidence, not proof of the current
filesystem state. Before editing:

1. Confirm pwd, branch, HEAD, and git status.
2. Re-read the relevant files and verify that the diagnosis still applies.
3. Report material differences from the diagnostic context.
4. Do not assume uncommitted changes from the source worktree are present.

If the diagnosis still holds, implement the smallest root-cause fix, add or
update regression coverage, run the relevant checks, inspect the final diff,
and prepare a concise PR summary. Stop and report instead of forcing the old
plan if the target code invalidates the diagnosis.
```

Use:

```bash
herdr agent prompt <agent-name> <combined-handoff-and-user-request>
```

Keep this asynchronous unless the user explicitly asks to wait. If waiting is requested, use `--wait` with an appropriate timeout. If the agent becomes `blocked` or a wait fails, inspect it with `herdr agent get` and `herdr agent read` before sending input.

### 7. Report the result

Return:

- source session path or ID,
- source and target commits,
- feature branch,
- target worktree path,
- Herdr workspace/pane IDs,
- target agent name and observed state,
- whether an implementation prompt was submitted, and
- any dirty-state, stale-base, startup, or revalidation warning.

Do not close or remove the source pane, source worktree, target workspace, or target agent. If worktree creation succeeds but agent startup fails, preserve the worktree and report recovery information rather than deleting it.

## Safety Rules

- Never implement the PR in the diagnostic base worktree as part of this skill.
- Never force-create, force-remove, reset, clean, stash, commit, or delete work without explicit user approval.
- Never claim filesystem changes transferred merely because session history transferred.
- Never skip target-worktree revalidation.
- Prefer the exact diagnosed commit as the base for reproducibility.
- Keep background creation unfocused by default.
- Parse every Herdr identifier from command JSON.
