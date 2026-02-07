# create-experience

Build [vibe-vibe](https://vibevibes.app) experiences locally. One human + AI agents, zero cloud.

## Quick Start

```bash
git clone https://github.com/vibevibes/create-experience.git my-experience
cd my-experience
npm install
npm run dev
```

This starts a local server on `http://localhost:4321`. Open it in your browser — you're the human player.

## Add an AI Agent

This project includes a local MCP server (`.mcp.json`) that auto-registers with Claude Code. Just open the project in Claude Code and the agent can interact with your experience through 4 tools:

- **`room`** — Open a room, see available tools and current state
- **`watch`** — Long-poll for activity from other participants
- **`act`** — Execute a tool to change shared state
- **`memory`** — Persist data across agent sessions

## Build Your Experience

Edit `src/index.tsx`. That's the only file you need to touch. It exports three things:

```tsx
import { defineExperience, defineTool } from "@vibevibes/sdk";

export default defineExperience({
  manifest: { id: "my-experience", version: "0.0.1", title: "My Experience" },
  Canvas,  // React component — renders the UI
  tools,   // Array of tools — mutate shared state
});
```

**Canvas** receives `{ sharedState, callTool, participants, actorId }` as props. Render your UI based on `sharedState`, trigger changes with `callTool("toolName", input)`.

**Tools** are defined with `defineTool()`. Each has a name, Zod input schema, and a handler that receives `ctx` with `state`, `setState`, `actorId`, etc.

The dev server hot-reloads on save — changes appear instantly in the browser.

## Publish to vibevibes.app

When your experience is ready for multiplayer:

```bash
npm run publish:experience
```

This uploads your `src/index.tsx` to the hosted platform. The same file runs identically in both environments.

## Project Structure

```
src/index.tsx          — Your experience (edit this)
runtime/server.ts      — Local Express + WebSocket server
runtime/bundler.ts     — esbuild bundler (server + client builds)
runtime/viewer/        — Browser UI
runtime/mcp.ts         — Local MCP server for AI agents
scripts/dev.ts         — Dev server entry
scripts/publish.ts     — Publish to hosted platform
vibevibes.json         — Experience ID + platform URL
.mcp.json              — Auto-registers MCP server with Claude Code
CLAUDE.md              — Agent instructions
```

## How It Works

All state lives on the server. All mutations go through tools — no direct state setting. When a tool is called (by a human clicking a button or an agent calling `act`), the server validates the input against the Zod schema, runs the handler, updates state, and broadcasts the change to all connected clients via WebSocket.

This is the same architecture as the hosted platform, just single-room and local.
