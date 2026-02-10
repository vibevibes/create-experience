// ── Vibes: The Card Game ─────────────────────────────────────────────────────
//
// The moment:  You play a card, and the AI counters with a move you didn't see
//              coming — a bluff, a steal, a perfectly-timed shield. You laugh.
//              That's the moment.
//
// The loop:    Human plays a card → AI reads the board, adapts strategy,
//              plays its counter → Human rethinks, adjusts → AI surprises
//              again → emergent back-and-forth that neither controls.
//
// The surprise: The AI bluffs. It plays a low card with confidence,
//               holds its best cards for a devastating combo, or shields
//               right before you try to steal. It has *personality*.
//
// ─────────────────────────────────────────────────────────────────────────────

import { defineExperience } from "@vibevibes/sdk";
import { Canvas } from "./canvas";
import { tools } from "./tools";
import { tests } from "./tests";
import { hints, agents, observe } from "./agent";
import { stateSchema } from "./types";

// ── Experience Definition ────────────────────────────────────────────────────

export default defineExperience({
  name: "Vibes",
  manifest: {
    id: "card-game-vibes",
    title: "Vibes",
    description: "A card game where human and AI play with elemental cards, special effects, and strategic bluffing",
    version: "1.0.0",
    requested_capabilities: ["state.write"],
    category: "games",
    tags: ["card-game", "strategy", "multiplayer", "ai-opponent"],
  },
  stateSchema,
  Canvas,
  tools,
  tests,
  hints,
  agents,
  observe,
});
