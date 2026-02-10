# create-experience — LLM Reference

> You are building a **vibe-vibe experience**: a shared interactive app where humans (in the browser) and AI agents (via MCP tools) collaborate in real-time through a shared state managed by tools.

---

## Before You Write Code

Answer these three questions first. Write them as comments at the top of `src/index.tsx` before writing any code.

1. **The moment:** What's the single coolest thing that happens when human + AI play this together?
2. **The loop:** Human does X → Agent responds with Y → Human builds on it → ... What's the core interaction cycle?
3. **The surprise:** What does the agent do that the human didn't expect? Where does emergence live?

These answers are your creative north star. Every tool, component, and hint you write should serve the loop.

---

## Creative Principles

When building an experience, think in terms of **emergent interactions**, not features:

- **Asymmetry is the point.** What can the human do that the agent can't? What can the agent do that the human can't? Where do those differences create something neither could make alone?
- **Start with one compelling interaction loop**, not a feature list. A drawing app where the AI colorizes your sketches > a drawing app with 20 brush tools.
- **State is the shared imagination.** Design your state shape to be *legible to the agent* — flat keys, descriptive names, meaningful values. An agent reasons about `{ mood: "tense", threatLevel: 3 }` better than `{ m: 2, tl: 3 }`.
- **Agent hints are your creative direction.** Use them to make the agent *surprising* — hints that fire on unexpected conditions create the moments humans share with friends.
- **Let the agent be an author, not a servant.** The best experiences give the agent creative latitude. Don't micromanage every response — give it a role and let it surprise you.

---

## IMPORTANT: Use the LOCAL MCP tools

This project registers a **local** MCP server (`vibevibes` in `.mcp.json`) via the published `@vibevibes/mcp` npm package. It exposes tools: `connect`, `act`, `stream`, `spawn_room`, `list_rooms`, `list_experiences`, `room_config_schema`, `memory`, `screenshot`, `blob_set`, `blob_get`. These talk to the **local dev server** at http://localhost:4321.

**DO NOT** use the hosted platform MCP tools (`vibevibes_list_experiences`, `vibevibes_create_room`, `vibevibes_execute_tool`, etc.) — those talk to the cloud. You want the local ones.

---

## Project Structure

```
src/                   <- YOUR EXPERIENCE CODE
  index.tsx            <- Entry point (must export default defineExperience)
  tools.ts             <- Tool definitions (defineTool, quickTool, tool factories)
  canvas.tsx           <- Canvas component and sub-components
  components.tsx       <- Reusable UI components and custom hooks
  agent.ts             <- Agent system prompt, hints, slots
  types.ts             <- TypeScript types and Zod schemas
  utils.ts             <- Pure helper functions, constants
  tests.ts             <- All defineTest definitions
runtime/               <- Local dev runtime. Don't modify.
  server.ts            <- Express + WebSocket server
  tunnel.ts            <- Cloudflare Tunnel for --share mode
  bundler.ts           <- esbuild bundler
  viewer/index.html    <- Browser viewer
.mcp.json              <- Auto-registers vibevibes-mcp with Claude Code
```

### File Organization (MANDATORY)

**No single file may exceed 300 lines.** Split aggressively. Readability is non-negotiable.

| File | Contains | Exports |
|------|----------|---------|
| `src/index.tsx` | Experience wiring only — imports everything else, calls `defineExperience` | `default defineExperience(...)` |
| `src/tools.ts` | All `defineTool` / `quickTool` definitions, tool factory functions | `tools` array |
| `src/canvas.tsx` | The `Canvas` component, sub-components it renders | `Canvas` component |
| `src/components.tsx` | Reusable UI components, custom hooks | Named exports |
| `src/agent.ts` | System prompt string, agent hints array, agent slot configs | `SYSTEM_PROMPT`, `hints`, `agents` |
| `src/types.ts` | TypeScript types, Zod schemas, interfaces | Type exports |
| `src/utils.ts` | Pure helper functions, constants, config values | Named exports |
| `src/tests.ts` | All `defineTest` definitions | `tests` array |

**If any file approaches 300 lines, split it further.** For example:
- `src/tools/scene-tools.ts`, `src/tools/game-tools.ts` for large tool sets
- `src/components/hud.tsx`, `src/components/toolbar.tsx` for complex UIs
- `src/canvas/main.tsx`, `src/canvas/overlays.tsx` for layered canvases

The bundler resolves all imports from `src/` automatically. There is no penalty for more files.

---

## Commands

```bash
npm run dev            # Start local server on http://localhost:4321
npm run dev:share      # Share with friends via public URL (no signup!)
npm run build          # Bundle (check for errors)
npm test               # Run inline tool handler tests
```

