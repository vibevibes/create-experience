/**
 * Tests for the vibevibes-agent Stop hook logic.
 * Run with: node .claude/hooks/tests/stop-hook.test.js
 *
 * These test the pure decision functions in logic.js — no I/O, no HTTP.
 */

import { strict as assert } from "node:assert";
import { makeDecision, evaluateHints, formatPrompt } from "../logic.js";

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  \u2713 ${name}`);
  } catch (e) {
    failed++;
    console.log(`  \u2717 ${name}`);
    console.log(`    ${e.message}`);
  }
}

// ================================================================
// makeDecision
// ================================================================

console.log("\nmakeDecision:");

test("returns null when context is null (no state file)", () => {
  const result = makeDecision(null);
  assert.equal(result, null);
});

test("blocks exit and feeds events when events exist", () => {
  const result = makeDecision({
    events: [
      {
        actorId: "human-1",
        tool: "_chat.send",
        input: { message: "hello" },
        ts: 1,
      },
    ],
    observation: { mood: "friendly" },
    firedHints: [],
    participants: ["human-1", "claude-ai-1"],
  });
  assert.equal(result.decision, "block");
  assert.ok(result.reason.includes("hello"));
  assert.ok(result.reason.includes("_chat.send"));
});

test("returns null when no events and no hints (silent exit)", () => {
  const result = makeDecision({
    events: [],
    observation: { mood: "calm" },
    firedHints: [],
    participants: ["claude-ai-1"],
  });
  assert.equal(result, null);
});

test("includes fired hints in prompt", () => {
  const result = makeDecision({
    events: [{ actorId: "human-1", tool: "game.move", input: {}, ts: 1 }],
    observation: {},
    firedHints: [
      {
        trigger: "Player made a move",
        suggestedTools: ["game.respond"],
        priority: "high",
      },
    ],
    participants: ["human-1", "claude-ai-1"],
  });
  assert.ok(result.reason.includes("Player made a move"));
  assert.ok(result.reason.includes("game.respond"));
});

test("includes observation in prompt", () => {
  const result = makeDecision({
    events: [{ actorId: "human-1", tool: "click", input: {}, ts: 1 }],
    observation: { mood: "tense", phase: "combat" },
    firedHints: [],
    participants: ["human-1"],
  });
  assert.ok(result.reason.includes("tense"));
  assert.ok(result.reason.includes("combat"));
});

test("includes participant list when events present", () => {
  const result = makeDecision({
    events: [{ actorId: "alice-human-1", tool: "click", input: {}, ts: 1 }],
    observation: {},
    firedHints: [],
    participants: ["alice-human-1", "bob-human-2", "claude-ai-1"],
  });
  assert.ok(result.reason.includes("alice"));
  assert.ok(result.reason.includes("bob"));
});

test("includes systemMessage with iteration info", () => {
  const result = makeDecision(
    {
      events: [{ actorId: "h-1", tool: "click", input: {}, ts: 1 }],
      observation: {},
      firedHints: [],
      participants: ["claude-ai-1"],
    },
    42
  );
  assert.ok(result.systemMessage);
  assert.ok(result.systemMessage.includes("42"));
});

test("blocks exit when hints fire even without events", () => {
  const result = makeDecision({
    events: [],
    observation: {},
    firedHints: [
      { trigger: "Proactive hint", suggestedTools: ["tool.a"], priority: "medium" },
    ],
    participants: ["claude-ai-1"],
  });
  assert.equal(result.decision, "block");
  assert.ok(result.reason.includes("Proactive hint"));
});

// ================================================================
// evaluateHints
// ================================================================

console.log("\nevaluateHints:");

test("returns empty array when no hints defined", () => {
  const result = evaluateHints({ count: 0 }, [], "ai-1", {});
  assert.deepEqual(result, []);
});

test("fires hint when condition is true", () => {
  const hints = [
    {
      trigger: "Counter is high",
      condition: "state.count > 5",
      suggestedTools: ["counter.reset"],
      priority: "high",
    },
  ];
  const result = evaluateHints({ count: 10 }, hints, "ai-1", {});
  assert.equal(result.length, 1);
  assert.equal(result[0].trigger, "Counter is high");
  assert.deepEqual(result[0].suggestedTools, ["counter.reset"]);
  assert.equal(result[0].priority, "high");
});

test("does NOT fire hint when condition is false", () => {
  const hints = [
    {
      trigger: "Counter is high",
      condition: "state.count > 5",
      suggestedTools: ["counter.reset"],
    },
  ];
  const result = evaluateHints({ count: 2 }, hints, "ai-1", {});
  assert.equal(result.length, 0);
});

test("fires hint with no condition (always fires)", () => {
  const hints = [{ trigger: "Always active", suggestedTools: ["tool.a"] }];
  const result = evaluateHints({}, hints, "ai-1", {});
  assert.equal(result.length, 1);
});

test("respects cooldown — does not re-fire within window", () => {
  const hints = [
    {
      trigger: "Fires once",
      condition: "state.active === true",
      suggestedTools: ["tool.a"],
      cooldownMs: 10000,
    },
  ];
  const cooldowns = {};

  const first = evaluateHints({ active: true }, hints, "ai-1", cooldowns);
  assert.equal(first.length, 1);

  const second = evaluateHints({ active: true }, hints, "ai-1", cooldowns);
  assert.equal(second.length, 0);
});

test("uses default 5000ms cooldown when not specified", () => {
  const hints = [{ trigger: "Default cooldown", suggestedTools: ["tool.a"] }];
  const cooldowns = {};

  const first = evaluateHints({}, hints, "ai-1", cooldowns);
  assert.equal(first.length, 1);

  const second = evaluateHints({}, hints, "ai-1", cooldowns);
  assert.equal(second.length, 0);

  assert.ok(cooldowns["Default cooldown"] > 0);
});

test("handles invalid condition expression gracefully", () => {
  const hints = [
    {
      trigger: "Bad condition",
      condition: "this is not valid javascript!!!",
      suggestedTools: ["tool.a"],
    },
  ];
  const result = evaluateHints({}, hints, "ai-1", {});
  assert.equal(result.length, 0);
});

test("condition can reference actorId", () => {
  const hints = [
    {
      trigger: "My turn",
      condition: "state.turn === actorId",
      suggestedTools: ["game.play"],
    },
  ];
  const result = evaluateHints({ turn: "ai-1" }, hints, "ai-1", {});
  assert.equal(result.length, 1);
});

test("defaults priority to medium when not specified", () => {
  const hints = [{ trigger: "No priority", suggestedTools: ["tool.a"] }];
  const result = evaluateHints({}, hints, "ai-1", {});
  assert.equal(result[0].priority, "medium");
});

test("evaluates multiple hints independently", () => {
  const hints = [
    {
      trigger: "A",
      condition: "state.a === true",
      suggestedTools: ["tool.a"],
    },
    {
      trigger: "B",
      condition: "state.b === true",
      suggestedTools: ["tool.b"],
    },
    {
      trigger: "C",
      condition: "state.c === true",
      suggestedTools: ["tool.c"],
    },
  ];
  const result = evaluateHints(
    { a: true, b: false, c: true },
    hints,
    "x",
    {}
  );
  assert.equal(result.length, 2);
  assert.equal(result[0].trigger, "A");
  assert.equal(result[1].trigger, "C");
});

// ================================================================
// formatPrompt
// ================================================================

console.log("\nformatPrompt:");

test("formats events as readable text", () => {
  const prompt = formatPrompt({
    events: [
      {
        actorId: "alice-human-1",
        tool: "_chat.send",
        input: { message: "build a castle" },
        ts: 1,
      },
    ],
    observation: { mood: "excited" },
    firedHints: [
      {
        trigger: "New chat",
        suggestedTools: ["_chat.send"],
        priority: "high",
      },
    ],
    participants: ["alice-human-1", "claude-ai-1"],
  });
  assert.ok(typeof prompt === "string");
  assert.ok(prompt.includes("alice"));
  assert.ok(prompt.includes("build a castle"));
  assert.ok(prompt.includes("_chat.send"));
});

test("formats prompt with only observation when no events", () => {
  const prompt = formatPrompt({
    events: [],
    observation: { phase: "waiting" },
    firedHints: [],
    participants: ["claude-ai-1"],
  });
  assert.ok(prompt.includes("waiting"));
  assert.ok(prompt.includes("React to the events"));
});

test("includes observation data", () => {
  const prompt = formatPrompt({
    events: [{ actorId: "h-1", tool: "t", input: {}, ts: 1 }],
    observation: { mood: "tense", phase: "combat" },
    firedHints: [],
    participants: ["h-1"],
  });
  assert.ok(prompt.includes("tense"));
  assert.ok(prompt.includes("combat"));
});

test("includes hints with suggested tools", () => {
  const prompt = formatPrompt({
    events: [],
    observation: {},
    firedHints: [
      {
        trigger: "Player needs help",
        suggestedTools: ["assist.player", "chat.send"],
        priority: "high",
      },
    ],
    participants: ["h-1"],
  });
  assert.ok(prompt.includes("Player needs help"));
  assert.ok(prompt.includes("assist.player"));
});

test("includes participant names", () => {
  const prompt = formatPrompt({
    events: [],
    observation: {},
    firedHints: [],
    participants: ["alice-human-1", "bob-human-2", "claude-ai-1"],
  });
  assert.ok(prompt.includes("alice"));
  assert.ok(prompt.includes("bob"));
});

test("handles multiple events", () => {
  const prompt = formatPrompt({
    events: [
      { actorId: "h-1", tool: "click", input: { x: 10 }, ts: 1 },
      { actorId: "h-2", tool: "drag", input: { x: 20 }, ts: 2 },
    ],
    observation: {},
    firedHints: [],
    participants: ["h-1", "h-2"],
  });
  assert.ok(prompt.includes("click"));
  assert.ok(prompt.includes("drag"));
});

// ================================================================
// Results
// ================================================================

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
