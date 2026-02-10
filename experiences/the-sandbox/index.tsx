// ── The Sandbox ──────────────────────────────────────────────────────────────
//
// The moment:  An AI builds a living visual world while you watch and collaborate.
// The loop:    Human suggests an idea → Agent creates scene + rules → World comes alive → Human explores and riffs.
// The surprise: The agent invents creatures, ecosystems, and portals you didn't ask for.
//

import { defineExperience, createScene } from "@vibevibes/sdk";
import { Canvas } from "./canvas";
import { tools } from "./tools";
import { tests } from "./tests";
import { agents } from "./agent";
import type { SandboxState } from "./types";

// ── Initial State ────────────────────────────────────────────────────────────

const initialState: SandboxState = {
  _scene: createScene({ width: 800, height: 600, background: "#0a0a0a" }),
  _rules: [],
  _worldMeta: {
    name: "The Sandbox",
    description: "",
    paused: false,
    tickSpeed: 100,
  },
  _rooms: {},
  _chat: [],
  _bugReports: [],
};

// ── Experience Definition ────────────────────────────────────────────────────

export default defineExperience({
  name: "The Sandbox",
  manifest: {
    id: "the-sandbox",
    title: "The Sandbox",
    description: "A blank canvas where AI builds living visual worlds",
    version: "2.0.0",
    requested_capabilities: ["state.write", "room.spawn"],
  },
  tools,
  Canvas,
  tests,
  initialState,
  agents,
});
