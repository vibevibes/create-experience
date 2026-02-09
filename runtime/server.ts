/**
 * Local vibe-vibe runtime server.
 * Multi-room architecture with tool gate, WebSocket broadcasts, and room spawning.
 *
 * The default "local" room is created on startup. Opening localhost:4321 puts you in it.
 * Additional rooms can be spawned via POST /rooms/spawn or from tool handlers with spawnRoom().
 * AI agents join rooms via MCP or HTTP.
 */

import express from "express";
import { WebSocketServer, WebSocket } from "ws";
import http from "http";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { ZodError } from "zod";
import { EventEmitter } from "events";
import { buildExperience, bundleForServer } from "./bundler.js";
import { zodToJsonSchema } from "zod-to-json-schema";

// ── Error formatting ──────────────────────────────────────────

function formatZodError(err: ZodError, toolName: string): string {
  const issues = err.issues.map((issue) => {
    const path = issue.path.length > 0 ? `'${issue.path.join(".")}'` : "input";
    return `  ${path}: ${issue.message}`;
  });
  return `Invalid input for '${toolName}':\n${issues.join("\n")}`;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");

// ── Types ──────────────────────────────────────────────────

interface ToolEvent {
  id: string;
  ts: number;
  actorId: string;
  owner?: string;
  tool: string;
  input: any;
  output?: any;
  error?: string;
}

interface RoomLink {
  parentRoomId: string;
  childRoomId: string;
  linkType: "spawned" | "referenced" | "forked";
  metadata?: Record<string, any>;
  createdAt: string;
}

// ── Room class ─────────────────────────────────────────────

class Room {
  readonly id: string;
  readonly experienceId: string;
  sharedState: Record<string, any> = {};
  participants = new Map<string, { type: "human" | "ai"; joinedAt: number }>();
  events: ToolEvent[] = [];
  wsConnections = new Map<WebSocket, string>(); // ws → actorId
  parentRoomId?: string;
  childRoomIds: string[] = [];

  constructor(id: string, experienceId: string, initialState?: Record<string, any>) {
    this.id = id;
    this.experienceId = experienceId;
    if (initialState) {
      this.sharedState = initialState;
    }
  }

  broadcastToAll(message: any) {
    const data = JSON.stringify(message);
    for (const ws of this.wsConnections.keys()) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    }
  }

  participantList(): string[] {
    return Array.from(this.participants.keys());
  }

  appendEvent(event: ToolEvent) {
    this.events.push(event);
    if (this.events.length > 200) {
      this.events = this.events.slice(-200);
    }
  }
}

// ── Global state ──────────────────────────────────────────

const DEFAULT_ROOM_ID = "local";
const PORT = parseInt(process.env.PORT || "4321");

let publicUrl: string | null = null;
let roomToken: string | null = null;

const rooms = new Map<string, Room>();
const roomLinks: RoomLink[] = [];
const actorCounters = new Map<string, number>();
const agentMemory = new Map<string, Record<string, any>>();
const roomEvents = new EventEmitter();
roomEvents.setMaxListeners(200);

let experience: any = null;
let clientBundle: string = "";
let serverCode: string = "";

// Spawn rate limiting: max 5 spawns per source room per 5 minutes
const spawnCounts = new Map<string, { count: number; windowStart: number }>();
const SPAWN_WINDOW_MS = 5 * 60 * 1000;
const MAX_SPAWNS_PER_WINDOW = 5;

/** Set the public tunnel URL (called from dev.ts when --share is active). */
export function setPublicUrl(url: string) {
  publicUrl = url;
}

/** Set the room token for share-mode authentication (called from dev.ts when --share is active). */
export function setRoomToken(token: string) {
  roomToken = token;
}

/** Get the base URL clients should use (tunnel URL if sharing, localhost otherwise). */
export function getBaseUrl(): string {
  return publicUrl || `http://localhost:${PORT}`;
}

/** Get the base URL with token appended (for sharing with others). */
function getAuthenticatedUrl(): string {
  const base = getBaseUrl();
  if (roomToken) {
    return `${base}?token=${roomToken}`;
  }
  return base;
}

