---
name: my-to-spec
description: Synthesize the solution already developed in the current conversation into a durable proposed Markdown specification under <notes-root>/<project-name>/proposed, where <notes-root> is $AGENTS_MY_NOTES when set and valid and ~/.agents/notes otherwise. Use when the user wants to capture an agreed architecture change, bug fix, feature, or chore as a local spec without publishing to an issue tracker or interviewing them again.
disable-model-invocation: true
---

# My To Spec

Turn the current conversation and existing codebase understanding into one proposed specification. Do not interview the user or reopen settled decisions; synthesize what is already known and record unresolved points explicitly.

This skill writes documentation only. Do not implement the solution, modify the repository, create tickets, or publish to an issue tracker.

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
<notes-root>/<project-name>/proposed/<category>/<filename>.md
```

Choose one category:

- `architecture` — module boundaries, interfaces, system structure, data flow, platform decisions, or broad refactoring whose primary outcome is architectural.
- `bug-fix` — correction of observed incorrect behavior, including root cause and regression prevention.
- `feature` — new or expanded user-visible or operator-visible capability.
- `chore` — maintenance, dependency work, tooling, documentation, cleanup, or operational housekeeping without a primary new behavior.

For mixed work, classify by the primary user outcome. A feature that requires architectural changes belongs in `feature`; use `architecture` only when the architecture itself is the main proposed outcome.

## Process

### 1. Gather only existing context

Use:

- the current conversation,
- decisions already made,
- evidence and constraints already discovered,
- prototypes, plans, diagnostics, or codebase facts already discussed, and
- existing domain terminology or ADR conclusions already known in context.

Do not conduct a new interview. Do not ask the user to repeat information. Do not start broad repository exploration merely to make the document look more complete. If a small check is necessary to identify the repository or avoid a factual error, perform only that focused check.

Distinguish clearly between:

- confirmed facts,
- agreed decisions,
- proposed behavior, and
- unresolved questions or assumptions.

Never invent requirements to fill a template.

### 2. Derive the project name

Prefer the repository name from the `origin` remote so Git worktrees share the same notes directory:

```bash
git remote get-url origin
git rev-parse --show-toplevel
```

Strip the remote path and trailing `.git` to obtain `<project-name>`. If there is no usable origin, use the Git repository root basename. If not in a Git repository, use the current working-directory basename.

Normalize only characters unsafe for a directory name: replace runs outside letters, digits, `.`, `_`, and `-` with `-`, and trim leading or trailing separators. Do not use the feature-worktree directory name when the canonical repository name is available.

### 3. Choose category and filename

Choose the category using the definitions above without asking the user unless the conversation genuinely contains multiple independent solutions that require separate documents.

Derive a concise kebab-case topic slug from the problem or solution. Use this filename pattern:

```text
<YYYY-MM-dd-topic>.md
```

`YYYY` is the four-digit year, `MM` is the two-digit month, `dd` is the two-digit day, and `topic` is the kebab-case topic slug. The angle brackets describe the pattern and are not part of the filename. For example:

```text
2026-08-12-persist-diagnostic-session.md
```

Use the local calendar date. Keep the topic specific enough to distinguish the proposal from other work in the same project.

Never overwrite an existing proposal silently. If the path exists, add `-2`, `-3`, and so on before `.md`, unless the user explicitly requested updating a particular existing spec.

### 4. Write the specification

Create the category directory if needed and write the document using the template below. Omit sections that are truly irrelevant rather than filling them with generic prose, but always include Problem Statement, Proposed Solution, Scope, Acceptance Criteria, Testing Decisions, and Out of Scope.

<spec-template>

---
title: <Concise proposal title>
status: proposed
category: <architecture|bug-fix|feature|chore>
project: <project-name>
created: <YYYY-MM-DD>
source: conversation
---

# <Concise proposal title>

## Problem Statement

Describe the problem from the affected user's, developer's, or operator's perspective. Include the observed impact and why the current behavior is insufficient.

## Context and Evidence

Summarize the relevant current behavior, diagnostic evidence, constraints, and prior decisions already established in the conversation. For bug fixes, state the root cause when known. Mark unverified assumptions as assumptions.

## Proposed Solution

Explain the agreed solution from the user's perspective first, then describe the technical approach at the level needed to preserve the decision.

## Scope

List what this proposal changes. Prefer capabilities, module responsibilities, interfaces, schemas, and interactions over a file-by-file implementation checklist.

## User Stories

For user-facing features, include a numbered list in this form:

1. As a <actor>, I want <capability>, so that <benefit>.

For architecture, bug-fix, or chore proposals, include this section only when user stories clarify the outcome.

## Implementation Decisions

Record decisions already made, including relevant:

- module responsibilities and boundaries,
- interfaces or contracts,
- state and data flow,
- schema or API behavior,
- compatibility and migration strategy,
- failure handling and observability, and
- security or operational constraints.

Do not present undecided ideas as decisions. Avoid brittle file paths and full code snippets. Exception: include a short decision-rich prototype fragment when prose would lose important state-machine, schema, reducer, or type-shape semantics; label it as originating from a prototype.

## Acceptance Criteria

Use observable, verifiable statements:

- [ ] <Externally visible behavior or invariant>
- [ ] <Failure or edge-case behavior>
- [ ] <Compatibility or operational requirement>

Acceptance criteria must describe completion, not implementation activity.

## Testing Decisions

Describe the highest practical test seam, externally observable behaviors to cover, regression coverage, important edge cases, and relevant prior-art test patterns already identified in the conversation. Prefer existing seams over introducing new ones. Do not prescribe tests of private implementation details.

## Risks and Open Questions

List unresolved decisions, assumptions needing validation, rollout concerns, and meaningful failure modes. If none remain, say `None identified from the current conversation.`

## Out of Scope

State explicit exclusions and tempting adjacent work that should not be included in this proposal.

## Further Notes

Capture useful context that does not belong elsewhere, including links or references already present in the conversation.

</spec-template>

### 5. Review before saving

Check that the document:

- preserves the solution and rationale from the conversation,
- uses the project's domain vocabulary,
- separates decisions from assumptions,
- contains testable acceptance criteria,
- does not invent requirements,
- does not expose secrets, credentials, private tokens, or unnecessary personal information,
- lives inside the resolved `<notes-root>`,
- avoids transient implementation detail unless it encodes an important decision, and
- stands alone for a future reader who does not have the conversation.

### 6. Report completion

After writing, report:

- the absolute file path,
- the chosen category and a one-line reason,
- the proposal title, and
- any open questions captured in the document.

Do not paste the entire spec into the response unless the user asks. Do not claim the proposal was published; it is a local proposed note.
