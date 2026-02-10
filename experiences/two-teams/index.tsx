// ── Two Teams ────────────────────────────────────────────────────────────────
//
// The moment:  Two sides of the screen, two teams, one winner.
// The loop:    Player joins a team → attacks/defends/boosts → rounds advance → final score.
// The surprise: The AI joins the losing team, hypes up big plays, keeps the energy electric.
//

import { defineExperience } from "@vibevibes/sdk";
import { Canvas } from "./canvas";
import { tools } from "./tools";
import { tests } from "./tests";
import { agents } from "./agent";
import { initialState } from "./utils";

export default defineExperience({
  name: "Two Teams",
  manifest: {
    id: "two-teams",
    title: "Two Teams",
    description: "Pick a side. Left vs Right. Attack, defend, boost. Highest score wins.",
    version: "1.0.0",
    requested_capabilities: ["state.write"],
  },
  tools,
  Canvas,
  tests,
  initialState,
  agents,
});
