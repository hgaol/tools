import assert from "node:assert/strict";
import test from "node:test";

import { thinkingLevelMapFromReasoningEfforts } from "../thinking-levels.ts";

test("maps every reasoning effort advertised by Copilot for a new model", () => {
  assert.deepEqual(
    thinkingLevelMapFromReasoningEfforts(["low", "medium", "high", "xhigh", "max"]),
    {
      off: null,
      minimal: null,
      low: "low",
      medium: "medium",
      high: "high",
      xhigh: "xhigh",
      max: "max",
    },
  );
});

test("maps Copilot's none effort to Pi's off level", () => {
  assert.deepEqual(thinkingLevelMapFromReasoningEfforts(["none", "low", "high"]), {
    off: "none",
    minimal: null,
    low: "low",
    medium: null,
    high: "high",
    xhigh: null,
    max: null,
  });
});

test("leaves metadata unspecified when Copilot does not advertise recognized efforts", () => {
  assert.equal(thinkingLevelMapFromReasoningEfforts(undefined), undefined);
  assert.equal(thinkingLevelMapFromReasoningEfforts([]), undefined);
  assert.equal(thinkingLevelMapFromReasoningEfforts(["future-effort"]), undefined);
});