---

## Agent Loop (interacting with a running experience)

You are a **live participant** in a shared room. Other participants (humans in the browser, other agents) are acting in real-time. The **stop hook** handles perception automatically — it polls the server for new events from other participants and feeds them back as prompts.

```
1. connect          -> Join the room. Returns tools, state, participants, browser URL.

2. act              -> React to events delivered by the stop hook. Call a tool to mutate state.
                      Use the roomId parameter to target the right room.

3. (stop hook)      -> Automatically fires after each action. Delivers new events from
                      OTHER participants, fired hints, available tools per room, and
                      participant lists. You do NOT need to call watch.
```

```
connect → act → (stop hook delivers events) → act → (stop hook delivers events) → act → ...
```

`act` auto-connects if you haven't called `connect` yet.

**Do NOT call `watch`.** The stop hook replaces it entirely. Just `act` when events arrive.

---

## Building an Experience

An experience is a **multi-file** project in `src/`. The entry point `src/index.tsx` must export a default `defineExperience` — but it should be a **thin wiring file** that imports everything from other modules:

```tsx
// src/index.tsx — KEEP THIS FILE SHORT (under 80 lines)
import { defineExperience } from "@vibevibes/sdk";
import { Canvas } from "./canvas";
import { tools } from "./tools";
import { tests } from "./tests";
import { SYSTEM_PROMPT, hints, agents } from "./agent";
import { observe } from "./agent";
import { initialState } from "./utils";

export default defineExperience({
  manifest: {
    id: "my-experience",
    version: "0.0.1",
    title: "My Experience",
    description: "What this does",
    requested_capabilities: [],
  },
  stateSchema,    // Zod schema → typed state + auto-generated initialState
  Canvas,
  tools,
  tests,
  hints,
  agents,
  observe,
  initialState,   // Optional if stateSchema has defaults for all fields
});
```

The bundler resolves all imports from `src/` automatically. The dev server watches all files in `src/` and hot-reloads on any change. **Every file should have a single responsibility.**

### State Schema (typed state)

Define a Zod schema for your shared state. This gives you:
- **Type safety** — `ctx.state` and `sharedState` are typed throughout
- **Runtime validation** — tool mutations checked against the schema
- **Auto-generated initialState** — `.default()` values populate initial state automatically
- **Agent legibility** — agents can inspect the schema to understand state shape

```tsx
// In src/types.ts
import { z } from "zod";

export const stateSchema = z.object({
  count: z.number().default(0).describe("Current counter value"),
  phase: z.enum(["setup", "playing", "finished"]).default("setup"),
  players: z.array(z.object({
    name: z.string(),
    score: z.number().default(0),
  })).default([]),
});

export type GameState = z.infer<typeof stateSchema>;
```

If both `stateSchema` and `initialState` are provided, `initialState` takes precedence but is validated against the schema at startup. If only `stateSchema` is provided, initial state is auto-generated from `.default()` values.

### Phase Management

Most experiences have phases (setup → playing → scoring → finished). Use the built-in `usePhase` hook and `phaseTool`:

```tsx
// In src/tools.ts
import { phaseTool } from "@vibevibes/sdk";
export const tools = [...yourTools, phaseTool(z, ["setup", "playing", "scoring", "finished"])];

// In src/canvas.tsx
import { usePhase } from "@vibevibes/sdk";

function Canvas(props) {
  const phase = usePhase(props.sharedState, props.callTool, {
    phases: ["setup", "playing", "scoring", "finished"] as const,
  });

  if (phase.is("setup")) return <SetupScreen />;
  if (phase.is("playing")) return <GameBoard />;
  if (phase.is("scoring")) return <ScoreScreen />;

  return <button onClick={phase.next} disabled={phase.isLast}>Next Phase</button>;
}
```

`usePhase` returns: `{ current, index, isFirst, isLast, next, prev, goTo, is }`.

### Canvas Component

The Canvas is a React component that receives these props:

```tsx
type CanvasProps = {
  roomId: string;
  actorId: string;                              // Your actor ID (e.g. "alice-human-1")
  sharedState: Record<string, any>;             // Current shared state (read-only, mutate via callTool)
  callTool: (name: string, input: any) => Promise<any>;  // Call a tool to mutate state
  participants: string[];                       // List of actor IDs in the room
  ephemeralState: Record<string, Record<string, any>>;   // Per-actor ephemeral data
  setEphemeral: (data: Record<string, any>) => void;     // Set your ephemeral data
};
```

### Tools

Tools are the **only** way to mutate shared state. Define them with `defineTool`:

```tsx
const tools = [
  defineTool({
    name: "counter.increment",
    description: "Add to the counter",
    input_schema: z.object({
      amount: z.number().default(1).describe("Amount to add"),
    }),
    handler: async (ctx, input) => {
      const newCount = (ctx.state.count || 0) + input.amount;
      ctx.setState({ ...ctx.state, count: newCount });
      return { count: newCount };
    },
  }),
];
```

**Tool handler context (`ctx`):**

```tsx
type ToolCtx = {
  roomId: string;
  actorId: string;                    // Who called this tool
  owner?: string;                     // Owner extracted from actorId
  state: Record<string, any>;        // Current shared state (READ)
  setState: (s: Record<string, any>) => void;  // Set new state (WRITE)
  timestamp: number;                  // Current time
  memory: Record<string, any>;       // Agent's persistent memory
  setMemory: (updates: Record<string, any>) => void;
};
```

**Shorthand with `quickTool`:**

```tsx
quickTool("counter.reset", "Reset counter to zero", z.object({}), async (ctx) => {
  ctx.setState({ ...ctx.state, count: 0 });
  return { count: 0 };
});
```

### Available Hooks

Import from `@vibevibes/sdk`:

| Hook | Signature | Purpose |
|------|-----------|---------|
| `useToolCall` | `(callTool) => { call, loading, error }` | Wraps callTool with loading/error tracking |
| `useSharedState` | `(sharedState, key, default?) => value` | Typed accessor for a state key |
| `useOptimisticTool` | `(callTool, sharedState) => { call, state, pending }` | Optimistic updates with rollback |
| `useParticipants` | `(participants) => ParsedParticipant[]` | Parse participant IDs into `{ id, username, type, index }` |
| `useAnimationFrame` | `(sharedState, interpolate?) => displayState` | Buffer state updates to animation frames |
| `useFollow` | `(actorId, participants, ephemeral, setEphemeral) => { follow, unfollow, following, followers }` | Follow-mode protocol |
| `useTypingIndicator` | `(actorId, ephemeral, setEphemeral) => { setTyping, typingUsers }` | Typing indicators |
| `useUndo` | `(sharedState, callTool, opts?) => { undo, redo, canUndo, canRedo, undoCount, redoCount }` | Undo/redo via state snapshots. Requires `undoTool(z)` in tools array. |
| `useDebounce` | `(callTool, delayMs?) => debouncedCallTool` | Debounced tool calls (collapse rapid calls). Good for search, text input. |
| `useThrottle` | `(callTool, intervalMs?) => throttledCallTool` | Throttled tool calls (max 1 per interval). Good for cursors, brushes, sliders. |
| `usePhase` | `(sharedState, callTool, { phases }) => { current, next, prev, goTo, is, isFirst, isLast }` | Phase/stage machine. Requires `phaseTool(z)` in tools array. |

### Available Components

Import from `@vibevibes/sdk` (inline-styled, no Tailwind needed):

| Component | Props |
|-----------|-------|
| `Button` | `{ onClick, disabled, variant: 'primary'\|'secondary'\|'danger'\|'ghost', size: 'sm'\|'md'\|'lg', style }` |
| `Card` | `{ title, style }` |
| `Input` | `{ value, onChange: (value) => void, placeholder, type, disabled, style }` |
| `Badge` | `{ color: 'gray'\|'blue'\|'green'\|'red'\|'yellow'\|'purple', style }` |
| `Stack` | `{ direction: 'row'\|'column', gap, align, justify, style }` |
| `Grid` | `{ columns, gap, style }` |
| `Slider` | `{ value, onChange: (value) => void, min, max, step, disabled, label, style }` |
| `Textarea` | `{ value, onChange: (value) => void, placeholder, rows, disabled, style }` |
| `Modal` | `{ open, onClose, title, style }` |
| `ColorPicker` | `{ value, onChange: (color) => void, presets: string[], disabled, style }` |
| `Dropdown` | `{ value, onChange: (value) => void, options: [{value, label}], placeholder, disabled, style }` |
| `Tabs` | `{ tabs: [{id, label}], activeTab, onTabChange: (id) => void, style }` |

### Undo/Redo Support

Add `undoTool(z)` to your tools array to enable undo/redo:

```tsx
import { undoTool } from "@vibevibes/sdk";
const tools = [...yourTools, undoTool(z)];

// In Canvas:
const { undo, redo, canUndo, canRedo } = useUndo(sharedState, callTool);
```

---

## Advanced Features

### Agent Slots (multi-agent rooms)

```tsx
manifest: {
  agentSlots: [
    {
      role: "assistant",
      systemPrompt: "You help users with...",
      allowedTools: ["tool.a", "tool.b"],
      autoSpawn: true,
      maxInstances: 1,
    }
  ]
}
```