// ── Helpers ────────────────────────────────────────────────

function deepMerge(target: Record<string, any>, source: Record<string, any>): Record<string, any> {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    const sv = source[key];
    const tv = target[key];
    if (sv !== null && typeof sv === "object" && !Array.isArray(sv) &&
        tv !== null && typeof tv === "object" && !Array.isArray(tv)) {
      result[key] = deepMerge(tv, sv);
    } else {
      result[key] = sv;
    }
  }
  return result;
}

function assignActorId(username: string, type: "human" | "ai"): string {
  const prefix = `${username}-${type}`;
  const current = actorCounters.get(prefix) || 0;
  const next = current + 1;
  actorCounters.set(prefix, next);
  return `${prefix}-${next}`;
}

function getToolList(exp: any): any[] {
  if (!exp?.tools) return [];
  return exp.tools.map((t: any) => ({
    name: t.name,
    description: t.description,
    risk: t.risk || "low",
    input_schema: t.input_schema ? zodToJsonSchema(t.input_schema) : {},
  }));
}

function getRoom(roomId: string): Room | undefined {
  return rooms.get(roomId);
}

function getDefaultRoom(): Room {
  return rooms.get(DEFAULT_ROOM_ID)!;
}

function generateRoomId(): string {
  return `room-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function checkSpawnRate(sourceRoomId: string): boolean {
  const now = Date.now();
  const entry = spawnCounts.get(sourceRoomId);
  if (!entry || now - entry.windowStart > SPAWN_WINDOW_MS) {
    spawnCounts.set(sourceRoomId, { count: 1, windowStart: now });
    return true;
  }
  if (entry.count >= MAX_SPAWNS_PER_WINDOW) {
    return false;
  }
  entry.count++;
  return true;
}

function spawnRoom(
  sourceRoomId: string,
  opts: { experienceId: string; name?: string; initialState?: Record<string, any>; linkBack?: boolean },
): { roomId: string; url: string } {
  if (!checkSpawnRate(sourceRoomId)) {
    throw new Error(`Rate limited: max ${MAX_SPAWNS_PER_WINDOW} spawns per ${SPAWN_WINDOW_MS / 60000} minutes`);
  }

  const roomId = opts.name || generateRoomId();
  if (rooms.has(roomId)) {
    throw new Error(`Room '${roomId}' already exists`);
  }

  const initialState = opts.linkBack
    ? { ...opts.initialState, _parentRoom: sourceRoomId }
    : (opts.initialState || {});

  const room = new Room(roomId, opts.experienceId, initialState);
  room.parentRoomId = sourceRoomId;
  rooms.set(roomId, room);

  // Track parent-child link
  const sourceRoom = rooms.get(sourceRoomId);
  if (sourceRoom) {
    sourceRoom.childRoomIds.push(roomId);
  }

  // Store RoomLink
  roomLinks.push({
    parentRoomId: sourceRoomId,
    childRoomId: roomId,
    linkType: "spawned",
    metadata: { experienceId: opts.experienceId },
    createdAt: new Date().toISOString(),
  });

  const url = `${getBaseUrl()}?room=${roomId}`;
  return { roomId, url };
}

// ── Load experience ────────────────────────────────────────

async function loadExperience() {
  try {
    const result = await buildExperience();
    clientBundle = result.clientCode;
    serverCode = result.serverCode;

    // Eval to extract tools + manifest
    const { defineExperience, defineTool, defineTest, undoTool } = await import("@vibevibes/sdk");
    const stubReact = { createElement: () => null, Fragment: "Fragment" };
    const zodModule = await import("zod");
    const z = zodModule.z ?? zodModule.default ?? zodModule;

    const fn = new Function(
      "React", "Y", "z",
      "defineExperience", "defineTool", "defineTest", "undoTool",
      "require", "exports", "module", "console",
      `"use strict";\n${serverCode}\nreturn typeof __experience_export__ !== 'undefined' ? __experience_export__ : undefined;`
    );

    const fakeModule = { exports: {} as any };
    const result2 = fn(
      stubReact, {}, z,
      defineExperience, defineTool, defineTest, undoTool,
      () => ({}), fakeModule.exports, fakeModule, console,
    );

    experience = result2?.default ?? result2 ?? fakeModule.exports?.default ?? fakeModule.exports;

    if (!experience?.manifest || !experience?.tools) {
      throw new Error("Experience module missing manifest or tools");
    }

    console.log(`Loaded: ${experience.manifest.title} (${experience.tools.length} tools)`);
    return experience;
  } catch (err: any) {
    console.error("Failed to load experience:", err.message);
    throw err;
  }
}

// ── Express app ────────────────────────────────────────────

const app = express();
app.use(express.json());

// CORS for local development
app.use((_req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization,X-Idempotency-Key");
  if (_req.method === "OPTIONS") { res.sendStatus(200); return; }
  next();
});

// ── Room token auth middleware (only active when --share sets a token) ──
app.use((req, res, next) => {
  if (!roomToken) { next(); return; }

  // GET endpoints remain open — viewers, state polling, bundles, screenshots
  if (req.method === "GET" || req.method === "OPTIONS") { next(); return; }

  // All POST (mutation) endpoints require token
  const queryToken = req.query.token as string | undefined;
  const authHeader = req.headers.authorization;
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;
  const provided = queryToken || bearerToken;

  if (provided !== roomToken) {
    res.status(401).json({ error: "Invalid or missing room token" });
    return;
  }

  next();
});

// Serve viewer
app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "viewer", "index.html"));
});
app.use("/viewer", express.static(path.join(__dirname, "viewer")));

// ── Room state endpoint (flat = default room) ──────────────

app.get("/state", (_req, res) => {
  const room = getDefaultRoom();
  res.json({
    roomId: room.id,
    experienceId: experience?.manifest?.id ?? "unknown",
    sharedState: room.sharedState,
    participants: room.participantList(),
    events: room.events.slice(-50),
  });
});

// ── Join (flat = default room) ─────────────────────────────

function handleJoin(room: Room, req: express.Request, res: express.Response) {
  if (!experience) {
    res.status(500).json({ error: "Experience not loaded" });
    return;
  }

  const { username = "user", actorType = "human" } = req.body;
  const actorId = assignActorId(username, actorType as "human" | "ai");
  room.participants.set(actorId, { type: actorType, joinedAt: Date.now() });

  // Broadcast presence update
  room.broadcastToAll({
    type: "presence_update",
    participants: room.participantList(),
  });

  res.json({
    roomId: room.id,
    actorId,
    experienceId: experience.manifest.id,
    sharedState: room.sharedState,
    participants: room.participantList(),
    events: room.events.slice(-20),
    tools: getToolList(experience),
    browserUrl: getBaseUrl(),
  });
}

app.post("/join", (req, res) => handleJoin(getDefaultRoom(), req, res));

// ── Leave (flat = default room) ────────────────────────────

function handleLeave(room: Room, req: express.Request, res: express.Response) {
  const { actorId } = req.body;
  room.participants.delete(actorId);
  room.broadcastToAll({
    type: "presence_update",
    participants: room.participantList(),
  });
  res.json({ left: true, actorId });
}

app.post("/leave", (req, res) => handleLeave(getDefaultRoom(), req, res));

// ── Idempotency cache ────────────────────────────────────────

const idempotencyCache = new Map<string, { output: any; ts: number }>();
const IDEMPOTENCY_TTL = 30000; // 30 seconds

// Cleanup expired entries every 60 seconds
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of idempotencyCache) {
    if (now - entry.ts > IDEMPOTENCY_TTL) idempotencyCache.delete(key);
  }
}, 60000);

// ── Execute tool ────────────────────────────────────────────

async function handleTool(room: Room, req: express.Request, res: express.Response) {
  if (!experience) { res.status(500).json({ error: "Experience not loaded" }); return; }

  // Idempotency: return cached result if same key seen recently
  const idempotencyKey = req.headers["x-idempotency-key"] as string | undefined;
  if (idempotencyKey) {
    const cached = idempotencyCache.get(idempotencyKey);
    if (cached && Date.now() - cached.ts < IDEMPOTENCY_TTL) {
      res.json({ output: cached.output, cached: true });
      return;
    }
  }

  const toolName = req.params.toolName;
  const { actorId, input = {}, owner } = req.body;

  // Find tool
  const tool = experience.tools.find((t: any) => t.name === toolName);
  if (!tool) {
    res.status(404).json({ error: `Tool '${toolName}' not found` });
    return;
  }

  try {
    // Validate input
    let validatedInput = input;
    if (tool.input_schema?.parse) {
      validatedInput = tool.input_schema.parse(input);
    }

    // Build ToolCtx
    const memoryKey = `${experience.manifest.id}:${actorId}`;
    const ctx: Record<string, any> = {
      roomId: room.id,
      actorId,
      owner: owner || actorId.split("-")[0],
      state: room.sharedState,
      setState: (newState: Record<string, any>) => {
        room.sharedState = newState;
      },
      timestamp: Date.now(),
      memory: agentMemory.get(memoryKey) || {},
      setMemory: (updates: Record<string, any>) => {
        const current = agentMemory.get(memoryKey) || {};
        agentMemory.set(memoryKey, deepMerge(current, updates));
      },
    };

    // Wire spawnRoom if experience requests the capability
    const capabilities = experience.manifest.requested_capabilities || [];
    if (capabilities.includes("room.spawn")) {
      ctx.spawnRoom = async (opts: { experienceId: string; name?: string; initialState?: Record<string, any>; linkBack?: boolean }) => {
        return spawnRoom(room.id, opts);
      };
    }

    // Execute handler
    const output = await tool.handler(ctx, validatedInput);

    // Create event
    const event: ToolEvent = {
      id: `${Date.now()}-${actorId}-${Math.random().toString(36).slice(2, 6)}`,
      ts: Date.now(),
      actorId,
      owner: ctx.owner,
      tool: toolName,
      input: validatedInput,
      output,
    };

    // Append event
    room.appendEvent(event);

    // Broadcast state update
    room.broadcastToAll({
      type: "shared_state_update",
      roomId: room.id,
      state: room.sharedState,
      event,
      changedBy: actorId,
      tool: toolName,
    });

    // Emit for long-poll listeners
    roomEvents.emit(`room:${room.id}`);

    // Cache for idempotency
    if (idempotencyKey) {
      idempotencyCache.set(idempotencyKey, { output, ts: Date.now() });
    }

    res.json({ output });
  } catch (err: any) {
    const errorMsg = err instanceof ZodError
      ? formatZodError(err, toolName)
      : (err instanceof Error ? err.message : String(err));
    const event: ToolEvent = {
      id: `${Date.now()}-${actorId}-${Math.random().toString(36).slice(2, 6)}`,
      ts: Date.now(),
      actorId,
      tool: toolName,
      input,
      error: errorMsg,
    };
    room.appendEvent(event);
    roomEvents.emit(`room:${room.id}`);
    res.status(400).json({ error: errorMsg });
  }
}

app.post("/tools/:toolName", (req, res) => handleTool(getDefaultRoom(), req, res));

// ── Get events (supports long-poll via ?timeout=N) ──────────

function handleEvents(room: Room, req: express.Request, res: express.Response) {
  const since = parseInt(req.query.since as string) || 0;
  const timeout = Math.min(parseInt(req.query.timeout as string) || 0, 55000);

  const getNewEvents = () => room.events.filter((e) => e.ts > since);

  let newEvents = getNewEvents();
  if (newEvents.length > 0 || timeout === 0) {
    res.json({
      events: newEvents,
      sharedState: room.sharedState,
      participants: room.participantList(),
    });
    return;
  }

  // Long-poll: wait for event emission or timeout
  let responded = false;

  const respond = () => {
    if (responded) return;
    responded = true;
    clearTimeout(timer);
    roomEvents.removeListener(`room:${room.id}`, onEvent);
    newEvents = getNewEvents();
    res.json({
      events: newEvents,
      sharedState: room.sharedState,
      participants: room.participantList(),
    });
  };

  const timer = setTimeout(respond, timeout);

  const onEvent = () => {
    // Small delay to batch rapid events
    setTimeout(() => {
      if (!responded) respond();
    }, 50);
  };

  roomEvents.on(`room:${room.id}`, onEvent);

  // Cleanup on client disconnect
  req.on("close", () => {
    responded = true;
    clearTimeout(timer);
    roomEvents.removeListener(`room:${room.id}`, onEvent);
  });
}

app.get("/events", (req, res) => handleEvents(getDefaultRoom(), req, res));

// ── Serve client bundle ────────────────────────────────────

app.get("/bundle", (_req, res) => {
  res.setHeader("Content-Type", "text/javascript");
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.send(clientBundle);
});

// ── Memory endpoints ───────────────────────────────────────

app.get("/memory", (req, res) => {
  const key = req.query.key as string;
  if (!key) { res.json({}); return; }
  res.json(agentMemory.get(key) || {});
});

app.post("/memory", (req, res) => {
  const { key, updates } = req.body;
  if (!key) { res.status(400).json({ error: "key required" }); return; }
  const current = agentMemory.get(key) || {};
  agentMemory.set(key, deepMerge(current, updates));
  res.json({ saved: true });
});

// ── Screenshot capture ────────────────────────────────────

const pendingScreenshots = new Map<string, {
  resolve: (data: Buffer) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
}>();

app.get("/screenshot", (req, res) => {
  // Find an open viewer WebSocket connection (check default room first, then all rooms)
  let viewerWs: WebSocket | null = null;
  for (const room of rooms.values()) {
    for (const [ws] of room.wsConnections) {
      if (ws.readyState === WebSocket.OPEN) {
        viewerWs = ws;
        break;
      }
    }
    if (viewerWs) break;
  }

  if (!viewerWs) {
    res.status(503).json({ error: `No browser viewer connected. Open ${getBaseUrl()} first.` });
    return;
  }

  const requestId = `ss-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const timeoutMs = Math.min(parseInt(req.query.timeout as string) || 10000, 30000);

  const promise = new Promise<Buffer>((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingScreenshots.delete(requestId);
      reject(new Error("Screenshot timeout"));
    }, timeoutMs);

    pendingScreenshots.set(requestId, { resolve, reject, timer });
  });

  // Ask the viewer to capture
  viewerWs.send(JSON.stringify({ type: "screenshot_request", id: requestId }));

  promise
    .then((pngBuffer) => {
      res.setHeader("Content-Type", "image/png");
      res.setHeader("Content-Length", String(pngBuffer.length));
      res.send(pngBuffer);
    })
    .catch((err) => {
      res.status(500).json({ error: err.message });
    });
});

