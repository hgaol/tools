---
name: my-to-doc
description: Capture durable project documentation from the current conversation into <notes-root>/<project-name>/docs, where <notes-root> is $AGENTS_MY_NOTES when set and valid and ~/.agents/notes otherwise. Use when the user wants an explanation, reference, how-to, or investigation write-up preserved as a local note instead of a lifecycle spec, without publishing it to a repository or issue tracker.
disable-model-invocation: true
---

# My To Doc

Turn the current conversation and existing codebase understanding into one durable documentation note. Do not interview the user or reopen settled discussion; synthesize what is already known and mark what remains unverified.

This skill writes documentation only. Do not implement anything, modify the repository, create tickets, or publish externally.

Documentation notes are not lifecycle specs. They have no `proposed`, `implementation`, or `archived` state, no category directories, and no acceptance criteria. If the conversation produced a change to be built, use `my-to-spec` instead.

## Notes Root

All note paths in this skill are relative to `<notes-root>`.

Resolve `<notes-root>` before touching the filesystem:

1. Read `AGENTS_MY_NOTES` from the environment.
2. Use it when valid; otherwise use the default `~/.agents/notes`.

```bash
printf '%s\n' "${AGENTS_MY_NOTES:-}"
```

`AGENTS_MY_NOTES` is valid only when, after trimming surrounding whitespace, it:

- is non-empty,
- is absolute after expanding a leading `~/`, rejecting relative paths and bare `~user` forms,
- contains no unexpanded variable reference or command substitution, and
- either already exists as a directory, or does not exist while its parent directory exists so a single directory can be created.

If the value is set but invalid, report the exact value and the reason once, then fall back to `~/.agents/notes`. Never create a nested directory tree to satisfy a malformed value, and never write outside the resolved root.

Use one resolved root for the entire invocation and report absolute paths.

## Output Location

Write exactly one Markdown file under:

```text
<notes-root>/<project-name>/docs/<topic>.md
```

There are no category subdirectories. Unlike lifecycle specs, documentation notes are living documents identified by topic rather than by date, so an existing note on the same topic is updated in place rather than duplicated.

## Process

### 1. Gather only existing context

Use:

- the current conversation,
- conclusions and explanations already established,
- codebase facts, diagnostics, and command output already observed, and
- domain terminology already agreed in context.

Do not conduct a new interview. Do not start broad repository exploration merely to make the note look complete. Perform only focused checks needed to identify the repository or avoid recording a factual error.

Distinguish clearly between:

- verified facts, with how they were verified,
- reasonable inferences, and
- assumptions or unknowns.

Never invent behavior, flags, paths, or APIs to fill a template.

### 2. Derive the project name

Derive `<project-name>` consistently across normal checkouts and Git worktrees:

```bash
git remote get-url origin
git rev-parse --show-toplevel
```

1. Prefer the repository name from the `origin` remote, stripping the path and trailing `.git`.
2. Otherwise use the Git repository root basename.
3. Outside Git, use the current working-directory basename.
4. Replace runs of characters outside letters, digits, `.`, `_`, and `-` with `-`, then trim leading and trailing separators.

Do not use a feature-worktree directory name when the canonical repository name is available, so worktrees share one notes directory.

### 3. Choose the document type and topic

Choose exactly one `doc-type`:

- `reference` — how something behaves: interfaces, configuration, commands, data shapes, environment.
- `how-to` — a repeatable procedure to accomplish a task.
- `explanation` — why something is the way it is: architecture, tradeoffs, mental model.
- `investigation` — what was found while diagnosing a problem, including evidence and dead ends.

For mixed content, classify by what a future reader will search for. Split into separate notes only when the user asks for more than one.

Derive a concise kebab-case topic slug describing the subject, not the moment:

```text
herdr-pane-lifecycle.md
pi-context-file-loading.md
```

Do not date-prefix the filename.

### 4. Handle an existing note on the same topic

List existing notes before writing:

```text
<notes-root>/<project-name>/docs/
```

If a note with the same topic exists, read it and update it in place: preserve its `created` date and still-accurate content, revise what changed, and set `updated` to today. Report which sections changed.

If a closely related but distinct note exists, either extend that note or create a new one with a more specific slug, and cross-link them under `## Related Notes`. Never silently overwrite a note about a different subject; when the slug collides but the subject differs, choose a more specific slug instead.

### 5. Write the note

Create the `docs` directory if needed and write the document using the template below. Omit sections that are truly irrelevant rather than padding them, but always include Summary, Scope, and Facts and Assumptions.

<doc-template>

---
title: <Concise document title>
doc-type: <reference|how-to|explanation|investigation>
project: <project-name>
created: <YYYY-MM-DD>
updated: <YYYY-MM-DD>
source: conversation
---

# <Concise document title>

## Summary

Three sentences at most. What this note covers and who needs it.

## Scope

What this note does and does not cover, and the versions, branches, commits, or environments the content was observed against.

## Context

Why this note exists and the situation that produced it. Keep it short for `reference` notes and substantive for `investigation` notes.

## <Body>

Structure the body by document type:

- `reference` — organized sections per interface, option, path, or behavior, with exact names and observed values.
- `how-to` — numbered steps with commands, expected output, and verification.
- `explanation` — the mental model first, then the reasoning, constraints, and rejected alternatives.
- `investigation` — symptom, evidence gathered, root cause when known, what was ruled out, and current status.

Use exact identifiers, paths, and commands. Prefer short fenced examples over long transcripts. Include the command used to verify a claim when the claim is easy to doubt.

## Facts and Assumptions

Separate explicitly:

- **Verified** — what was observed, and how.
- **Inferred** — what follows from the evidence but was not directly observed.
- **Unknown** — what remains unchecked, and what would settle it.

## Gotchas

Non-obvious failure modes, ordering requirements, and mistakes already made in this conversation that a future reader should avoid.

## Related Notes

Links to sibling notes and to specs under `proposed`, `implementation`, or `archived` that this note supports. Use paths relative to the project notes directory.

## Maintenance

What would make this note stale, so a future reader knows when to distrust it.

</doc-template>

### 6. Review before saving

Check that the note:

- states facts that were actually established, not plausible ones,
- uses the project's domain vocabulary,
- separates verified content from inference and unknowns,
- contains no secrets, credentials, tokens, or unnecessary personal information,
- avoids transient conversational framing such as "as we discussed", and
- stands alone for a future reader who does not have this conversation.

### 7. Report completion

Report:

- the absolute file path,
- whether a note was created or an existing note updated, and which sections changed,
- the chosen `doc-type` and a one-line reason,
- the title, and
- anything recorded as unknown or unverified.

Do not paste the whole note into the response unless asked. Do not claim the documentation was published; it is a local note.

## Safety Rules

- Write exactly one note per invocation.
- Never write outside the resolved `<notes-root>`.
- Never overwrite a note about a different subject.
- Never delete or truncate existing note content that remains accurate.
- Never record credentials or private tokens.
- Never modify repository files, branches, worktrees, or trackers.
