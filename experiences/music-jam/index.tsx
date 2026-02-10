// ── Music Jam ────────────────────────────────────────────────────────────────
//
// The moment:  You tap out a kick pattern. The AI hears the groove forming
//              and drops a syncopated bassline that locks in perfectly —
//              then suggests "let's take this to half-time."
//
// The loop:    Human places beats on the grid
//              -> Agent reads the emerging pattern and complements it
//              -> Human reacts to the AI's additions, adjusts, builds on top
//              -> Agent suggests a genre shift or breakdown
//              -> The beat evolves into something neither planned
//
// The surprise: The AI doesn't just fill gaps — it has musical opinions.
//              It introduces polyrhythms you didn't ask for, ghost notes
//              that make the groove breathe, and tempo changes that reframe
//              everything you built together.
//

import { defineExperience } from "@vibevibes/sdk";
import { Canvas } from "./canvas";
import { tools } from "./tools";
import { tests } from "./tests";
import { agents, observe } from "./agent";
import { stateSchema, createInitialState } from "./types";

// ── Experience Definition ────────────────────────────────────────────────────

export default defineExperience({
  name: "Music Jam",
  manifest: {
    id: "music-jam",
    title: "Music Jam",
    description:
      "A collaborative 16-step sequencer where human and AI create beats together",
    version: "1.0.0",
    requested_capabilities: ["state.write"],
    category: "music",
    tags: ["music", "sequencer", "beats", "collaborative", "creative"],
  },
  stateSchema,
  Canvas,
  tools,
  tests,
  agents,
  observe,
  initialState: createInitialState(),
});
