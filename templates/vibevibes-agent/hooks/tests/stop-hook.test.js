/**
 * Tests for the vibevibes-agent Stop hook logic.
 * Run with: node .claude/hooks/tests/stop-hook.test.js
 *
 * These test the pure decision functions in logic.js — no I/O, no HTTP.
 */

import { strict as assert } from "node:assert";
import { makeDecision, formatPrompt } from "../logic.js";

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
    participants: ["human-1", "claude-ai-1"],
  });
  assert.equal(result.decision, "block");
  assert.ok(result.reason.includes("hello"));
  assert.ok(result.reason.includes("_chat.send"));
});

test("allows exit when no events", () => {
  const result = makeDecision({
    events: [],
    observation: { mood: "calm" },
    participants: ["claude-ai-1"],
  });
  assert.equal(result, null);
});

test("includes observation in prompt", () => {
  const result = makeDecision({
    events: [{ actorId: "human-1", tool: "click", input: {}, ts: 1 }],
    observation: { mood: "tense", phase: "combat" },
    participants: ["human-1"],
  });
  assert.ok(result.reason.includes("tense"));
  assert.ok(result.reason.includes("combat"));
});

test("includes participant list", () => {
  const result = makeDecision({
    events: [{ actorId: "human-1", tool: "click", input: {}, ts: 1 }],
    observation: {},
    participants: ["alice-human-1", "bob-human-2", "claude-ai-1"],
  });
  assert.ok(result.reason.includes("alice"));
  assert.ok(result.reason.includes("bob"));
});

test("includes systemMessage with iteration info", () => {
  const result = makeDecision(
    {
      events: [{ actorId: "human-1", tool: "click", input: {}, ts: 1 }],
      observation: {},
      participants: ["claude-ai-1"],
    },
    42
  );
  assert.ok(result.systemMessage);
  assert.ok(result.systemMessage.includes("42"));
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
    participants: ["alice-human-1", "claude-ai-1"],
  });
  assert.ok(typeof prompt === "string");
  assert.ok(prompt.includes("alice"));
  assert.ok(prompt.includes("build a castle"));
  assert.ok(prompt.includes("_chat.send"));
});

test("includes observation data", () => {
  const prompt = formatPrompt({
    events: [{ actorId: "h-1", tool: "t", input: {}, ts: 1 }],
    observation: { mood: "tense", phase: "combat" },
    participants: ["h-1"],
  });
  assert.ok(prompt.includes("tense"));
  assert.ok(prompt.includes("combat"));
});

test("includes participant names", () => {
  const prompt = formatPrompt({
    events: [],
    observation: {},
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
