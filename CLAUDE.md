# create-experience — LLM Reference

> You are building a **vibe-vibe experience**: a shared interactive app where humans (in the browser) and AI agents (via MCP tools) collaborate in real-time through a shared state managed by tools.

## IMPORTANT: Use the LOCAL MCP tools

This project registers a **local** MCP server (`vibevibes` in `.mcp.json`) via the published `@vibevibes/mcp` npm package. It exposes 5 tools: `connect`, `watch`, `act`, `memory`, `screenshot`. These talk to the **local dev server** at http://localhost:4321.

**DO NOT** use the hosted platform MCP tools (`vibevibes_list_experiences`, `vibevibes_create_room`, `vibevibes_execute_tool`, etc.) — those talk to the cloud. You want the local ones.

---

## Project Structure

```
src/                   <- YOUR EXPERIENCE CODE
  index.tsx            <- Entry point (must export default defineExperience)
  components.tsx       <- UI components (optional, import from index.tsx)
  utils.ts             <- Helpers, constants, logic (optional)
  types.ts             <- TypeScript types (optional)
runtime/               <- Local dev runtime. Don't modify.
  server.ts            <- Express + WebSocket server
  tunnel.ts            <- Cloudflare Tunnel for --share mode
  bundler.ts           <- esbuild bundler
  viewer/index.html    <- Browser viewer
.mcp.json              <- Auto-registers vibevibes-mcp with Claude Code
```

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

You are a **live participant** in a shared room. Other participants (humans in the browser, other agents) are acting in real-time. Your job is to stay present, observe, react, and keep observing. **The loop never ends until the session ends.**

```
1. connect          -> Join the room. Returns tools, state, participants, browser URL.

2. watch            -> Block until other participants do something.
                      This continuously polls — it does NOT return on empty timeouts.
                      It only returns when:
                        - Another participant acts (human clicks, other agent calls a tool)
                        - A predicate you set becomes true
                        - maxDuration expires (default 2 min)

3. act              -> React to what you observed. Call a tool to mutate state.

4. watch            -> Go right back to watching. ALWAYS.
```

**The critical rule: after every `act`, immediately call `watch` again.** After every `watch` that returns (even on maxDuration expiry), immediately call `watch` again. You are never "done" — you are a participant in a live room. If you stop calling `watch`, you go deaf to what others are doing.

```
connect → watch → (event arrives) → act → watch → (event arrives) → act → watch → ...
                                                                              ↑ forever
```

`watch` and `act` auto-connect if you haven't called `connect` yet.

**Do NOT stop the loop because:**
- "No activity" was reported — that just means the room was quiet, call `watch` again
- You finished your action — other participants are still active, call `watch` again
- You think you're "done" — you're a live participant, not a one-shot task runner

---

## Building an Experience

An experience is a multi-file project in `src/`. The entry point `src/index.tsx` must export a default `defineExperience`:

```tsx
import { defineExperience, defineTool } from "@vibevibes/sdk";
import { z } from "zod";
import React from "react";
import { MyComponent } from "./components";
import { helpers } from "./utils";

export default defineExperience({
  manifest: {
    id: "my-experience",
    version: "0.0.1",
    title: "My Experience",
    description: "What this does",
    requested_capabilities: [],
  },
  Canvas,   // React component — renders the UI
  tools,    // Array of ToolDef — mutate shared state
  tests,    // Optional: inline tests via defineTest
});
```

You can split code across multiple files in `src/` — the bundler resolves imports automatically. The dev server watches all files in `src/` and hot-reloads on any change.

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

### Tests (inline tool handler tests)

Run with `npm test`. Define tests in your experience:

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
