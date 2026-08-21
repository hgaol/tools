# AGENTS.md

Global instructions, loaded by pi from `~/.pi/agent/AGENTS.md` (symlinked to
`agents/AGENTS.md` in the `tools` repository, which is the source of truth).

Edit the file in the repository, not the symlink target.

## Git

- Commit messages: short imperative summary, lowercase, no trailing period
  (e.g. `add dynamic implementation session modes`).
- Default: never mention AI, models, assistants, or generation tooling in commit
  messages, commit trailers, branch names, PR titles/descriptions, or code
  comments. No `Co-authored-by:` or `Generated with` lines.
- Repo policy wins. If the repository documents its own attribution or trailer
  policy — in `AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md`, `.github/`, a commit
  template, or a commit hook — follow that policy instead of the default above,
  including when it requires a `Co-authored-by:` or tooling trailer.
- Check for such a policy before the first commit in an unfamiliar repository.
  Recent history (`git log`) is evidence of convention, not policy; prefer a
  documented rule, and ask when documentation and history disagree.
- One logical change per commit. Changes that must stay consistent with each
  other belong in the same commit.
- Never commit without being asked. Never force-push, amend published commits,
  reset, stash, or clean a dirty working tree without explicit instruction.
- Never commit notes from the personal notes root (`$AGENTS_MY_NOTES`, default
  `~/.agents/notes`) into a code repository.

## Working Style

- Be concise. Report what changed and where, not how hard it was.
- Read a file before editing it. Prefer targeted edits over rewrites.
- State stop conditions: halt and ask instead of guessing branch policy, issue
  numbers, filenames, or user decisions.
- Do not add dependencies, tooling, or scaffolding that was not requested.
- Do not expose secrets, credentials, or tokens in files or output.

## Personal Skills

Personal skills live in the `tools` repository and are loaded in place via the
`skills` entry in `~/.pi/agent/settings.json`:

```text
<tools-repo>/agents/skills/<skill-name>/SKILL.md
```

Do not copy or symlink them into `~/.agents/skills`.

### Notes Root

All personal notes live under one root:

- `$AGENTS_MY_NOTES` when set and valid, otherwise `~/.agents/notes`.
- Valid means: non-empty, absolute after expanding a leading `~/`, and either an
  existing directory or a missing directory whose parent exists.
- On an invalid value, report it once and fall back to the default. Never write
  outside the resolved root.

### Spec Lifecycle

The `my-to-spec`, `my-to-impl`, and `my-to-archived` skills move one Markdown
spec through:

```text
<notes-root>/<project-name>/{proposed,implementation,archived}/<category>/<file>.md
```

- Categories are exactly `architecture`, `bug-fix`, `feature`, `chore`.
- `<project-name>` is derived from the `origin` remote, then the repository root
  basename, then the cwd basename, so worktrees share one notes directory.
- Frontmatter `status` must always match the lifecycle directory.
- Never overwrite a lifecycle destination; a collision means work already exists.
- Never move a spec between different notes roots.

### Documentation Notes

The `my-to-doc` skill writes reference, how-to, explanation, and investigation
notes to:

```text
<notes-root>/<project-name>/docs/<topic>.md
```

These are living documents outside the spec lifecycle: no status, no category
directories, no date prefix. A note on an existing topic is updated in place.

## Authoring Skills

Applies when creating or editing a `SKILL.md`.

### Naming

- Directory name, `name` frontmatter, and the `#` heading must agree.
- Kebab-case directory names; personal lifecycle skills use the `my-` prefix.
- The heading is the title-cased name (`my-to-impl` -> `My To Impl`).

### Frontmatter

Required:

- `name` — matches the directory name.
- `description` — one paragraph, third person, stating what the skill does *and*
  when to use it. It is the only text the model sees before loading the file, so
  make trigger conditions and hard requirements explicit.

Optional, only when they apply:

- `disable-model-invocation: true` — skills the user must invoke explicitly.
- `argument-hint` — e.g. `"[mode=current|worktree] [branch=<branch>]"`.
- `compatibility` — external prerequisites (Git worktrees, Pi, Herdr, `HERDR_ENV=1`).

### Body

Write instructions for an agent, not prose for a human reader:

1. The outcome, and what the skill explicitly does *not* do.
2. Inputs and parameters, including which must be asked for.
3. A numbered `## Process` with `###` steps in execution order.
4. Templates in fenced blocks.
5. A completion report section listing exactly what to report back.
6. A `## Safety Rules` list for destructive or stateful skills.

Style: imperative voice; commands in `bash` fences; paths and patterns in `text`
fences; `<placeholder>` for substitutions, noting when angle brackets are not
literal.

### Editing Existing Skills

- Read the whole `SKILL.md` first; steps depend on earlier steps.
- Keep the frontmatter `description` in sync with behavior changes.
- When a rule is duplicated across skills on purpose (notes-root resolution,
  project-name derivation, category list, status values), change every copy in
  the same commit.
- Never silently relax a safety rule.
