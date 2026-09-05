export type PiThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
export type ThinkingLevelMap = Partial<Record<PiThinkingLevel, string | null>>;

const REASONING_LEVELS = ["minimal", "low", "medium", "high", "xhigh", "max"] as const;

/** Convert Copilot's advertised reasoning efforts into Pi's model-level capability map. */
export function thinkingLevelMapFromReasoningEfforts(
  reasoningEfforts: string[] | undefined,
): ThinkingLevelMap | undefined {
  const advertised = new Set(
    (reasoningEfforts ?? []).map((effort) => effort.trim().toLowerCase()).filter(Boolean),
  );
  const offEffort = advertised.has("none") ? "none" : advertised.has("off") ? "off" : null;
  const hasRecognizedEffort =
    offEffort !== null || REASONING_LEVELS.some((level) => advertised.has(level));

  if (!hasRecognizedEffort) return undefined;

  return {
    off: offEffort,
    ...Object.fromEntries(
      REASONING_LEVELS.map((level) => [level, advertised.has(level) ? level : null]),
    ),
  };
}
