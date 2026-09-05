# pi-copilot-pat

Use GitHub Copilot from pi with a **fine-grained personal access token**, and see only the
models that token can actually use.

## Install

```bash
pi install npm:pi-copilot-pat                          # from npm
pi install git:github.com/<user>/pi-copilot-pat@v0.1.0 # from git, pinned to a tag
pi install /path/to/pi-copilot-pat                     # from a local checkout
```

Add `-l` to install into project scope (`.pi/settings.json`) instead of user scope. Try it
without installing:

```bash
pi -e /path/to/pi-copilot-pat/index.ts
```

Then point pi at Copilot and confirm with `/copilot-pat`:

```bash
pi --provider github-copilot
```

No build step and no runtime dependencies -- pi loads `index.ts` directly, and the two pi
packages it imports are supplied by pi's own extension loader.

Requires pi >= 0.84 and a GitHub account with an active Copilot subscription or seat.

## The problem

pi's built-in `github-copilot` provider is written for the OAuth device flow. It trades a
`gho_…` token at `api.github.com/copilot_internal/v2/token` for a short-lived Copilot token,
then reads the API host out of that token's `proxy-ep` field — normally
`api.individual.githubcopilot.com`.

A fine-grained PAT fits neither half of that flow:

| Request | Result |
|---|---|
| `POST api.github.com/copilot_internal/v2/token` with a PAT | `404` — the exchange is closed to PATs |
| `GET api.individual.githubcopilot.com/models` with a PAT | `421 Misdirected Request` |
| `GET api.githubcopilot.com/models` with a PAT | `200` |

So pi fails with a bare `421 Misdirected Request` when its stored `github-copilot` credential
is a PAT.

A PAT needs **no token exchange at all** — it is accepted as a bearer token directly, but only
on the public host `api.githubcopilot.com`.

## What this does

1. **Routes PAT traffic to the right host.** Re-registers the provider under the same id with
   `api.githubcopilot.com` for PAT credentials.
2. **Replaces the model list with your real entitlements.** Reads `GET /models` and keeps only
   models that are chat-capable, tool-calling, picker-enabled, and not policy-disabled.
3. **Adds `/copilot-pat`**, a doctor command that turns Copilot's opaque status codes into
   something actionable.

Keeping the provider id as `github-copilot` is deliberate. pi gates Copilot's dynamic request
headers on that literal string — `X-Initiator: user|agent` (which drives Copilot's quota
accounting), `Openai-Intent`, and `Copilot-Vision-Request`. A provider named something else
would silently lose all three.

**OAuth logins are unaffected.** pi resolves a request host as `auth.baseUrl ?? model.baseUrl`,
and the built-in OAuth `toAuth()` always supplies its own — so it outranks anything set here.
The model list is only taken over when the resolved credential is a GitHub token.

## Model list

The static catalog and real entitlements drift apart. On the account this was built against,
pi offered 9 models the PAT could not use (`claude-opus-4.5`, `claude-fable-5`,
`claude-sonnet-4`, `claude-sonnet-4.5`, `gpt-5.2`, `gpt-5.2-codex`, `gpt-5.4-nano`,
`kimi-k2.7-code`, `kimi-k3`) — each of which fails mid-turn with an opaque 4xx — while missing
`grok-4.6` (500k context), which the PAT *can* use.

Each model's API is chosen from its advertised `supported_endpoints`:

| Endpoint | pi API |
|---|---|
| `/v1/messages` | `anthropic-messages` |
| `/responses` | `openai-responses` |
| `/chat/completions` | `openai-completions` |

Context window, max output tokens, vision, reasoning support, and the available
reasoning-effort levels come from the live response. Pi only shows levels that Copilot
advertises for that model; Copilot's `none` effort is exposed as Pi's `off` level.

**Pricing** is the one thing `/models` does not report, so it comes from pi's built-in catalog.
For a model too new to be in that catalog, the closest same-family entry is used and labelled
`[price estimated from …]` in `/copilot-pat` — better than reporting the model as free. Note
that Copilot bills in premium requests rather than tokens, so pi's cost figures are an
approximation for this provider either way.

The list is cached for 6 hours under `$PI_CODING_AGENT_DIR/cache/`, keyed by a SHA-256
fingerprint of the token and host. **The token itself is never written to disk by this
extension.** A failed refresh falls back to the stale cache, then to pi's built-in catalog, so
a flaky network degrades the model list instead of breaking pi.

## Configuration

| Variable | Purpose |
|---|---|
| `GITHUB_COPILOT_PAT` | The PAT. Takes precedence over everything else, so you can override per shell. |
| `COPILOT_GITHUB_TOKEN` | pi's own variable; still honoured. |
| `GITHUB_COPILOT_BASE_URL` | Override the API host (GitHub Enterprise). |

Without either variable, the stored `github-copilot` credential is used
(`pi auth login github-copilot`, or `~/.pi/agent/auth.json`).

## Troubleshooting

Run `/copilot-pat` inside pi.

| Status | Meaning |
|---|---|
| `400` "Personal Access Tokens are not supported for this endpoint" | The token is not entitled to Copilot. The message blames PATs generally, which is misleading — an entitled PAT works against this exact endpoint. Check for an active Copilot subscription or seat, that the PAT was created with Copilot access, and that no org policy blocks PAT access. |
| `421` | Wrong host — a PAT was sent to the OAuth subscriber host. |
| `401` | Expired, revoked, or malformed token. |
| `403` | Authenticated, but not permitted to use Copilot. |
| `404` on `copilot_internal/v2/token` | Expected. PATs cannot use the exchange and do not need to. |

Not every fine-grained PAT can reach Copilot — entitlement is a property of the account and
the token's grants, and no client-side change can substitute for it.
