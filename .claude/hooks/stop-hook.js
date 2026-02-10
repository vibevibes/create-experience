#!/usr/bin/env node

/**
 * vibevibes-agent Stop Hook
 *
 * Runs every time Claude tries to stop. Queries the experience server
 * for new events and feeds them back as a new prompt, keeping the agent
 * as a live participant in the experience.
 *
 * State file: .claude/vibevibes-agent.local.json
 * If the state file is missing, the hook allows normal exit.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { makeDecision } from "./logic.js";

const STATE_FILE = resolve(process.cwd(), ".claude/vibevibes-agent.local.json");
const DEFAULT_TIMEOUT = 5000; // 5s long-poll to server
const MAX_IDLE_ITERATIONS = 3; // Allow exit after N consecutive idle loops

/** Read JSON from stdin (Claude Code passes hook context here) */
function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => {
      try { resolve(JSON.parse(data)); }
      catch { resolve({}); }
    });
    // If stdin is a TTY or empty (manual testing), resolve immediately
    if (process.stdin.isTTY) resolve({});
  });
}

async function main() {
  // 0. Read hook context from stdin
  const hookInput = await readStdin();

  // 1. Read state file
  if (!existsSync(STATE_FILE)) {
    // No state file = not in agent mode. Allow normal exit.
    process.exit(0);
  }

  let state;
  try {
    state = JSON.parse(readFileSync(STATE_FILE, "utf-8"));
  } catch {
    // Corrupted state file — allow exit
    process.exit(0);
  }

  if (!state.active) {
    process.exit(0);
  }

  const { serverUrl, actorId, lastEventTs } = state;
  if (!serverUrl || !actorId) {
    process.exit(0);
  }

  // 1b. If stop_hook_active and we've had too many idle iterations, allow exit
  if (hookInput.stop_hook_active && (state.idleCount || 0) >= MAX_IDLE_ITERATIONS) {
    process.exit(0);
  }

  // 2. Query experience server for agent context
  let agentContext;
  try {
    const url = `${serverUrl}/agent-context?since=${lastEventTs || 0}&actorId=${encodeURIComponent(actorId)}&timeout=${DEFAULT_TIMEOUT}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT + 5000);

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);

    if (!res.ok) {
      // Server error — let agent exit gracefully
      process.exit(0);
    }

    agentContext = await res.json();
  } catch {
    // Server unreachable — let agent exit gracefully
    process.exit(0);
  }

  // 3. Update state file
  const events = agentContext.events || [];
  if (events.length > 0) {
    state.lastEventTs = Math.max(
      state.lastEventTs || 0,
      ...events.map((e) => e.ts)
    );
    state.idleCount = 0; // Reset idle counter when there are events
  } else {
    state.idleCount = (state.idleCount || 0) + 1; // Track consecutive idle loops
  }
  state.iteration = (state.iteration || 0) + 1;

  try {
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch {
    // Can't write state — allow exit
    process.exit(0);
  }

  // 4. Make decision
  const decision = makeDecision(agentContext, state.iteration);

  if (!decision) {
    process.exit(0);
  }

  // 5. Output JSON to block exit and feed prompt back to Claude
  const output = JSON.stringify(decision);
  process.stdout.write(output);
  process.exit(0);
}

main().catch(() => {
  // Any unhandled error — allow normal exit
  process.exit(0);
});
