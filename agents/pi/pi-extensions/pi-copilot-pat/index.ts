/**
 * GitHub Copilot via a fine-grained personal access token.
 *
 * pi's built-in `github-copilot` provider is written for the OAuth device flow: it trades a
 * `gho_…` token at `api.github.com/copilot_internal/v2/token` for a short-lived Copilot token
 * and reads the API host out of that token's `proxy-ep` field. A fine-grained PAT fits neither
 * half of that flow — the internal exchange answers 404, and the subscriber host
 * (`api.individual.githubcopilot.com`) answers 421 Misdirected Request.
 *
 * A PAT needs no exchange at all. It is accepted as a bearer token directly, but only on the
 * public host `api.githubcopilot.com`. This extension re-registers the provider under the same
 * id so that host is used for PAT credentials, and replaces the static model catalog with the
 * set the token is actually entitled to.
 *
 * Keeping the id `github-copilot` matters: pi gates Copilot's dynamic request headers on that
 * literal string (see `X-Initiator` / `Copilot-Vision-Request` in pi-ai's api modules), and
 * those drive Copilot's quota accounting. A differently-named provider would lose them.
 *
 * OAuth logins are unaffected. pi resolves a request host as `auth.baseUrl ?? model.baseUrl`,
 * and the built-in OAuth `toAuth()` always supplies its own — so it outranks anything here.
 */

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import {
  anthropicMessagesApi,
  createProvider,
  openAICompletionsApi,
  openAIResponsesApi,
} from "@earendil-works/pi-ai";
import { builtinProviders, getBuiltinModels } from "@earendil-works/pi-ai/providers/all";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { thinkingLevelMapFromReasoningEfforts } from "./thinking-levels.ts";

const PROVIDER_ID = "github-copilot";
const PUBLIC_BASE_URL = "https://api.githubcopilot.com";
const COPILOT_API_VERSION = "2026-06-01";

/** Sent on every Copilot request; the built-in catalog carries the same four. */
const COPILOT_HEADERS: Record<string, string> = {
  "User-Agent": "GitHubCopilotChat/0.35.0",
  "Editor-Version": "vscode/1.107.0",
  "Editor-Plugin-Version": "copilot-chat/0.35.0",
  "Copilot-Integration-Id": "vscode-chat",
};

/** Checked ahead of pi's own `COPILOT_GITHUB_TOKEN` so a shell export always wins. */
const PAT_ENV_VAR = "GITHUB_COPILOT_PAT";
const BASE_URL_ENV_VAR = "GITHUB_COPILOT_BASE_URL";

const GITHUB_TOKEN_PREFIXES = ["github_pat_", "ghp_", "gho_", "ghu_", "ghs_"];

const MODEL_CACHE_VERSION = 3;
const MODEL_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const MODELS_FETCH_TIMEOUT_MS = 8000;

/** Most specific API first: a Claude model lists both `/v1/messages` and `/chat/completions`. */
const API_PREFERENCE = ["anthropic-messages", "openai-responses", "openai-completions"] as const;
type CopilotApi = (typeof API_PREFERENCE)[number];

const ENDPOINT_TO_API: Record<string, CopilotApi> = {
  "/v1/messages": "anthropic-messages",
  "/responses": "openai-responses",
  "/chat/completions": "openai-completions",
};

// ---------------------------------------------------------------------------
// Credentials
// ---------------------------------------------------------------------------

interface ResolvedCredential {
  key: string;
  /** Human-readable origin, shown by `/copilot-pat`. Never the token itself. */
  source: string;
}

function configDir(): string {
  return process.env.PI_CODING_AGENT_DIR?.trim() || join(homedir(), ".pi", "agent");
}

function isGitHubToken(key: string): boolean {
  return GITHUB_TOKEN_PREFIXES.some((prefix) => key.startsWith(prefix));
}

/** A short-lived Copilot session token, e.g. `tid=…;exp=…;proxy-ep=proxy.individual.…`. */
function isCopilotSessionToken(key: string): boolean {
  return key.includes("proxy-ep=") || key.includes("tid=");
}

