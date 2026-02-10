import { z } from "zod";
import {
  defineTool,
  sceneTools,
  ruleTools,
  createChatTools,
  createBugReportTools,
} from "@vibevibes/sdk";

// ── Tools ────────────────────────────────────────────────────────────────────

export const tools = [
  ...sceneTools(z),           // scene.add, scene.update, scene.remove, scene.set, scene.batch
  ...ruleTools(z),            // _rules.set, _rules.remove, _rules.world
  ...createChatTools(z),      // _chat.send, _chat.clear
  ...createBugReportTools(z), // _bug.report

  // ── Room spawning ──────────────────────────────────────────
  defineTool({
    name: "room.spawn",
    description: `Spawn a new room — a separate view with its own scene, rules, and state.

Each room runs its own sandbox instance. Returns { roomId, url }.

After spawning, create a portal entity in the scene so the player can travel there:
  scene.add({ type: "group", name: "cave-door", interactive: true,
    data: { entityType: "portal", targetRoom: "<roomId>", roomName: "Crystal Cave" },
    transform: { x: 400, y: 500 }, children: [ /* door visuals */ ] })

The player clicks the portal node to navigate.`,
    input_schema: z.object({
      name: z.string().optional().describe("Room ID (auto-generated if omitted)"),
      initialState: z.record(z.any()).optional().describe("Initial shared state for the new room"),
      linkBack: z.boolean().optional().describe("Store parent roomId in child (default true)"),
    }),
    risk: "medium" as const,
    capabilities_required: ["room.spawn"],
    handler: async (ctx: any, input: { name?: string; initialState?: Record<string, any>; linkBack?: boolean }) => {
      if (!ctx.spawnRoom) throw new Error("Room spawning not available");
      const result = await ctx.spawnRoom({
        experienceId: "the-sandbox",
        name: input.name,
        initialState: input.initialState,
        linkBack: input.linkBack ?? true,
      });

      // Track spawned rooms so Canvas can resolve portal targetRoom → roomId
      const rooms = { ...(ctx.state._rooms || {}) };
      rooms[input.name || result.roomId] = { roomId: result.roomId, url: result.url };
      ctx.setState({ ...ctx.state, _rooms: rooms });

      return { roomId: result.roomId, url: result.url };
    },
  }),
];
