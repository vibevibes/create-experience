/**
 * Pure decision logic for the vibevibes-agent Stop hook.
 * No I/O, no HTTP, no file system — just functions.
 */

/**
 * Format an agent context into a readable prompt string.
 * This is what Claude sees as the "reason" when the Stop hook blocks exit.
 *
 * @param {object} ctx - Agent context from the server
 * @param {Array} ctx.events - Events since last interaction
 * @param {object|null} ctx.observation - Curated state from observe()
 * @param {string[]} ctx.participants - Current participant IDs
 * @returns {string}
 */
export function formatPrompt(ctx) {
  const parts = [];

  // Events
  if (ctx.events && ctx.events.length > 0) {
    parts.push(`${ctx.events.length} event(s) since your last action:`);
    for (const e of ctx.events) {
      const actor = e.actorId.split("-")[0]; // "alice-human-1" → "alice"
      const inputStr = JSON.stringify(e.input);
      parts.push(`  [${actor}] ${e.tool}(${inputStr})`);
    }
  }

  // Observation
  if (ctx.observation && Object.keys(ctx.observation).length > 0) {
    parts.push("");
    parts.push(`Observation: ${JSON.stringify(ctx.observation)}`);
  }

  // Participants
  if (ctx.participants && ctx.participants.length > 0) {
    const names = ctx.participants.map((p) => p.split("-")[0]);
    parts.push("");
    parts.push(`Participants: ${names.join(", ")}`);
  }

  // Instruction
  parts.push("");
  parts.push(
    "New activity in the experience. Use the act MCP tool with roomId to respond in the right room. If nothing requires a response, you may observe without acting."
  );

  return parts.join("\n");
}

/**
 * Decide whether to block Claude's exit and what to feed back.
 *
 * @param {object|null} ctx - Agent context from server, or null if no state file
 * @param {number} [iteration] - Current iteration number
 * @returns {{decision:string, reason:string, systemMessage:string}|null}
 *          null means allow exit (no state file = not in agent mode)
 */
export function makeDecision(ctx, iteration) {
  // No state file — allow normal exit
  if (ctx === null) return null;

  const hasEvents = ctx.events && ctx.events.length > 0;

  // Nothing to react to — allow exit silently (zero wasted tokens)
  if (!hasEvents) return null;

  const reason = formatPrompt(ctx);
  const iter = iteration || 0;

  return {
    decision: "block",
    reason,
    systemMessage: `vibevibes agent loop iteration ${iter} | You are a live participant in a vibevibes experience. Use the vibevibes MCP tools (act) to interact. To leave: /vibevibes-leave`,
  };
}