// ── Sync (re-bundle) ──────────────────────────────────────

app.post("/sync", async (_req, res) => {
  try {
    await loadExperience();
    // Broadcast to all rooms
    for (const room of rooms.values()) {
      room.broadcastToAll({ type: "experience_updated" });
    }
    res.json({ synced: true, title: experience?.manifest?.title });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Room management routes ─────────────────────────────────

app.get("/rooms", (_req, res) => {
  const roomList = Array.from(rooms.values()).map((room) => ({
    roomId: room.id,
    experienceId: room.experienceId,
    participants: room.participantList(),
    eventCount: room.events.length,
    parentRoomId: room.parentRoomId,
    childRoomIds: room.childRoomIds,
  }));
  res.json(roomList);
});

app.post("/rooms/spawn", (req, res) => {
  try {
    const { experienceId, name, initialState, linkBack, sourceRoomId } = req.body;
    const source = sourceRoomId || DEFAULT_ROOM_ID;
    const result = spawnRoom(source, { experienceId: experienceId || experience?.manifest?.id, name, initialState, linkBack });
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.get("/rooms/:roomId", (req, res) => {
  const room = getRoom(req.params.roomId);
  if (!room) {
    res.status(404).json({ error: `Room '${req.params.roomId}' not found` });
    return;
  }
  res.json({
    roomId: room.id,
    experienceId: room.experienceId,
    sharedState: room.sharedState,
    participants: room.participantList(),
    events: room.events.slice(-50),
    parentRoomId: room.parentRoomId,
    childRoomIds: room.childRoomIds,
  });
});

app.get("/rooms/:roomId/links", (req, res) => {
  const roomId = req.params.roomId;
  const links = roomLinks.filter(
    (l) => l.parentRoomId === roomId || l.childRoomId === roomId,
  );
  res.json(links);
});

app.post("/rooms/:roomId/join", (req, res) => {
  const room = getRoom(req.params.roomId);
  if (!room) {
    res.status(404).json({ error: `Room '${req.params.roomId}' not found` });
    return;
  }
  handleJoin(room, req, res);
});

app.post("/rooms/:roomId/leave", (req, res) => {
  const room = getRoom(req.params.roomId);
  if (!room) {
    res.status(404).json({ error: `Room '${req.params.roomId}' not found` });
    return;
  }
  handleLeave(room, req, res);
});

app.post("/rooms/:roomId/tools/:toolName", (req, res) => {
  const room = getRoom(req.params.roomId);
  if (!room) {
    res.status(404).json({ error: `Room '${req.params.roomId}' not found` });
    return;
  }
  handleTool(room, req, res);
});

app.get("/rooms/:roomId/events", (req, res) => {
  const room = getRoom(req.params.roomId);
  if (!room) {
    res.status(404).json({ error: `Room '${req.params.roomId}' not found` });
    return;
  }
  handleEvents(room, req, res);
});

app.get("/rooms/:roomId/bundle", (_req, res) => {
  res.setHeader("Content-Type", "text/javascript");
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.send(clientBundle);
});

// ── MCP config (for remote joiners) ───────────────────────

app.get("/mcp-config", (_req, res) => {
  const serverUrl = getAuthenticatedUrl();
  res.json({
    mcpServers: {
      "vibevibes-remote": {
        command: "npx",
        args: ["-y", "@vibevibes/mcp@latest"],
        env: {
          VIBEVIBES_SERVER_URL: serverUrl,
        },
      },
    },
    instructions: [
      `Add the above to your .mcp.json to join this room.`,
      `Or run: npx @vibevibes/mcp@latest ${serverUrl}`,
    ],
  });
});

// ── Start server ───────────────────────────────────────────

export async function startServer() {
  await loadExperience();

  // Create default room
  const defaultRoom = new Room(DEFAULT_ROOM_ID, experience.manifest.id);
  rooms.set(DEFAULT_ROOM_ID, defaultRoom);

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server });

  wss.on("connection", (ws) => {
    // Heartbeat: mark alive on connection and on pong
    (ws as any).isAlive = true;
    ws.on("pong", () => { (ws as any).isAlive = true; });

    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());

        if (msg.type === "join") {
          const username = msg.username || "viewer";
          const roomId = msg.roomId || DEFAULT_ROOM_ID;
          const room = getRoom(roomId);
          if (!room) {
            ws.send(JSON.stringify({ type: "error", error: `Room '${roomId}' not found` }));
            return;
          }

          const actorId = assignActorId(username, "human");
          room.participants.set(actorId, { type: "human", joinedAt: Date.now() });

          // Track this WS → actorId in the room
          room.wsConnections.set(ws, actorId);

          // Send initial state
          ws.send(JSON.stringify({
            type: "joined",
            roomId: room.id,
            actorId,
            sharedState: room.sharedState,
            participants: room.participantList(),
            events: room.events.slice(-20),
          }));

          // Broadcast presence update to others in this room
          room.broadcastToAll({
            type: "presence_update",
            participants: room.participantList(),
          });
        }

        if (msg.type === "screenshot_response") {
          const pending = pendingScreenshots.get(msg.id);
          if (pending) {
            clearTimeout(pending.timer);
            pendingScreenshots.delete(msg.id);

            if (msg.error) {
              pending.reject(new Error(msg.error));
            } else if (msg.dataUrl) {
              // Convert data URL to Buffer: "data:image/png;base64,iVBOR..."
              const base64Data = msg.dataUrl.replace(/^data:image\/png;base64,/, "");
              const buffer = Buffer.from(base64Data, "base64");
              pending.resolve(buffer);
            } else {
              pending.reject(new Error("Empty screenshot response"));
            }
          }
        }
      } catch {
        // Ignore invalid messages
      }
    });

    ws.on("close", () => {
      // Clean up participant from whichever room this WS belongs to
      for (const room of rooms.values()) {
        const actorId = room.wsConnections.get(ws);
        if (actorId) {
          room.participants.delete(actorId);
          room.wsConnections.delete(ws);

          // Broadcast updated presence to this room
          room.broadcastToAll({
            type: "presence_update",
            participants: room.participantList(),
          });
          break;
        }
      }
    });
  });

  // ── WebSocket heartbeat interval ──────────────────────────
  const heartbeatInterval = setInterval(() => {
    for (const ws of wss.clients) {
      if ((ws as any).isAlive === false) {
        // Dead connection — clean up from rooms and terminate
        for (const room of rooms.values()) {
          const actorId = room.wsConnections.get(ws);
          if (actorId) {
            room.participants.delete(actorId);
            room.wsConnections.delete(ws);
            room.broadcastToAll({
              type: "presence_update",
              participants: room.participantList(),
            });
            break;
          }
        }
        ws.terminate();
        continue;
      }
      (ws as any).isAlive = false;
      ws.ping();
    }
  }, 30000);

  // Watch src/ and templates/ directories for changes
  const watchDirs = [
    path.join(PROJECT_ROOT, "src"),
    path.join(PROJECT_ROOT, "templates"),
  ].filter((d) => fs.existsSync(d));
  let debounceTimer: NodeJS.Timeout | null = null;

  function onSrcChange(filename?: string) {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      console.log(`\nFile changed${filename ? ` (${filename})` : ""}, rebuilding...`);
      try {
        await loadExperience();
        for (const room of rooms.values()) {
          room.broadcastToAll({ type: "experience_updated" });
        }
        console.log("Hot reload complete.");
      } catch (err: any) {
        console.error("Hot reload failed:", err.message);
        for (const room of rooms.values()) {
          room.broadcastToAll({ type: "build_error", error: err.message });
        }
      }
    }, 300);
  }

  for (const watchDir of watchDirs) {
    try {
      // recursive: true works on Windows and macOS
      fs.watch(watchDir, { recursive: true }, (_event, filename) => {
        if (filename && /\.(tsx?|jsx?|css|json)$/.test(filename)) {
          onSrcChange(filename);
        }
      });
    } catch {
      // Fallback for Linux: watch individual directories
      function watchDirRecursive(dir: string) {
        fs.watch(dir, (_event, filename) => {
          if (filename && /\.(tsx?|jsx?|css|json)$/.test(filename)) {
            onSrcChange(filename);
          }
        });
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          if (entry.isDirectory()) watchDirRecursive(path.join(dir, entry.name));
        }
      }
      watchDirRecursive(watchDir);
    }
  }

  server.listen(PORT, () => {
    console.log(`\n  vibe-vibe local runtime`);
    console.log(`  ───────────────────────`);
    console.log(`  Viewer:  http://localhost:${PORT}`);
    if (publicUrl) {
      const shareUrl = getAuthenticatedUrl();
      console.log(``);
      console.log(`  ┌─────────────────────────────────────────────────┐`);
      console.log(`  │  SHARE WITH FRIENDS:                            │`);
      console.log(`  │                                                 │`);
      console.log(`  │  ${shareUrl.padEnd(47)} │`);
      console.log(`  │                                                 │`);
      console.log(`  │  Open in browser to join the room.              │`);
      console.log(`  │  AI: npx @vibevibes/mcp ${(shareUrl).padEnd(23)} │`);
      console.log(`  └─────────────────────────────────────────────────┘`);
    }
    console.log(`\n  Watching src/ and templates/ for changes\n`);
  });

  // Cleanup heartbeat on server close
  server.on("close", () => {
    clearInterval(heartbeatInterval);
  });

  return server;
}

// Auto-start if run directly
if (process.argv[1]?.includes("server")) {
  startServer().catch((err) => {
    console.error("Server failed to start:", err);
    process.exit(1);
  });
}
