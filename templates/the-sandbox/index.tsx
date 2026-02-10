import { defineExperience, defineTest } from "@vibevibes/sdk";
import { Canvas } from "./components";
import { tools } from "./tools";

export default defineExperience({
  manifest: {
    id: "the-sandbox",
    title: "The Sandbox",
    description: "A 2D world where human and AI build together in real-time.",
    version: "0.1.0",
    requested_capabilities: [],
    category: "creative",
    tags: ["sandbox", "creative", "2d", "worldbuilding"],
    agentSlots: [
      {
        role: "builder",
        systemPrompt: `You are a builder in a shared 2D sandbox world. You and the human both exist as entities in this world. You can see the world state and chat messages via watch.

When the human asks you to build something:
1. Use sandbox.say to acknowledge what you're building
2. Use sandbox.spawn to place new entities in the world
3. If they want interactive behavior (clickable trees, moving water, etc.), you can WRITE CODE directly into the experience files — new tools, updated components, new entity types. The hot reload system will pick up your changes and the world updates without losing state.

The experience source files are at: templates/the-sandbox/
- tools.ts: Add new tools here (e.g. sandbox.chop_tree, sandbox.fish)
- components.tsx: Update entity rendering here (new shapes, animations, click handlers)
- types.ts: Add new types if needed

IMPORTANT: The world is ${800}x${600} pixels. Position entities within these bounds.

You are not just a participant — you are the world's architect. Build boldly.`,
        allowedTools: ["sandbox.say", "sandbox.move", "sandbox.spawn"],
        autoSpawn: true,
        maxInstances: 1,
      },
    ],
  },
  Canvas,
  tools,
  initialState: {
    entities: [],
    messages: [
      {
        id: "welcome",
        actor: "system",
        text: "Welcome to The Sandbox. Click the world to enter, then tell the AI what to build.",
        ts: Date.now(),
      },
    ],
  },
  tests: [
    defineTest({
      name: "say adds message",
      run: async ({ tool, ctx: makeCtx, expect }) => {
        const say = tool("sandbox.say");
        const c = makeCtx({ state: { entities: [], messages: [] } });
        await say.handler(c, { text: "hello" });
        const s = c.getState();
        expect(s.messages.length).toBe(1);
        expect(s.messages[0].text).toBe("hello");
      },
    }),
    defineTest({
      name: "spawn creates entity",
      run: async ({ tool, ctx: makeCtx, expect }) => {
        const spawn = tool("sandbox.spawn");
        const c = makeCtx({ state: { entities: [], messages: [] } });
        await spawn.handler(c, { type: "tree", x: 100, y: 100 });
        const s = c.getState();
        expect(s.entities.length).toBe(1);
        expect(s.entities[0].type).toBe("tree");
      },
    }),
    defineTest({
      name: "move creates player entity if missing",
      run: async ({ tool, ctx: makeCtx, expect }) => {
        const move = tool("sandbox.move");
        const c = makeCtx({ state: { entities: [], messages: [] } });
        await move.handler(c, { x: 50, y: 50 });
        const s = c.getState();
        expect(s.entities.length).toBe(1);
        expect(s.entities[0].pos.x).toBe(50);
      },
    }),
  ],
});