### Agent Hints (guide agent behavior)

```tsx
agentHints: [
  {
    trigger: "when a new region is explored",
    condition: "state.regions?.some(r => r.explored)",
    suggestedTools: ["world.add_creature", "world.add_lore"],
    priority: "medium",
    cooldownMs: 1000,
  }
]
```

### Observe Function (curate what agents see)

Instead of dumping raw state to the agent, define an `observe` function to curate a *narrative* of the current state. This is your director's chair — it shapes how the agent perceives the world.

```tsx
// In src/agent.ts
export function observe(state: Record<string, any>, event: any, actorId: string) {
  return {
    summary: `The board has ${state.pieces?.length ?? 0} pieces`,
    recentMove: state.lastMove,
    mood: state.tension > 5 ? "escalating" : "calm",
    playerCount: state.participants?.length ?? 1,
    // Don't expose internal implementation details — give the agent
    // high-level concepts it can reason about creatively
  };
}

// In src/index.tsx
export default defineExperience({
  ...,
  observe,
});
```

The observe function fires every time state changes. The agent receives its output instead of raw state. Use it to:
- Summarize complex state into readable concepts
- Give the agent emotional/narrative context (`mood`, `tension`, `phase`)
- Hide implementation details the agent doesn't need
- Create information asymmetry that makes the agent's responses more interesting

### Tool Factory Pattern (organize tool groups)

For experiences with many tools, group related tools into factory functions. This keeps files short and makes tools reusable across experiences:

```tsx
// src/tools/combat.ts
import { defineTool } from "@vibevibes/sdk";
import { z } from "zod";

export function combatTools(z_: typeof z) {
  return [
    defineTool({ name: "combat.attack", ... }),
    defineTool({ name: "combat.defend", ... }),
    defineTool({ name: "combat.flee", ... }),
  ];
}

// src/tools.ts
import { sceneTools, createChatTools } from "@vibevibes/sdk";
import { combatTools } from "./tools/combat";
import { inventoryTools } from "./tools/inventory";

export const tools = [
  ...sceneTools(z),
  ...createChatTools(z),
  ...combatTools(z),
  ...inventoryTools(z),
];
```

This mirrors how the SDK's own `sceneTools(z)`, `ruleTools(z)`, and `createChatTools(z)` work. Follow the same pattern for your custom tool groups.

### Tests (inline tool handler tests)

Run with `npm test`. Define tests in your experience (put them in `src/tests.ts`):

```tsx
import { defineTest } from "@vibevibes/sdk";

tests: [
  defineTest({
    name: "increment adds to count",
    run: async ({ tool, ctx, expect }) => {
      const inc = tool("counter.increment");
      const c = ctx({ state: { count: 5 } });
      await inc.handler(c, { amount: 3 });
      expect(c.getState().count).toBe(8);
    },
  }),
]
```

### Manifest Fields

```tsx
type ExperienceManifest = {
  id: string;                          // Unique ID
  version: string;                     // Semver
  title: string;                       // Display name
  description: string;                 // What it does
  requested_capabilities: string[];    // e.g. ["room.spawn"]
  agentSlots?: AgentSlot[];            // Agent role definitions
  category?: string;                   // "game", "tool", etc.
  tags?: string[];                     // Searchable tags
  netcode?: "default" | "tick" | "p2p-ephemeral";  // Sync strategy
  tickRateMs?: number;                 // For tick netcode
  hotKeys?: string[];                  // Keys routed through ephemeral channel
};
```

---

## Rules

1. **All mutations go through tools.** `ctx.setState()` inside a tool handler is the only way to change shared state.
2. **Tools have Zod schemas.** The server validates all inputs. Invalid input = readable error shown in browser.
3. **`ctx.setState()` does a shallow merge.** Always spread existing state: `ctx.setState({ ...ctx.state, myKey: newValue })`.
4. **Canvas re-renders on every state change.** Keep renders efficient.
5. **The dev server hot-reloads on save.** Edit any file in `src/`, save, see changes instantly in the browser. Build errors appear as toasts.
6. **You are an actor.** Your actions show up in the event log. Other participants see everything you do.

## Architecture

```
Browser (Canvas)  <--WebSocket-->  Express Server  <--HTTP-->  MCP (Agent)
      |                              |
  callTool(name, input)     validates input (Zod)
                            runs handler(ctx, input)
                            ctx.setState(newState)
                            broadcasts to all clients
```

All state lives on the server. The browser renders it. Tools are the only mutation path. Both humans and agents use the same tools.