/** `proxy.individual.githubcopilot.com` -> `https://api.individual.githubcopilot.com` */
function baseUrlFromSessionToken(key: string): string | undefined {
  const match = key.match(/proxy-ep=([^;]+)/);
  return match ? `https://${match[1].replace(/^proxy\./, "api.")}` : undefined;
}

/**
 * The host a given credential should talk to. `undefined` means "leave pi's default alone".
 */
function baseUrlForKey(key: string): string | undefined {
  const override = process.env[BASE_URL_ENV_VAR]?.trim();
  if (override) return override.replace(/\/+$/, "");
  // Session tokens keep the built-in behaviour: the host is encoded in the token.
  if (isCopilotSessionToken(key)) return baseUrlFromSessionToken(key);
  if (isGitHubToken(key)) return PUBLIC_BASE_URL;
  return undefined;
}

function patFromEnv(): ResolvedCredential | undefined {
  const value = process.env[PAT_ENV_VAR]?.trim();
  return value ? { key: value, source: `$${PAT_ENV_VAR}` } : undefined;
}

/** Read pi's own credential store without going through the (async) Models machinery. */
function storedCredential(): ResolvedCredential | undefined {
  try {
    const raw = readFileSync(join(configDir(), "auth.json"), "utf8");
    const entry = JSON.parse(raw)?.[PROVIDER_ID];
    if (entry?.type === "api_key" && typeof entry.key === "string" && entry.key) {
      return { key: entry.key, source: "stored api_key credential" };
    }
    if (entry?.type === "oauth") return { key: "", source: "oauth" };
  } catch {
    // No store yet, or unreadable — treated the same as "no credential".
  }
  return undefined;
}

function envFallbackCredential(): ResolvedCredential | undefined {
  const value = process.env.COPILOT_GITHUB_TOKEN?.trim();
  return value ? { key: value, source: "$COPILOT_GITHUB_TOKEN" } : undefined;
}

function resolveCredential(): ResolvedCredential | undefined {
  return patFromEnv() ?? storedCredential() ?? envFallbackCredential();
}

/**
 * Wrap pi's api-key auth so a PAT gets the public host attached, and so `$GITHUB_COPILOT_PAT`
 * is honoured (the built-in only knows `COPILOT_GITHUB_TOKEN`).
 */
function withPatBaseUrl(base: any): any {
  return {
    ...base,
    async resolve(input: any) {
      const override = patFromEnv();
      if (override) {
        return {
          auth: { apiKey: override.key, baseUrl: baseUrlForKey(override.key) },
          source: override.source,
        };
      }
      const result = await base.resolve(input);
      if (!result?.auth?.apiKey || result.auth.baseUrl) return result;
      const baseUrl = baseUrlForKey(result.auth.apiKey);
      return baseUrl ? { ...result, auth: { ...result.auth, baseUrl } } : result;
    },
  };
}

// ---------------------------------------------------------------------------
// Live model catalog
// ---------------------------------------------------------------------------

interface CopilotRawModel {
  id: string;
  name?: string;
  model_picker_enabled?: boolean;
  policy?: { state?: string };
  supported_endpoints?: string[];
  capabilities?: {
    type?: string;
    limits?: {
      max_context_window_tokens?: number;
      max_output_tokens?: number;
    };
    supports?: {
      tool_calls?: boolean;
      vision?: boolean;
      adaptive_thinking?: boolean;
      reasoning_effort?: string[];
    };
  };
}

class CopilotHttpError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
  ) {
    super(`${status}`);
  }
}

