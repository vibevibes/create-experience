#!/usr/bin/env node

/**
 * vibevibes-agent setup script
 *
 * Creates the state file that activates the Stop hook loop.
 * Connects to the experience server and stores the actor ID.
 *
 * Usage: node setup.js [serverUrl]
 */

import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const STATE_FILE = resolve(process.cwd(), ".claude/vibevibes-agent.local.json");
const DEFAULT_SERVER = "http://localhost:4321";

async function main() {
  const serverUrl = process.argv[2] || DEFAULT_SERVER;

  // Ensure .claude directory exists
  const claudeDir = resolve(process.cwd(), ".claude");
  if (!existsSync(claudeDir)) {
    mkdirSync(claudeDir, { recursive: true });
  }

  // Check if already active
  if (existsSync(STATE_FILE)) {
    console.log("vibevibes agent loop is already active.");
    console.log("To restart: /vibevibes-leave then /vibevibes-join");
    process.exit(0);
  }

  // Connect to the experience server
  let joinData;
  try {
    const res = await fetch(`${serverUrl}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "claude", actorType: "ai" }),
    });
    joinData = await res.json();
    if (joinData.error) throw new Error(joinData.error);
  } catch (err) {
    console.error(`Failed to connect to ${serverUrl}`);
    console.error(`Is the dev server running? (npm run dev)`);
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }

  // Create state file
  const state = {
    active: true,
    serverUrl,
    actorId: joinData.actorId,
    lastEventTs: 0,
    iteration: 0,
    cooldowns: {},
    startedAt: new Date().toISOString(),
  };

  // Use server timestamps for initial lastEventTs
  const joinEvents = joinData.events || [];
  if (joinEvents.length > 0) {
    state.lastEventTs = Math.max(...joinEvents.map((e) => e.ts));
  }

  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));

  console.log(`vibevibes agent loop activated!`);
  console.log(``);
  console.log(`  Connected as: ${joinData.actorId}`);
  console.log(`  Server: ${serverUrl}`);
  console.log(`  Browser: ${joinData.browserUrl || serverUrl}`);
  console.log(`  Experience: ${joinData.experienceId}`);
  console.log(`  Participants: ${(joinData.participants || []).join(", ")}`);
  console.log(``);
  console.log(
    `The Stop hook is now active. After each action, it will check`
  );
  console.log(`for new events and feed them back to you.`);
  console.log(``);
  console.log(`To leave: /vibevibes-leave`);
}

main().catch((err) => {
  console.error(`Setup failed: ${err.message}`);
  process.exit(1);
});
