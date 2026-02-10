// ── Collaborative Dashboard ──────────────────────────────────────────────────
//
// The moment:  You drop a data point into the dashboard and the AI instantly
//              spots a trend you missed, creating an insight panel that reframes
//              everything you thought you knew about your data.
//
// The loop:    Human adds data → Agent analyzes and creates insight panels →
//              Human sees a new angle → adds more data to test it →
//              Agent correlates across categories → dashboard evolves.
//
// The surprise: The agent notices correlations between categories the human
//               never thought to compare, and proactively creates summary
//               panels that tell a story the data was hiding.
//

import { z } from "zod";
import { defineExperience } from "@vibevibes/sdk";
import { Canvas } from "./canvas";
import { tools } from "./tools";
import { tests } from "./tests";
import { hints, agents, observe } from "./agent";
import type { DashboardState } from "./types";

// ── State Schema ────────────────────────────────────────────────────────────

const stateSchema = z.object({
  panels: z.array(z.object({
    id: z.string(),
    title: z.string(),
    type: z.enum(["metric", "chart", "list", "note"]),
    data: z.any(),
    position: z.object({ x: z.number(), y: z.number() }),
    size: z.object({ w: z.number(), h: z.number() }),
    createdBy: z.string(),
    createdAt: z.number(),
  })).default([]),
  dataPoints: z.array(z.object({
    id: z.string(),
    label: z.string(),
    value: z.number(),
    timestamp: z.number(),
    category: z.string(),
  })).default([]),
  categories: z.array(z.string()).default([]),
  lastActivity: z.number().default(0),
  _chat: z.array(z.any()).default([]),
  _bugReports: z.array(z.any()).default([]),
});

// ── Initial State ───────────────────────────────────────────────────────────

const initialState: DashboardState = {
  panels: [],
  dataPoints: [],
  categories: [],
  lastActivity: 0,
  _chat: [],
  _bugReports: [],
};

// ── Experience Definition ───────────────────────────────────────────────────

export default defineExperience({
  name: "Collaborative Dashboard",
  manifest: {
    id: "dashboard",
    title: "Collaborative Dashboard",
    description: "A shared dashboard where human and AI analyze data together",
    version: "1.0.0",
    requested_capabilities: ["state.write"],
  },
  stateSchema,
  Canvas,
  tools,
  tests,
  hints,
  agents,
  observe,
  initialState,
});
