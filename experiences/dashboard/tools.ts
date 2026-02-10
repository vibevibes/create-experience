import { z } from "zod";
import {
  defineTool,
  quickTool,
  createChatTools,
  createBugReportTools,
} from "@vibevibes/sdk";

// ── Helpers ─────────────────────────────────────────────────────────────────

function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// ── Tools ───────────────────────────────────────────────────────────────────

export const tools = [
  ...createChatTools(z),
  ...createBugReportTools(z),

  // ── Panel: Add ──────────────────────────────────────────────
  defineTool({
    name: "panel.add",
    description: `Add a new panel to the dashboard.
Types: metric (single value display), chart (bar chart from data points),
list (list of items), note (freeform text insight).`,
    input_schema: z.object({
      title: z.string().min(1).max(100).describe("Panel title"),
      type: z.enum(["metric", "chart", "list", "note"]).describe("Panel type"),
      data: z.any().optional().describe("Panel data — shape depends on type"),
      position: z.object({
        x: z.number().default(0),
        y: z.number().default(0),
      }).optional(),
      size: z.object({
        w: z.number().default(300),
        h: z.number().default(200),
      }).optional(),
    }),
    handler: async (ctx: any, input: any) => {
      const panel = {
        id: uid(),
        title: input.title,
        type: input.type,
        data: input.data ?? null,
        position: input.position ?? { x: 0, y: 0 },
        size: input.size ?? { w: 300, h: 200 },
        createdBy: ctx.actorId,
        createdAt: ctx.timestamp,
      };
      const panels = [...(ctx.state.panels || []), panel];
      ctx.setState({
        ...ctx.state,
        panels,
        lastActivity: ctx.timestamp,
      });
      return { panelId: panel.id, panelCount: panels.length };
    },
  }),

  // ── Panel: Update ───────────────────────────────────────────
  defineTool({
    name: "panel.update",
    description: "Update an existing panel's title, data, position, or size.",
    input_schema: z.object({
      id: z.string().describe("Panel ID to update"),
      title: z.string().optional(),
      data: z.any().optional(),
      position: z.object({ x: z.number(), y: z.number() }).optional(),
      size: z.object({ w: z.number(), h: z.number() }).optional(),
    }),
    handler: async (ctx: any, input: any) => {
      const panels = (ctx.state.panels || []).map((p: any) => {
        if (p.id !== input.id) return p;
        return {
          ...p,
          ...(input.title !== undefined && { title: input.title }),
          ...(input.data !== undefined && { data: input.data }),
          ...(input.position !== undefined && { position: input.position }),
          ...(input.size !== undefined && { size: input.size }),
        };
      });
      ctx.setState({ ...ctx.state, panels, lastActivity: ctx.timestamp });
      return { updated: true };
    },
  }),

  // ── Panel: Remove ───────────────────────────────────────────
  quickTool(
    "panel.remove",
    "Remove a panel from the dashboard",
    z.object({ id: z.string().describe("Panel ID to remove") }),
    async (ctx: any, input: { id: string }) => {
      const panels = (ctx.state.panels || []).filter(
        (p: any) => p.id !== input.id
      );
      ctx.setState({ ...ctx.state, panels, lastActivity: ctx.timestamp });
      return { removed: true, remaining: panels.length };
    },
  ),

  // ── Data: Add ───────────────────────────────────────────────
  defineTool({
    name: "data.add",
    description: "Add a data point to the shared dataset. Data points have a label, numeric value, timestamp, and category.",
    input_schema: z.object({
      label: z.string().min(1).describe("Data point label"),
      value: z.number().describe("Numeric value"),
      category: z.string().default("general").describe("Category for grouping"),
    }),
    handler: async (ctx: any, input: any) => {
      const point = {
        id: uid(),
        label: input.label,
        value: input.value,
        timestamp: ctx.timestamp,
        category: input.category,
      };
      const dataPoints = [...(ctx.state.dataPoints || []), point];
      const categories = Array.from(
        new Set([...(ctx.state.categories || []), input.category])
      );
      ctx.setState({
        ...ctx.state,
        dataPoints,
        categories,
        lastActivity: ctx.timestamp,
      });
      return { pointId: point.id, totalPoints: dataPoints.length };
    },
  }),

  // ── Data: Clear ─────────────────────────────────────────────
  quickTool(
    "data.clear",
    "Clear all data points (keeps panels intact)",
    z.object({
      category: z.string().optional().describe("Clear only this category (omit to clear all)"),
    }),
    async (ctx: any, input: { category?: string }) => {
      let dataPoints = ctx.state.dataPoints || [];
      if (input.category) {
        dataPoints = dataPoints.filter(
          (dp: any) => dp.category !== input.category
        );
      } else {
        dataPoints = [];
      }
      const categories = Array.from(
        new Set(dataPoints.map((dp: any) => dp.category))
      );
      ctx.setState({
        ...ctx.state,
        dataPoints,
        categories,
        lastActivity: ctx.timestamp,
      });
      return { cleared: true, remaining: dataPoints.length };
    },
  ),
];
