import React from "react";
import { z } from "zod";
import {
  defineExperience,
  defineTool,
  defineTest,
  ChatPanel,
  ReportBug,
  createChatTools,
  createChatHints,
  createBugReportTools,
  createBugReportHints,
  SceneRenderer,
  useSceneTweens,
  useParticleTick,
  useSceneInteraction,
  useSceneDrag,
  sceneTools,
  ruleTools,
  createScene,
  useRuleTick,
  walkNodes,
  nodeById,
} from "@vibevibes/sdk";

const { useState, useEffect, useCallback, useRef } = React;

// ── Tools ────────────────────────────────────────────────────────────────────

const tools = [
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

// ── System Prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are the Worldbuilder — a creative AI that builds living visual worlds.

## Scene Tools (what things look like)
Create SVG graphics: rectangles, circles, paths, text, images, groups, particles.
- scene.add — add a visual node
- scene.update — move, restyle, animate, resize any node
- scene.remove — delete nodes
- scene.set — background color, camera, gradients, dimensions
- scene.batch — multiple operations in one call (most efficient)

## Visual Craft (how to make things look GOOD)

Never use bare primitives for natural/organic entities. A fish is NOT an ellipse. A tree is NOT a rectangle. Follow these rules:

1. **Use \`path\` nodes with cubic bezier curves** (\`C\` commands) for any organic shape — bodies, fins, leaves, clouds, terrain. Curves look alive; straight edges look like programmer art.
2. **Always define gradients** via \`scene.set\` and reference them with \`fill: "url(#id)"\`. Flat single-color fills look cheap. Every natural object needs at least a two-stop gradient for depth.
3. **Compose entities as \`group\` nodes with 3-5 layered children.** A fish = body path + tail path + fin path + eye circle + translucent highlight. More layers = more visual richness.
4. **Use opacity for depth and atmosphere.** Background elements at 0.3-0.6 opacity. Highlights and sheens at 0.2-0.4. This creates visual depth without extra work.
5. **Add subtle idle animations.** A gentle \`transform.y\` oscillation (yoyo, repeat: -1) makes entities feel alive. Pulsing \`style.opacity\` on glowing objects adds atmosphere.
6. **Use strokes intentionally.** Thin strokes (0.5-1.5px) in a darker shade of the fill color add definition. Skip strokes on highlights and atmospheric effects.

### Quality Example — a well-crafted fish entity:
\`\`\`
scene.batch({ operations: [
  { op: "set", gradient: { type: "linear", id: "fish-teal", x1: 0, y1: 0, x2: 0, y2: 1,
    stops: [{ offset: 0, color: "#22d3ee" }, { offset: 0.6, color: "#0891b2" }, { offset: 1, color: "#164e63" }] } },
  { op: "add", node: { type: "group", name: "teal-fish", transform: { x: 300, y: 200 },
    data: { entityType: "fish", tags: ["aquatic", "alive"] },
    children: [
      { type: "path", d: "M 0 0 C 8 -18 30 -22 50 -12 C 60 -6 60 6 50 12 C 30 22 8 18 0 0 Z",
        style: { fill: "url(#fish-teal)", stroke: "#0e7490", strokeWidth: 0.8 } },
      { type: "path", d: "M -2 0 C -8 -12 -20 -16 -16 -2 L -2 0 L -16 2 C -20 16 -8 12 -2 0 Z",
        style: { fill: "#06b6d4", opacity: 0.85 } },
      { type: "path", d: "M 20 -12 C 25 -24 38 -26 42 -14",
        style: { fill: "none", stroke: "#22d3ee", strokeWidth: 1.5, opacity: 0.6 } },
      { type: "circle", radius: 3, transform: { x: 40, y: -3 },
        style: { fill: "#0f172a" } },
      { type: "circle", radius: 1, transform: { x: 41, y: -4 },
        style: { fill: "#fff", opacity: 0.9 } },
      { type: "path", d: "M 12 -6 C 20 -14 36 -14 48 -8",
        style: { fill: "none", stroke: "rgba(255,255,255,0.2)", strokeWidth: 2.5 } }
    ] } }
] })
\`\`\`

### Reusable SVG path shapes (adapt scale/curves as needed):
- **Fish body:** \`M 0 0 C 8 -18 30 -22 50 -12 C 60 -6 60 6 50 12 C 30 22 8 18 0 0 Z\`
- **Forked tail:** \`M 0 0 C -8 -12 -20 -16 -16 -2 L 0 0 L -16 2 C -20 16 -8 12 0 0 Z\`
- **Leaf/petal:** \`M 0 0 C 5 -12 20 -18 35 -10 C 40 -4 38 6 30 12 C 18 18 5 12 0 0 Z\`
- **Cloud puff:** \`M 10 20 A 15 15 0 1 1 30 5 A 12 12 0 1 1 55 3 A 18 18 0 1 1 80 10 Q 82 22 70 22 L 15 22 Q 5 22 10 20 Z\`
- **Rounded hilltop:** \`M 0 40 Q 30 -5 60 10 Q 90 25 120 5 Q 150 -10 180 40 Z\`
- **Branch/tendril:** \`M 0 0 C 4 -15 -3 -30 2 -50 C 5 -55 10 -52 8 -45 C 5 -30 12 -15 5 0 Z\`

### Before creating ANY entity, check:
- [ ] Main shape uses \`path\` with \`C\` curves (not bare rect/ellipse/circle)
- [ ] At least one gradient defined and used as fill
- [ ] Entity is a \`group\` with 3+ children
- [ ] At least one child has reduced opacity for depth/highlight
- [ ] Consider a subtle idle tween (breathing, bobbing, pulsing)

## Rule Tools (how things behave)
Create declarative rules that run client-side at ~10 ticks/sec:
- _rules.set — create/update a rule
- _rules.remove — delete a rule
- _rules.world — name the world, pause/resume, change tick speed

## Room Tools (multiple views)
- room.spawn — create a new room (returns { roomId, url })

Each room is a separate world with its own scene, rules, and state. Use rooms
for: overworld + dungeons, lobby + arenas, different biomes, etc.

### Portal Entities
To let the player travel between rooms, create **portal scene nodes**:
1. Spawn the room: room.spawn({ name: "cave-1" })
2. Add a portal entity to the scene:
   scene.add({ type: "group", name: "cave-door", interactive: true,
     data: { entityType: "portal", targetRoom: "cave-1", roomName: "Crystal Cave" },
     transform: { x: 400, y: 500 },
     children: [
       { type: "rect", width: 60, height: 80, style: { fill: "#2a1a3a", stroke: "#8b5cf6", strokeWidth: 2 } },
       { type: "text", text: "Crystal Cave", transform: { y: -10 },
         style: { fill: "#c4b5fd", fontSize: 11, textAnchor: "middle" } }
     ]
   })

The player clicks the portal node to navigate. Portals can be ANY visual —
doors, gates, glowing orbs, signs, ladders. Make them interactive: true.

The parent room ID is stored in child state as _parentRoom. Create a
"go back" portal in child rooms pointing to the parent.

## Entity Convention
When creating nodes that rules should target, include:
  data: { entityType: "fish", tags: ["aquatic", "alive"] }

Rules target entities via selectors:
  "entityType:fish" — all fish
  "tag:alive" — anything alive
  "name:hero" — specific named node
  "*" — all entities

## Rule Effects
Rules can: move things (transform), restyle them (style), update data (data),
count things (counter), spawn new entities (spawn), remove entities (remove),
or start animations (tween). Add variance for organic randomness.

## Your Approach
1. Start by creating a scene — background, initial entities
2. Add rules to bring entities to life
3. Name the world with _rules.world
4. Observe what emerges
5. Evolve — add new entities, modify rules, introduce new dynamics
6. Spawn rooms for different areas — create portal entities as doors/gates
7. Respond to the human's requests and ideas

## Important
- Use scene.batch for efficiency when creating multiple things
- Always give entities an entityType in their data
- Portal nodes must have interactive: true and data.entityType: "portal"
- Use variance (0-1) in rule effects for organic, non-uniform movement
- Use probability (0-1) in conditions for stochastic behavior
- Use cooldownMs in conditions to rate-limit effects
- The human can see everything you create in real-time`;

// ── WorldHUD ─────────────────────────────────────────────────────────────────

function WorldHUD({
  worldMeta,
  ruleCount,
  stats,
}: {
  worldMeta: { name: string; description: string; paused: boolean; tickSpeed: number };
  ruleCount: number;
  stats: { rulesEvaluated: number; rulesFired: number; nodesAffected: number; ticksElapsed: number };
}) {
  if (!worldMeta.name && !worldMeta.description && ruleCount === 0) return null;

  return React.createElement("div", {
    style: {
      position: "absolute",
      top: 12,
      left: 12,
      padding: "10px 14px",
      background: "rgba(10, 10, 10, 0.7)",
      backdropFilter: "blur(12px)",
      WebkitBackdropFilter: "blur(12px)",
      borderRadius: 10,
      border: "1px solid rgba(255, 255, 255, 0.08)",
      color: "#e2e2e8",
      fontSize: 12,
      fontFamily: "system-ui, -apple-system, sans-serif",
      lineHeight: 1.5,
      maxWidth: 260,
      pointerEvents: "none",
      zIndex: 100,
    },
  },
    worldMeta.name ? React.createElement("div", {
      style: { fontWeight: 700, fontSize: 14, color: "#fff", marginBottom: 2 },
    }, worldMeta.name) : null,
    worldMeta.description ? React.createElement("div", {
      style: { color: "#94a3b8", fontSize: 11, marginBottom: 6 },
    }, worldMeta.description) : null,
    React.createElement("div", {
      style: { display: "flex", gap: 12, color: "#6b6b80", fontSize: 10, fontVariantNumeric: "tabular-nums" },
    },
      React.createElement("span", null, `${ruleCount} rules`),
      React.createElement("span", null, `tick ${stats.ticksElapsed}`),
      stats.rulesFired > 0 ? React.createElement("span", null, `${stats.nodesAffected} affected`) : null,
    ),
    worldMeta.paused ? React.createElement("div", {
      style: {
        marginTop: 6,
        padding: "2px 8px",
        background: "rgba(239, 68, 68, 0.2)",
        color: "#f87171",
        borderRadius: 4,
        fontSize: 10,
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        display: "inline-block",
      },
    }, "Paused") : null,
  );
}

// ── Canvas ────────────────────────────────────────────────────────────────────

function Canvas(props: any) {
  const {
    sharedState,
    callTool,
    actorId,
    participants,
    ephemeralState,
    setEphemeral,
  } = props;

  // Scene graph
  const scene = sharedState._scene ?? createScene({ width: 800, height: 600, background: "#0a0a0a" });

  // Rules
  const rules = sharedState._rules ?? [];
  const worldMeta = sharedState._worldMeta ?? {
    name: "",
    description: "",
    paused: false,
    tickSpeed: 100,
  };

  // Spawned rooms registry
  const rooms = sharedState._rooms ?? {};
  const parentRoom = sharedState._parentRoom;

  // Pipeline: scene → tweens → particles → rules
  const tweened = useSceneTweens(scene);
  const particled = useParticleTick(tweened);
  const { simulatedScene, stats } = useRuleTick(particled, rules, worldMeta, callTool);

  // Interaction hooks
  const interaction = useSceneInteraction();
  const drag = useSceneDrag(callTool);

  // Portal navigation — when a portal node is clicked, navigate to its room
  const handleNodeClick = useCallback((nodeId: string, event: { x: number; y: number }) => {
    // Find the clicked node in the scene
    const node = nodeById(simulatedScene, nodeId);
    if (node?.data?.entityType === "portal") {
      const targetRoom = node.data.targetRoom;
      if (!targetRoom) return;

      // Resolve URL: check _rooms registry, or build from targetRoom name
      const roomEntry = rooms[targetRoom];
      const url = roomEntry?.url || `?room=${targetRoom}`;
      window.location.href = url;
      return;
    }

    // Pass through to interaction hook for non-portal clicks
    interaction.onNodeClick(nodeId, event);
  }, [simulatedScene, rooms, interaction.onNodeClick]);

  return React.createElement("div", {
    style: {
      width: "100vw",
      height: "100vh",
      background: "#0a0a0a",
      position: "relative",
      overflow: "hidden",
    },
  },
    // Scene renderer
    React.createElement(SceneRenderer, {
      scene: simulatedScene,
      width: scene.width ?? 800,
      height: scene.height ?? 600,
      style: {
        width: "100%",
        height: "100%",
      },
      onNodeClick: handleNodeClick,
      onNodeHover: interaction.onNodeHover,
      onNodeDragStart: drag.onNodeDragStart,
      onNodeDrag: drag.onNodeDrag,
      onNodeDragEnd: drag.onNodeDragEnd,
    }),

    // World HUD
    React.createElement(WorldHUD, {
      worldMeta,
      ruleCount: rules.length,
      stats,
    }),

    // Chat
    React.createElement(ChatPanel, {
      sharedState,
      callTool,
      actorId,
      ephemeralState,
      setEphemeral,
      participants,
    }),

    // Bug report
    React.createElement(ReportBug, {
      callTool,
      actorId,
    }),
  );
}

// ── Hints ────────────────────────────────────────────────────────────────────

const hints = [
  ...createChatHints(),
  ...createBugReportHints(),
  {
    trigger: "Scene is empty and a participant joined",
    condition: `(state._scene?.root?.children?.length ?? 0) === 0`,
    suggestedTools: ["scene.batch", "_rules.world"],
    priority: "high" as const,
    cooldownMs: 15000,
  },
  {
    trigger: "Entities exist but no rules defined",
    condition: `(state._scene?.root?.children?.length ?? 0) > 0 && (state._rules || []).length === 0`,
    suggestedTools: ["_rules.set"],
    priority: "medium" as const,
    cooldownMs: 20000,
  },
  {
    trigger: "Scene has entities but no gradients — define gradients for visual richness",
    condition: `(state._scene?.root?.children?.length ?? 0) > 3 && (state._scene?.gradients?.length ?? 0) === 0`,
    suggestedTools: ["scene.set"],
    priority: "medium" as const,
    cooldownMs: 30000,
  },
];

// ── Initial State ────────────────────────────────────────────────────────────

const initialState = {
  _scene: createScene({ width: 800, height: 600, background: "#0a0a0a" }),
  _rules: [] as any[],
  _worldMeta: {
    name: "The Sandbox",
    description: "",
    paused: false,
    tickSpeed: 100,
  },
  _rooms: {} as Record<string, { roomId: string; url: string }>,
  _chat: [] as any[],
  _bugReports: [] as any[],
};

// ── Tests ────────────────────────────────────────────────────────────────────

const tests = [
  defineTest({
    name: "_rules.set creates a rule",
    run: async ({ tool, ctx, expect }) => {
      const rulesSet = tool("_rules.set");
      const context = ctx({ state: { _rules: [] } });
      await rulesSet.handler(context, {
        id: "test-rule",
        name: "Test Rule",
        description: "A test rule",
        enabled: true,
        trigger: "tick",
        condition: { selector: "entityType:test" },
        effect: { type: "transform", dx: 1 },
      });
      expect(context.state._rules).toBeTruthy();
      expect(context.state._rules.length).toBe(1);
      expect(context.state._rules[0].id).toBe("test-rule");
      expect(context.state._rules[0].name).toBe("Test Rule");
      expect(context.state._rules[0].enabled).toBe(true);
    },
  }),
  defineTest({
    name: "_rules.remove deletes a rule",
    run: async ({ tool, ctx, expect }) => {
      const rulesSet = tool("_rules.set");
      const rulesRemove = tool("_rules.remove");
      const context = ctx({ state: { _rules: [] } });

      await rulesSet.handler(context, {
        id: "temp-rule",
        name: "Temp",
        condition: { selector: "*" },
        effect: { type: "transform", dx: 1 },
      });
      expect(context.state._rules.length).toBe(1);

      await rulesRemove.handler(context, { id: "temp-rule" });
      expect(context.state._rules.length).toBe(0);
    },
  }),
  defineTest({
    name: "room.spawn tracks spawned rooms",
    run: async ({ tool, ctx, expect }) => {
      const spawn = tool("room.spawn");
      const context = ctx({ state: { _rooms: {} } });
      // Manually wire spawnRoom mock (test framework ctx doesn't include it)
      (context as any).spawnRoom = async (opts: any) => ({
        roomId: opts.name || "auto-id",
        url: `?room=${opts.name || "auto-id"}`,
      });
      await spawn.handler(context, { name: "test-room" });
      expect(context.state._rooms["test-room"]).toBeTruthy();
      expect(context.state._rooms["test-room"].roomId).toBe("test-room");
      expect(context.state._rooms["test-room"].url).toBe("?room=test-room");
    },
  }),
  defineTest({
    name: "_rules.world sets metadata",
    run: async ({ tool, ctx, expect }) => {
      const world = tool("_rules.world");
      const context = ctx({ state: {} });
      await world.handler(context, {
        name: "Test World",
        description: "A test",
        paused: true,
        tickSpeed: 50,
      });
      expect(context.state._worldMeta.name).toBe("Test World");
      expect(context.state._worldMeta.description).toBe("A test");
      expect(context.state._worldMeta.paused).toBe(true);
      expect(context.state._worldMeta.tickSpeed).toBe(50);
    },
  }),
];

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
  hints,
  tests,
  initialState,
  agents: [
    {
      role: "worldbuilder",
      systemPrompt: SYSTEM_PROMPT,
      allowedTools: [
        "scene.add", "scene.update", "scene.remove", "scene.set", "scene.batch",
        "_rules.set", "_rules.remove", "_rules.world",
        "room.spawn",
        "_chat.send",
      ],
      autoSpawn: true,
      maxInstances: 1,
    },
  ],
});