async function fetchCopilotModels(
  key: string,
  baseUrl: string,
  signal: AbortSignal,
): Promise<CopilotRawModel[]> {
  const response = await fetch(`${baseUrl}/models`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${key}`,
      ...COPILOT_HEADERS,
      "X-GitHub-Api-Version": COPILOT_API_VERSION,
    },
    signal,
  });
  if (!response.ok) throw new CopilotHttpError(response.status, await response.text());
  const payload = (await response.json()) as { data?: CopilotRawModel[] };
  if (!Array.isArray(payload?.data)) throw new Error("Malformed /models response");
  return payload.data;
}

/**
 * Mirrors pi's own `parseAvailableCopilotModelIds` semantics. Drops embeddings (not `chat`),
 * models that cannot call tools (useless to an agent), anything the account policy disables,
 * and the legacy non-picker tier (`gpt-4o`, `gpt-3.5-turbo`, `trajectory-compaction`, …).
 */
function isUsableModel(raw: CopilotRawModel): boolean {
  const capabilities = raw.capabilities ?? {};
  return (
    capabilities.type === "chat" &&
    capabilities.supports?.tool_calls === true &&
    raw.model_picker_enabled === true &&
    raw.policy?.state !== "disabled"
  );
}

/** Index the built-in catalog, which is the only source of pricing. */
function catalogIndex(): { byIdApi: Map<string, any>; byId: Map<string, any[]> } {
  const byIdApi = new Map<string, any>();
  const byId = new Map<string, any[]>();
  for (const model of getBuiltinModels(PROVIDER_ID) as any[]) {
    byIdApi.set(`${model.id}::${model.api}`, model);
    const list = byId.get(model.id);
    if (list) list.push(model);
    else byId.set(model.id, [model]);
  }
  return { byIdApi, byId };
}

/** Length of the shared leading substring of two ids. */
function commonPrefixLength(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

/**
 * Copilot ships new point releases before pi's catalog learns their pricing, which would
 * otherwise report the model as free. Borrow the closest same-family, same-api entry
 * (`grok-4.6` -> `grok-4.5`) and mark the result as an estimate rather than showing $0.
 * Requires a decent prefix overlap so unrelated families never match.
 */
const MIN_FAMILY_PREFIX = 5;

function familyPricing(id: string, api: CopilotApi): any | undefined {
  let best: any;
  let bestLength = MIN_FAMILY_PREFIX - 1;
  for (const model of getBuiltinModels(PROVIDER_ID) as any[]) {
    if (model.api !== api || model.id === id) continue;
    const length = commonPrefixLength(model.id, id);
    if (length > bestLength) {
      best = model;
      bestLength = length;
    }
  }
  return best;
}

function chooseApi(raw: CopilotRawModel, known: any[] | undefined): CopilotApi | undefined {
  const advertised = (raw.supported_endpoints ?? [])
    .map((endpoint) => ENDPOINT_TO_API[endpoint])
    .filter((api): api is CopilotApi => Boolean(api));

  // Trust the endpoint list, but only where pi's catalog agrees the model works that way.
  const catalogApis = (known ?? []).map((model) => model.api as CopilotApi);
  const agreed = API_PREFERENCE.find(
    (api) => advertised.includes(api) && catalogApis.includes(api),
  );
  if (agreed) return agreed;

  return (
    API_PREFERENCE.find((api) => advertised.includes(api)) ??
    API_PREFERENCE.find((api) => catalogApis.includes(api))
  );
}

function toPiModel(raw: CopilotRawModel, baseUrl: string, index: ReturnType<typeof catalogIndex>) {
  const known = index.byId.get(raw.id);
  const api = chooseApi(raw, known);
  if (!api) return undefined;

  const limits = raw.capabilities?.limits ?? {};
  const supports = raw.capabilities?.supports ?? {};
  const catalog = index.byIdApi.get(`${raw.id}::${api}`) ?? known?.[0];
  const advertisedThinkingLevelMap = thinkingLevelMapFromReasoningEfforts(
    supports.reasoning_effort,
  );

  // Pricing only ever comes from pi's catalog; the Copilot API does not report it.
  const relative = catalog ? undefined : familyPricing(raw.id, api);
  const costSource = catalog ? "catalog" : relative ? `estimated from ${relative.id}` : "unknown";

  return {
    id: raw.id,
    name: raw.name ?? catalog?.name ?? raw.id,
    api,
    provider: PROVIDER_ID,
    baseUrl,
    reasoning:
      supports.adaptive_thinking === true ||
      (Array.isArray(supports.reasoning_effort) && supports.reasoning_effort.length > 0) ||
      catalog?.reasoning === true,
    input: supports.vision === true ? ["text", "image"] : ["text"],
    cost: catalog?.cost ?? relative?.cost ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: limits.max_context_window_tokens ?? catalog?.contextWindow ?? 128_000,
    maxTokens: limits.max_output_tokens ?? catalog?.maxTokens ?? 4096,
    headers: { ...COPILOT_HEADERS },
    costSource,
    ...(advertisedThinkingLevelMap
      ? { thinkingLevelMap: advertisedThinkingLevelMap }
      : catalog?.thinkingLevelMap
        ? { thinkingLevelMap: catalog.thinkingLevelMap }
        : {}),
    ...(catalog?.compat ? { compat: catalog.compat } : {}),
  };
}

function buildModels(raw: CopilotRawModel[], baseUrl: string) {
  const index = catalogIndex();
  return raw
    .filter(isUsableModel)
    .map((model) => toPiModel(model, baseUrl, index))
    .filter((model): model is NonNullable<typeof model> => Boolean(model))
    .sort((a, b) => a.id.localeCompare(b.id));
}

/** Point the built-in catalog at the PAT host — the fallback when /models is unreachable. */
function rebasedCatalog(baseUrl: string) {
  return (getBuiltinModels(PROVIDER_ID) as any[]).map((model) => ({ ...model, baseUrl }));
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

interface ModelCache {
  version: number;
  fingerprint: string;
  checkedAt: number;
  models: any[];
}

function cachePath(): string {
  return join(configDir(), "cache", "github-copilot-pat-models.json");
}

/** Identifies the token+host pair without storing either. */
function fingerprint(key: string, baseUrl: string): string {
  return createHash("sha256").update(`${key}::${baseUrl}`).digest("hex").slice(0, 16);
}

function readCache(id: string): ModelCache | undefined {
  try {
    const cache = JSON.parse(readFileSync(cachePath(), "utf8")) as ModelCache;
    if (
      cache?.version !== MODEL_CACHE_VERSION ||
      cache.fingerprint !== id ||
      !Array.isArray(cache.models)
    ) {
      return undefined;
    }
    return cache;
  } catch {
    return undefined;
  }
}

function writeCache(cache: ModelCache): void {
  try {
    mkdirSync(dirname(cachePath()), { recursive: true });
    writeFileSync(cachePath(), JSON.stringify(cache, null, 2));
  } catch {
    // A cache we cannot write is not worth failing startup over.
  }
}

/**
 * Fresh cache -> use it. Otherwise fetch, falling back to a stale cache and then to the
 * built-in catalog, so a flaky network degrades the model list instead of breaking pi.
 */
async function loadModels(
  key: string,
  baseUrl: string,
  force = false,
): Promise<{ models: any[]; origin: string }> {
  const id = fingerprint(key, baseUrl);
  const cached = readCache(id);
  if (!force && cached && Date.now() - cached.checkedAt < MODEL_CACHE_TTL_MS) {
    return { models: cached.models, origin: "cache" };
  }

  try {
    const raw = await fetchCopilotModels(key, baseUrl, AbortSignal.timeout(MODELS_FETCH_TIMEOUT_MS));
    const models = buildModels(raw, baseUrl);
    if (models.length > 0) {
      writeCache({ version: MODEL_CACHE_VERSION, fingerprint: id, checkedAt: Date.now(), models });
      return { models, origin: "live" };
    }
  } catch {
    // fall through to the degraded paths below
  }

  if (cached) return { models: cached.models, origin: "stale cache" };
  return { models: rebasedCatalog(baseUrl), origin: "built-in catalog (offline)" };
}

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

function explainStatus(status: number, body: string): string {
  // Copilot answers 400 (not 403) when the token itself is not entitled, and the wording
  // blames "Personal Access Tokens" generally — misleading, since an entitled PAT works fine.
  if (status === 400 && /Personal Access Tokens are not supported/i.test(body)) {
    return [
      "This token is not entitled to Copilot. The wording blames PATs in general, but that is",
      "misleading: an entitled fine-grained PAT works against this same endpoint.",
      "",
      "Usually one of:",
      "  - the account has no active Copilot subscription or assigned seat;",
      "  - the fine-grained PAT was created without Copilot access;",
      "  - an org/enterprise policy blocks PAT access to Copilot.",
      "",
      "Confirm the account at https://github.com/settings/copilot, then re-create the token at",
      "https://github.com/settings/personal-access-tokens with Copilot access granted.",
    ].join("\n");
  }

  switch (status) {
    case 421:
      return "Wrong host for a PAT. api.individual.githubcopilot.com only serves OAuth subscriber tokens; a PAT must use api.githubcopilot.com.";
    case 401:
      return "Token rejected. It is expired, revoked, or malformed.";
    case 403:
      return "Authenticated, but this token is not allowed to use Copilot. Check that the fine-grained PAT grants Copilot access and that your account has an active Copilot subscription.";
    case 404:
      return "Endpoint not visible to this token. For copilot_internal/v2/token this is expected — PATs cannot use the exchange, and do not need to.";
    default:
      return "Unexpected response.";
  }
}

async function runDoctor(): Promise<string> {
  const lines: string[] = ["GitHub Copilot PAT — diagnostics", ""];
  const credential = resolveCredential();

  if (!credential || !credential.key) {
    lines.push(
      credential?.source === "oauth"
        ? "Credential: OAuth login (this extension only alters the PAT path; nothing to check)."
        : `Credential: none found. Set $${PAT_ENV_VAR}, or run \`pi auth login github-copilot\`.`,
    );
    return lines.join("\n");
  }

  const kind = isCopilotSessionToken(credential.key)
    ? "Copilot session token"
    : isGitHubToken(credential.key)
      ? "GitHub token (PAT / OAuth token)"
      : "unrecognized format";
  const baseUrl = baseUrlForKey(credential.key) ?? PUBLIC_BASE_URL;

  lines.push(`Credential: ${credential.source}`);
  lines.push(`Type:       ${kind}`);
  lines.push(`Host:       ${baseUrl}`);
  lines.push("");

  try {
    const raw = await fetchCopilotModels(
      credential.key,
      baseUrl,
      AbortSignal.timeout(MODELS_FETCH_TIMEOUT_MS),
    );
    const models = buildModels(raw, baseUrl);
    lines.push(`OK — ${raw.length} models returned, ${models.length} usable for agent work.`);
    lines.push("");
    for (const model of models) {
      const price = model.costSource === "catalog" ? "" : `  [price ${model.costSource}]`;
      lines.push(
        `  ${model.id.padEnd(26)} ${String(model.contextWindow).padStart(9)} ctx  ${model.api}${price}`,
      );
    }
  } catch (error) {
    if (error instanceof CopilotHttpError) {
      lines.push(`FAILED — HTTP ${error.status}`);
      lines.push(explainStatus(error.status, error.body));
      if (error.body) lines.push(`Response: ${error.body.slice(0, 300)}`);
    } else {
      lines.push(`FAILED — ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Extension entry point
// ---------------------------------------------------------------------------

export default async function (pi: ExtensionAPI) {
  const builtin = builtinProviders().find((provider: any) => provider.id === PROVIDER_ID) as any;
  if (!builtin) return; // pi dropped the provider; nothing to extend.

  const credential = resolveCredential();
  const usePat = Boolean(credential?.key) && isGitHubToken(credential!.key);
  const baseUrl = usePat ? (baseUrlForKey(credential!.key) ?? PUBLIC_BASE_URL) : undefined;

  // Only take over the model list for a PAT. An OAuth login keeps pi's catalog and its own
  // `availableModelIds` filtering, both of which are correct for that credential.
  const models = usePat
    ? (await loadModels(credential!.key, baseUrl!)).models
    : getBuiltinModels(PROVIDER_ID);

  pi.registerProvider(
    createProvider({
      id: PROVIDER_ID,
      name: "GitHub Copilot",
      auth: {
        oauth: builtin.auth.oauth,
        apiKey: withPatBaseUrl(builtin.auth.apiKey),
      },
      models: models as any,
      filterModels: usePat ? undefined : builtin.filterModels,
      api: {
        "anthropic-messages": anthropicMessagesApi(),
        "openai-completions": openAICompletionsApi(),
        "openai-responses": openAIResponsesApi(),
      },
    }) as any,
  );

  pi.registerCommand("copilot-pat", {
    description: "Diagnose the GitHub Copilot PAT credential and list usable models",
    handler: async (_args: string, ctx: any) => {
      ctx.ui.notify(await runDoctor(), "info");
    },
  } as any);
}
