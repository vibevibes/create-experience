#!/usr/bin/env node

/**
 * vibevibes-agent teardown script
 *
 * Removes the state file, which deactivates the Stop hook loop.
 * The next time Claude tries to stop, the hook will see no state file
 * and allow normal exit.
 */

import { unlinkSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const STATE_FILE = resolve(process.cwd(), ".claude/vibevibes-agent.local.json");

if (!existsSync(STATE_FILE)) {
  console.log("vibevibes agent loop is not active. Nothing to do.");
  process.exit(0);
}

try {
  unlinkSync(STATE_FILE);
  console.log("vibevibes agent loop deactivated.");
  console.log("You can now exit normally.");
} catch (err) {
  console.error(`Failed to remove state file: ${err.message}`);
  process.exit(1);
}
