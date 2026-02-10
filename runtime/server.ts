/**
 * Local vibe-vibe runtime server.
 * Multi-room, multi-experience architecture with tool gate, WebSocket broadcasts, and room spawning.
 *
 * The default "local" room is created on startup running the host experience (src/index.tsx).
 * Additional rooms can be spawned via POST /rooms/spawn — including rooms running different experiences.
 * Cross-experience room spawning uses a per-project vibevibes.registry.json to resolve experience IDs to source paths.
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
import { bundleForServer, bundleForClient, evalServerBundle } from "./bundler.js";
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

/** A loaded and cached experience (host or external). */
interface LoadedExperience {
  module: any;           // The evaluated ExperienceModule (manifest, tools, Canvas, etc.)
  clientBundle: string;  // ESM bundle for the browser
  serverCode: string;    // CJS bundle (kept for hot-reload re-eval)
  loadedAt: number;
  sourcePath: string;    // Absolute path to the entry file
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
  /** Immutable config set at spawn time. Defines this room's modality/parameters. */
  readonly config: Record<string, any>;

  constructor(id: string, experienceId: string, initialState?: Record<string, any>, config?: Record<string, any>) {
    this.id = id;
    this.experienceId = experienceId;
    this.config = Object.freeze(config || {});
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

// ── Experience cache (replaces single global `experience`) ──
const experienceCache = new Map<string, LoadedExperience>();
let hostExperienceId: string = "";

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

/** Get the loaded experience for a room. Returns undefined if not loaded. */
function getExperienceForRoom(room: Room): LoadedExperience | undefined {
  return experienceCache.get(room.experienceId);
}

/** Get the host experience module (convenience). */
function getHostExperience(): any {
  return experienceCache.get(hostExperienceId)?.module;
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

/**
 * Resolve room config against a specific experience's roomConfig definition.
 * Handles: preset names, explicit config objects, defaults, and validation.
 */
function resolveRoomConfig(
  experienceModule: any,
  configInput: Record<string, any> | string | undefined,
): Record<string, any> {
  const roomConfigDef = experienceModule?.roomConfig;
  if (!roomConfigDef) {
    // No config schema defined — pass through whatever was given (or empty)
    return typeof configInput === "object" ? configInput || {} : {};
  }

  let resolved: Record<string, any>;

  if (typeof configInput === "string") {
    // Preset name
    const preset = roomConfigDef.presets?.[configInput];
    if (!preset) {
      const available = Object.keys(roomConfigDef.presets || {}).join(", ");
      throw new Error(`Unknown config preset '${configInput}'. Available: ${available || "(none)"}`);
    }
    resolved = { ...roomConfigDef.defaults, ...preset };
  } else if (configInput && Object.keys(configInput).length > 0) {
    // Explicit config values merged over defaults
    resolved = { ...roomConfigDef.defaults, ...configInput };
  } else {
    // No config provided — use defaults
    resolved = { ...roomConfigDef.defaults } || {};
  }

  // Validate against schema if available
  if (roomConfigDef.schema?.parse) {
    try {
      resolved = roomConfigDef.schema.parse(resolved);
    } catch (err: any) {
      if (err instanceof ZodError) {
        const issues = err.issues.map((i: any) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
        throw new Error(`Invalid room config:\n${issues}`);
      }
      throw err;
    }
  }

  return resolved;
}

/**
 * Resolve the initial state for a room from its experience module.
 * Checks for `initialState` (function or object) on the module.
 * Falls back to empty object if not defined.
 */
function resolveInitialState(
  experienceModule: any,
  config: Record<string, any>,
): Record<string, any> {
  const init = experienceModule?.initialState;
  if (typeof init === "function") {
    try { return init(config) || {}; } catch { return {}; }
  }
  if (init && typeof init === "object") {
    return { ...init };
  }
  return {};
}

// ── Registry: discover external experiences ────────────────

interface Registry {
  host: string | null;
  entries: Map<string, string>;
}

/**
 * Read vibevibes.registry.json from the project root.
 * Returns host experience ID + map of experienceId → absolute entry path.
 * Called on-demand (not cached — file can change between calls).
 */
function loadRegistry(): Registry {
  const registryPath = path.join(PROJECT_ROOT, "vibevibes.registry.json");
  if (!fs.existsSync(registryPath)) return { host: null, entries: new Map() };

  try {
    const raw = JSON.parse(fs.readFileSync(registryPath, "utf-8"));
    const entries = new Map<string, string>();

    for (const [id, entry] of Object.entries(raw.experiences || {})) {
      const e = entry as any;
      if (e.path) {
        const resolved = path.resolve(path.dirname(registryPath), e.path);
        if (fs.existsSync(resolved)) {
          entries.set(id, resolved);
        } else {
          console.warn(`  Registry: '${id}' path not found: ${resolved}`);
        }
      }
    }
    return { host: raw.host || null, entries };
  } catch (err: any) {
    console.warn(`  Registry: failed to parse vibevibes.registry.json: ${err.message}`);
    return { host: null, entries: new Map() };
  }
}

// ── Experience loading ─────────────────────────────────────

/**
 * Load an experience from an arbitrary entry path.
 * Bundles server + client, evals server bundle, caches the result.
 */
async function loadExperienceFromPath(entryPath: string): Promise<LoadedExperience> {
  const [sCode, cCode] = await Promise.all([
    bundleForServer(entryPath),
    bundleForClient(entryPath),
  ]);

  const mod = await evalServerBundle(sCode);

  if (!mod?.manifest || !mod?.tools) {
    throw new Error(`Experience at ${entryPath} missing manifest or tools`);
  }

  const loaded: LoadedExperience = {
    module: mod,
    clientBundle: cCode,
    serverCode: sCode,
    loadedAt: Date.now(),
    sourcePath: entryPath,
  };

  experienceCache.set(mod.manifest.id, loaded);
  return loaded;
}

/**
 * Load an experience by ID. Checks cache first, then registry.
 * Throws if the experience can't be found or loaded.
 */
async function loadExperienceById(experienceId: string): Promise<LoadedExperience> {
  // Cache hit
  const cached = experienceCache.get(experienceId);
  if (cached) return cached;

  // Look up in registry
  const registry = loadRegistry();
  const entryPath = registry.entries.get(experienceId);
  if (!entryPath) {
    const available = [hostExperienceId, ...registry.entries.keys()].filter(Boolean);
    throw new Error(
      `Experience '${experienceId}' not found. Available: ${available.join(", ") || "(none)"}. ` +
      `Add it to vibevibes.registry.json.`
    );
  }

  console.log(`  Loading external experience '${experienceId}' from ${entryPath}...`);
  const loaded = await loadExperienceFromPath(entryPath);

  // Warn if manifest ID doesn't match registry key
  if (loaded.module.manifest.id !== experienceId) {
    console.warn(`  Warning: registry key '${experienceId}' but manifest.id is '${loaded.module.manifest.id}'`);
  }

  console.log(`  Loaded: ${loaded.module.manifest.title} (${loaded.module.tools.length} tools)`);
  return loaded;
}

/**
 * Load the host experience. Checks registry for a "host" field first,
 * falls back to src/index.tsx for scaffolded projects without a registry.
 */
async function loadHost(): Promise<LoadedExperience> {
  const registry = loadRegistry();

  let loaded: LoadedExperience;
  if (registry.host && registry.entries.has(registry.host)) {
    loaded = await loadExperienceFromPath(registry.entries.get(registry.host)!);
  } else {
    // Fallback: src/index.tsx (backwards compat for scaffolded projects)
    loaded = await loadExperienceFromPath(path.join(PROJECT_ROOT, "src", "index.tsx"));
  }

  hostExperienceId = loaded.module.manifest.id;
  return loaded;
}

// ── Spawn room (async — can load external experiences) ─────

async function spawnRoom(
  sourceRoomId: string,
  opts: { experienceId: string; name?: string; initialState?: Record<string, any>; linkBack?: boolean; config?: Record<string, any> | string },
): Promise<{ roomId: string; url: string; config: Record<string, any> }> {
  if (!checkSpawnRate(sourceRoomId)) {
    throw new Error(`Rate limited: max ${MAX_SPAWNS_PER_WINDOW} spawns per ${SPAWN_WINDOW_MS / 60000} minutes`);
  }

  const roomId = opts.name || generateRoomId();
  if (rooms.has(roomId)) {
    throw new Error(`Room '${roomId}' already exists`);
  }

  // Load the target experience (may be external — loads on demand)
  const targetExperience = await loadExperienceById(opts.experienceId);

  // Resolve and validate config against the TARGET experience's schema
  const config = resolveRoomConfig(targetExperience.module, opts.config);

  // Resolve initial state: experience default, merged with explicit initialState, plus linkBack
  const expInitialState = resolveInitialState(targetExperience.module, config);
  const mergedState = { ...expInitialState, ...(opts.initialState || {}) };
  const initialState = opts.linkBack
    ? { ...mergedState, _parentRoom: sourceRoomId }
    : mergedState;

  const room = new Room(roomId, opts.experienceId, initialState, config);
  room.parentRoomId = sourceRoomId;
  rooms.set(roomId, room);

  // Track parent-child link
  const sourceRoom = rooms.get(sourceRoomId);
  if (sourceRoom) {
    sourceRoom.childRoomIds.push(roomId);
  }

  // Store RoomLink (include config in metadata)
  roomLinks.push({
    parentRoomId: sourceRoomId,
    childRoomId: roomId,
    linkType: "spawned",
    metadata: { experienceId: opts.experienceId, config },
    createdAt: new Date().toISOString(),
  });

  const url = `${getBaseUrl()}?room=${roomId}`;
  return { roomId, url, config };
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
  const exp = getExperienceForRoom(room);
  res.json({
    roomId: room.id,
    experienceId: exp?.module?.manifest?.id ?? room.experienceId,
    sharedState: room.sharedState,
    participants: room.participantList(),
    events: room.events.slice(-50),
    config: room.config,
  });
});

// ── Join (flat = default room) ─────────────────────────────

function handleJoin(room: Room, req: express.Request, res: express.Response) {
  const exp = getExperienceForRoom(room);
  if (!exp) {
    res.status(500).json({ error: `Experience '${room.experienceId}' not loaded` });
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
    experienceId: exp.module.manifest.id,
    sharedState: room.sharedState,
    participants: room.participantList(),
    events: room.events.slice(-20),
    tools: getToolList(exp.module),
    browserUrl: getBaseUrl(),
    config: room.config,
    hasRoomConfig: !!exp.module.roomConfig,
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
  const exp = getExperienceForRoom(room);
  if (!exp) { res.status(500).json({ error: `Experience '${room.experienceId}' not loaded` }); return; }

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

  // Find tool from the room's experience
  const tool = exp.module.tools.find((t: any) => t.name === toolName);
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
    const memoryKey = `${exp.module.manifest.id}:${actorId}`;
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
      roomConfig: room.config,
    };

    // Wire spawnRoom if experience requests the capability
    const capabilities = exp.module.manifest.requested_capabilities || [];
    if (capabilities.includes("room.spawn")) {
      ctx.spawnRoom = async (opts: { experienceId: string; name?: string; initialState?: Record<string, any>; linkBack?: boolean; config?: Record<string, any> | string }) => {
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
  const host = experienceCache.get(hostExperienceId);
  res.setHeader("Content-Type", "text/javascript");
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.send(host?.clientBundle || "");
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
    await loadHost();
    // Broadcast only to rooms running the host experience
    for (const room of rooms.values()) {
      if (room.experienceId === hostExperienceId) {
        room.broadcastToAll({ type: "experience_updated" });
      }
    }
    const host = getHostExperience();
    res.json({ synced: true, title: host?.manifest?.title });
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
    config: room.config,
  }));
  res.json(roomList);
});

app.post("/rooms/spawn", async (req, res) => {
  try {
    const { experienceId, name, initialState, linkBack, sourceRoomId, config } = req.body;
    const source = sourceRoomId || DEFAULT_ROOM_ID;
    const result = await spawnRoom(source, {
      experienceId: experienceId || hostExperienceId,
      name,
      initialState,
      linkBack,
      config,
    });
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ── Room config schema endpoint ────────────────────────────
app.get("/rooms/config-schema", async (req, res) => {
  try {
    const targetId = (req.query.experienceId as string) || hostExperienceId;
    const loaded = await loadExperienceById(targetId);
    const roomConfigDef = loaded.module?.roomConfig;

    if (!roomConfigDef) {
      res.json({ hasConfig: false, experienceId: targetId });
      return;
    }
    const schema = roomConfigDef.schema
      ? zodToJsonSchema(roomConfigDef.schema)
      : {};
    res.json({
      hasConfig: true,
      experienceId: targetId,
      schema,
      defaults: roomConfigDef.defaults || {},
      presets: Object.keys(roomConfigDef.presets || {}),
      description: roomConfigDef.description || "",
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ── Experiences endpoint (discovery for agents) ────────────

app.get("/experiences", (_req, res) => {
  const registry = loadRegistry();
  const available: Array<{
    id: string;
    title: string;
    description: string;
    version: string;
    source: "host" | "registry";
    loaded: boolean;
    hasRoomConfig: boolean;
  }> = [];

  // Host experience (always first, always loaded)
  const host = experienceCache.get(hostExperienceId);
  if (host) {
    available.push({
      id: host.module.manifest.id,
      title: host.module.manifest.title,
      description: host.module.manifest.description,
      version: host.module.manifest.version,
      source: "host",
      loaded: true,
      hasRoomConfig: !!host.module.roomConfig,
    });
  }

  // Registry entries
  for (const [id] of registry.entries) {
    if (id === hostExperienceId) continue; // Already listed as host
    const cached = experienceCache.get(id);
    if (cached) {
      available.push({
        id: cached.module.manifest.id,
        title: cached.module.manifest.title,
        description: cached.module.manifest.description,
        version: cached.module.manifest.version,
        source: "registry",
        loaded: true,
        hasRoomConfig: !!cached.module.roomConfig,
      });
    } else {
      available.push({
        id,
        title: id,
        description: "(not yet loaded — spawn a room to load)",
        version: "unknown",
        source: "registry",
        loaded: false,
        hasRoomConfig: false,
      });
    }
  }

  res.json(available);
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
    config: room.config,
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

// ── Room-specific bundle (serves the correct experience's client bundle) ──
app.get("/rooms/:roomId/bundle", (req, res) => {
  const room = getRoom(req.params.roomId);
  if (!room) {
    res.status(404).json({ error: `Room '${req.params.roomId}' not found` });
    return;
  }
  const loaded = getExperienceForRoom(room);
  if (!loaded) {
    res.status(500).json({ error: `Experience '${room.experienceId}' not loaded` });
    return;
  }
  res.setHeader("Content-Type", "text/javascript");
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.send(loaded.clientBundle);
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

// ── Client bundle smoke test ──────────────────────────────────
// Fetches the client bundle from the running server and tries to parse it.
// Catches SyntaxErrors (like duplicate declarations) before the user sees them.

async function smokTestClientBundle(port: number) {
  try {
    const res = await fetch(`http://localhost:${port}/bundle`);
    let bundleCode = await res.text();
    if (bundleCode) {
      // The client bundle is ESM — strip export statements so new Function() can parse it.
      // We only care about catching SyntaxErrors like duplicate declarations, not runtime behavior.
      bundleCode = bundleCode.replace(/\bexport\s*\{[^}]*\}/g, "");
      bundleCode = bundleCode.replace(/\bexport\s+default\s+/g, "var __default = ");
      bundleCode = bundleCode.replace(/\bexport\s+(const|let|var|function|class)\s/g, "$1 ");
      new Function(bundleCode);
      console.log(`  Smoke test: client bundle OK`);
    }
  } catch (err: any) {
    console.error(`\n  ⚠ SMOKE TEST FAILED — client bundle has errors:`);
    console.error(`    ${err.message}`);
    console.error(`    The viewer will fail to load. Fix the source and save to hot-reload.\n`);
  }
}

// ── Start server ───────────────────────────────────────────

export async function startServer() {
  await loadHost();

  // Create default room (with default config + initial state from experience)
  const hostExp = getHostExperience();
  const defaultConfig = resolveRoomConfig(hostExp, undefined);
  const hostInitialState = resolveInitialState(hostExp, defaultConfig);
  const defaultRoom = new Room(DEFAULT_ROOM_ID, hostExperienceId, hostInitialState, defaultConfig);
  rooms.set(DEFAULT_ROOM_ID, defaultRoom);

  // Log registry info
  const registry = loadRegistry();
  if (registry.entries.size > 0) {
    console.log(`  Registry: ${registry.entries.size} experience(s) available`);
    for (const [id] of registry.entries) {
      console.log(`    - ${id}${id === registry.host ? " (host)" : ""}`);
    }
  }

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

          // Reuse actorId if the viewer sends one back (e.g. on refresh)
          let actorId: string;
          if (msg.actorId) {
            // Check if the old actorId is held by a stale WS (refresh scenario)
            let staleWs: WebSocket | null = null;
            for (const [existingWs, existingId] of room.wsConnections.entries()) {
              if (existingId === msg.actorId && existingWs !== ws) {
                staleWs = existingWs;
                break;
              }
            }
            if (staleWs) {
              // Evict the stale connection
              room.wsConnections.delete(staleWs);
              try { staleWs.close(); } catch {}
            }
            // Reuse the old actorId
            actorId = msg.actorId;
          } else {
            actorId = assignActorId(username, "human");
          }
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
            config: room.config,
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

  // Watch src/ and templates/ directories for changes (host experience only)
  const watchDirs = [
    path.join(PROJECT_ROOT, "src"),
    path.join(PROJECT_ROOT, "templates"),
  ].filter((d) => fs.existsSync(d));
  let debounceTimer: NodeJS.Timeout | null = null;

  function onSrcChange(filename?: string) {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      console.log(`\nFile changed${filename ? ` (${filename})` : ""}, rebuilding...`);

      // Determine which cached experiences are affected by this file change
      const changedPath = filename ? path.resolve(PROJECT_ROOT, filename) : null;
      const affectedIds: string[] = [];

      for (const [id, loaded] of experienceCache) {
        if (!changedPath) {
          // No filename — conservatively reload everything
          affectedIds.push(id);
        } else {
          // Check if changed file is in the same directory tree as the experience source
          const expDir = path.dirname(loaded.sourcePath);
          if (changedPath.startsWith(expDir)) {
            affectedIds.push(id);
          }
        }
      }

      // If nothing matched in cache, it might be a change to the host's source
      if (affectedIds.length === 0) {
        affectedIds.push(hostExperienceId);
      }

      // Evict affected experiences from cache
      for (const id of affectedIds) {
        experienceCache.delete(id);
      }

      try {
        // Always reload the host (it's needed for the default room)
        if (affectedIds.includes(hostExperienceId)) {
          await loadHost();
          for (const room of rooms.values()) {
            if (room.experienceId === hostExperienceId) {
              room.broadcastToAll({ type: "experience_updated" });
            }
          }
          smokTestClientBundle(PORT);
        }

        // For non-host affected experiences, just evict — they rebuild on next access
        const nonHost = affectedIds.filter((id) => id !== hostExperienceId);
        if (nonHost.length > 0) {
          console.log(`  Cache evicted: ${nonHost.join(", ")} (will rebuild on next access)`);
        }

        console.log("Hot reload complete.");
      } catch (err: any) {
        console.error("Hot reload failed:", err.message);
        for (const room of rooms.values()) {
          if (room.experienceId === hostExperienceId) {
            room.broadcastToAll({ type: "build_error", error: err.message });
          }
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

  server.listen(PORT, async () => {
    console.log(`\n  vibe-vibe local runtime`);
    console.log(`  ───────────────────────`);
    console.log(`  Viewer:  http://localhost:${PORT}`);

    // Verify the client bundle can be parsed without errors
    smokTestClientBundle(PORT);
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
