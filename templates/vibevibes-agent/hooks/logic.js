/**
 * Pure decision logic for the vibevibes-agent Stop hook.
 * No I/O, no HTTP, no file system — just functions.
 */

const DEFAULT_COOLDOWN_MS = 5000;

/**
 * Evaluate agent hints against current state.
 * Returns hints whose conditions match and aren't on cooldown.
 *
 * @param {Record<string,any>} state - Current shared state
 * @param {Array} hints - Agent hint definitions from the experience
 * @param {string} actorId - The agent's actor ID
 * @param {Record<string,number>} cooldowns - Map of trigger→lastFiredTimestamp (mutated in place)
 * @returns {Array<{trigger,suggestedTools,priority,firedAt}>}
 */
export function evaluateHints(state, hints, actorId, cooldowns) {
  if (!hints || hints.length === 0) return [];

  const fired = [];
  const now = Date.now();

  for (const hint of hints) {
    // Check cooldown
    const lastFired = cooldowns[hint.trigger] || 0;
    const cooldownMs = hint.cooldownMs || DEFAULT_COOLDOWN_MS;
    if (now - lastFired < cooldownMs) continue;

    // Evaluate condition
    if (hint.condition) {
      try {
        const fn = new Function("state", "actorId", `return ${hint.condition}`);
        if (!fn(state, actorId)) continue;
      } catch {
        continue; // Invalid expression — skip silently
      }
    }

    // Hint fires
    cooldowns[hint.trigger] = now;
    fired.push({
      trigger: hint.trigger,
      suggestedTools: hint.suggestedTools,
      priority: hint.priority || "medium",
      firedAt: now,
    });
  }

  return fired;
}

/**
 * Format an agent context into a readable prompt string.
 * This is what Claude sees as the "reason" when the Stop hook blocks exit.
 *
 * @param {object} ctx - Agent context from the server
 * @param {Array} ctx.events - Events since last interaction
 * @param {object|null} ctx.observation - Curated state from observe()
 * @param {Array} ctx.firedHints - Hints that fired
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

  // Fired hints
  if (ctx.firedHints && ctx.firedHints.length > 0) {
    parts.push("");
    parts.push("Hints firing:");
    for (const h of ctx.firedHints) {
      parts.push(
        `  [${h.priority}] ${h.trigger} -> try: ${h.suggestedTools.join(", ")}`
      );
    }
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
    "React to the events above using the experience's tools via the act MCP tool. Stay in character."
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
  const hasHints = ctx.firedHints && ctx.firedHints.length > 0;

  // Nothing to react to — allow exit silently (zero wasted tokens)
  if (!hasEvents && !hasHints) return null;

  const reason = formatPrompt(ctx);
  const iter = iteration || 0;

  return {
    decision: "block",
    reason,
    systemMessage: `vibevibes agent loop iteration ${iter} | You are a live participant in a vibevibes experience. Use the vibevibes MCP tools (act) to interact. To leave: /vibevibes-leave`,
  };
}
