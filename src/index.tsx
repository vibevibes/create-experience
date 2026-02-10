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
} from "@vibevibes/sdk";

const { useState, useRef, useEffect } = React;

// ── Constants ───────────────────────────────────────────────────────────

const W = 800;
const H = 600;

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// ── Emoji map ───────────────────────────────────────────────────────────

const EMOJI: Record<string, string> = {
  hospital: "🏥",
  barracks: "🏰",
  farm: "🌾",
  wall: "🧱",
  kid: "👶",
  soldier: "💂",
  farmer: "🧑‍🌾",
  player: "👤",
  ai: "🤖",
};

// ── Tools ───────────────────────────────────────────────────────────────

const tools = [
  defineTool({
    name: "village.say",
    description: "Say something in the world. Everyone sees it.",
    input_schema: z.object({ text: z.string().min(1).max(500) }),
    handler: (ctx, input) => {
      const state = ctx.state as any;
      const msg = { id: uid(), actor: ctx.actorId, text: input.text, ts: ctx.timestamp };
      ctx.setState({ ...state, messages: [...(state.messages || []), msg].slice(-50) });
      return { said: input.text };
    },
  }),

  defineTool({
    name: "village.spawn_kid",
    description: "Spawn a kid from a hospital. Specify which side (left or right).",
    input_schema: z.object({
      side: z.enum(["left", "right"]),
    }),
    handler: (ctx, input) => {
      const state = ctx.state as any;
      const side = input.side;
      const hospital = (state.buildings || []).find((b: any) => b.type === "hospital" && b.side === side);
      if (!hospital) return { error: "No hospital on that side" };

      const kid = {
        id: uid(),
        type: "kid",
        pos: { x: hospital.pos.x, y: hospital.pos.y + 40 },
        side,
        state: "idle",
      };
      ctx.setState({ ...state, units: [...(state.units || []), kid] });
      return { spawned: kid.id, side };
    },
  }),

  defineTool({
    name: "village.assign_kid",
    description: "Assign a kid to either barracks (become soldier) or farm (become farmer).",
    input_schema: z.object({
      kidId: z.string(),
      destination: z.enum(["barracks", "farm"]),
    }),
    handler: (ctx, input) => {
      const state = ctx.state as any;
      const units = [...(state.units || [])];
      const idx = units.findIndex((u: any) => u.id === input.kidId);
      if (idx < 0) return { error: "Kid not found" };

      const kid = units[idx];
      if (kid.type !== "kid") return { error: "Unit is not a kid" };

      const building = (state.buildings || []).find(
        (b: any) => b.type === input.destination && b.side === kid.side
      );
      if (!building) return { error: "Building not found on that side" };

      // Set the kid to move toward the building
      units[idx] = { ...kid, target: building.pos, destination: input.destination };
      ctx.setState({ ...state, units });
      return { assigned: input.kidId, destination: input.destination };
    },
  }),

  defineTool({
    name: "village.tick",
    description: "Process game tick - convert kids who reached their destination, update resources.",
    input_schema: z.object({}),
    handler: (ctx) => {
      const state = ctx.state as any;
      const units = [...(state.units || [])];
      let resources = { ...state.resources } || { left: { food: 0, soldiers: 0 }, right: { food: 0, soldiers: 0 } };

      for (let i = 0; i < units.length; i++) {
        const unit = units[i];

        // Convert kids who reached destination
        if (unit.type === "kid" && unit.destination && unit.target) {
          const dx = unit.target.x - unit.pos.x;
          const dy = unit.target.y - unit.pos.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < 15) {
            if (unit.destination === "barracks") {
              units[i] = { ...unit, type: "soldier", destination: undefined, target: undefined };
              resources[unit.side].soldiers = (resources[unit.side].soldiers || 0) + 1;
            } else if (unit.destination === "farm") {
              units[i] = { ...unit, type: "farmer", destination: undefined, target: undefined };
            }
          }
        }

        // Farmers generate food
        if (unit.type === "farmer" && Math.random() < 0.1) {
          resources[unit.side].food = (resources[unit.side].food || 0) + 1;
        }
      }

      ctx.setState({ ...state, units, resources });
      return { updated: true };
    },
  }),

  ...createChatTools(z),
  ...createBugReportTools(z),
];

// ── Grass background ────────────────────────────────────────────────────

function GrassBackground() {
  return (
    <svg width={W} height={H} style={{ position: "absolute", top: 0, left: 0 }}>
      <defs>
        <pattern id="grass" patternUnits="userSpaceOnUse" width="40" height="40">
          <rect width="40" height="40" fill="#4a7c3f" />
          <rect x="0" y="0" width="20" height="20" fill="#4f8544" opacity="0.5" />
          <rect x="20" y="20" width="20" height="20" fill="#4f8544" opacity="0.5" />
        </pattern>
      </defs>
      <rect width={W} height={H} fill="url(#grass)" />
    </svg>
  );
}

// ── Entity rendering ────────────────────────────────────────────────────

function BuildingNode({ building }: { building: any }) {
  const emoji = EMOJI[building.type] || "❓";
  const size = building.type === "hospital" ? 48 : building.type === "wall" ? 32 : 44;

  return (
    <div
      style={{
        position: "absolute",
        left: building.pos.x - size / 2,
        top: building.pos.y - size / 2,
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.85,
        zIndex: 5,
        filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.4))",
      }}
      title={building.type}
    >
      <span style={{ lineHeight: 1 }}>{emoji}</span>
    </div>
  );
}

function UnitNode({ unit, pos }: { unit: any; pos: { x: number; y: number } }) {
  const emoji = EMOJI[unit.type] || "❓";
  const size = 28;

  return (
    <div
      style={{
        position: "absolute",
        left: pos.x - size / 2,
        top: pos.y - size / 2,
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.85,
        zIndex: Math.round(pos.y),
        filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.3))",
        cursor: unit.type === "kid" ? "pointer" : "default",
      }}
      title={unit.type}
    >
      <span style={{ lineHeight: 1 }}>{emoji}</span>
    </div>
  );
}

// ── Animated positions hook ─────────────────────────────────────────────

function useAnimatedPositions(units: any[]) {
  const posRef = useRef<Record<string, { x: number; y: number }>>({});
  const [display, setDisplay] = useState<Record<string, { x: number; y: number }>>({});
  const rafRef = useRef(0);
  const lastRef = useRef(0);

  useEffect(() => {
    for (const u of units) {
      if (!posRef.current[u.id]) posRef.current[u.id] = { ...u.pos };
    }
    const ids = new Set(units.map((u: any) => u.id));
    for (const id of Object.keys(posRef.current)) {
      if (!ids.has(id)) delete posRef.current[id];
    }
  }, [units]);

  useEffect(() => {
    function tick(now: number) {
      if (!lastRef.current) lastRef.current = now;
      const dt = Math.min((now - lastRef.current) / 1000, 0.1);
      lastRef.current = now;
      let moved = false;
      for (const u of units) {
        const target = u.target || u.pos;
        const cur = posRef.current[u.id] || { ...u.pos };
        const dx = target.x - cur.x, dy = target.y - cur.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 1) {
          const step = Math.min(80 * dt, dist);
          cur.x += (dx / dist) * step;
          cur.y += (dy / dist) * step;
          posRef.current[u.id] = cur;
          moved = true;
        } else if (dist > 0) {
          posRef.current[u.id] = { ...target };
          moved = true;
        }
      }
      if (moved) setDisplay({ ...posRef.current });
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [units]);

  return display;
}

// ── Canvas ──────────────────────────────────────────────────────────────

function Canvas(props: any) {
  const { sharedState, callTool, actorId, ephemeralState, setEphemeral, participants } = props;
  const state = sharedState || { buildings: [], units: [], messages: [], resources: { left: { food: 0, soldiers: 0 }, right: { food: 0, soldiers: 0 } } };
  const buildings = state.buildings || [];
  const units = state.units || [];
  const messages = state.messages || [];
  const resources = state.resources || { left: { food: 0, soldiers: 0 }, right: { food: 0, soldiers: 0 } };
  const display = useAnimatedPositions(units);
  const [selectedKid, setSelectedKid] = useState<string | null>(null);
  const chatRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages.length]);

  // Auto-tick every 2 seconds for low latency
  useEffect(() => {
    const interval = setInterval(() => {
      callTool("village.tick", {});
    }, 2000);
    return () => clearInterval(interval);
  }, [callTool]);

  const handleUnitClick = (unitId: string, unitType: string) => {
    if (unitType === "kid") {
      setSelectedKid(unitId);
    }
  };

  const handleAssign = (destination: "barracks" | "farm") => {
    if (!selectedKid) return;
    callTool("village.assign_kid", { kidId: selectedKid, destination });
    setSelectedKid(null);
  };

  const sorted = [...units].sort((a, b) => {
    return ((display[a.id] || a.pos).y) - ((display[b.id] || b.pos).y);
  });

  return (
    <div style={{ display: "flex", height: "100vh", background: "#1a120a", color: "#e5dcc8", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      {/* World */}
      <div
        style={{
          position: "relative", width: W, height: H, margin: 16,
          borderRadius: 12, overflow: "hidden", flexShrink: 0,
          border: "3px solid #5a4020", boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
        }}
      >
        <GrassBackground />

        {/* Buildings */}
        {buildings.map((b: any) => (
          <BuildingNode key={b.id} building={b} />
        ))}

        {/* Units */}
        {sorted.map((u: any) => (
          <div key={u.id} onClick={() => handleUnitClick(u.id, u.type)}>
            <UnitNode unit={u} pos={display[u.id] || u.pos} />
            {selectedKid === u.id && (
              <div style={{
                position: "absolute",
                left: (display[u.id] || u.pos).x - 20,
                top: (display[u.id] || u.pos).y - 50,
                background: "rgba(0,0,0,0.8)",
                padding: "4px 8px",
                borderRadius: 4,
                fontSize: 11,
                border: "1px solid #60a5fa",
              }}>
                Selected
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Control panel */}
      <div style={{
        flex: 1, display: "flex", flexDirection: "column", margin: "16px 16px 16px 0", minWidth: 0,
        background: "linear-gradient(180deg, #2a1a0a 0%, #1f140a 100%)", borderRadius: 12,
        border: "2px solid #5a4020", padding: 16, gap: 16,
      }}>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: "#d4a44a", letterSpacing: 1, borderBottom: "1px solid #3a2a10", paddingBottom: 10 }}>
          Village Wars
        </h2>

        {/* Resources */}
        <div style={{ display: "flex", gap: 16 }}>
          <div style={{ flex: 1, padding: 12, background: "#2a1a0a", borderRadius: 8, border: "1px solid #3a2a10" }}>
            <h3 style={{ margin: "0 0 8px 0", fontSize: 13, fontWeight: 700, color: "#60a5fa" }}>Left Village</h3>
            <div style={{ fontSize: 12 }}>🌾 Food: {resources.left?.food || 0}</div>
            <div style={{ fontSize: 12 }}>💂 Soldiers: {resources.left?.soldiers || 0}</div>
          </div>
          <div style={{ flex: 1, padding: 12, background: "#2a1a0a", borderRadius: 8, border: "1px solid #3a2a10" }}>
            <h3 style={{ margin: "0 0 8px 0", fontSize: 13, fontWeight: 700, color: "#c084fc" }}>Right Village</h3>
            <div style={{ fontSize: 12 }}>🌾 Food: {resources.right?.food || 0}</div>
            <div style={{ fontSize: 12 }}>💂 Soldiers: {resources.right?.soldiers || 0}</div>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button
            onClick={() => callTool("village.spawn_kid", { side: "left" })}
            style={{
              padding: "10px 14px", fontSize: 13, fontWeight: 700, background: "#1e40af",
              color: "#fff", border: "2px solid #3b82f6", borderRadius: 8, cursor: "pointer",
            }}
          >
            👶 Spawn Kid (Left)
          </button>
          <button
            onClick={() => callTool("village.spawn_kid", { side: "right" })}
            style={{
              padding: "10px 14px", fontSize: 13, fontWeight: 700, background: "#6b21a8",
              color: "#fff", border: "2px solid #a855f7", borderRadius: 8, cursor: "pointer",
            }}
          >
            👶 Spawn Kid (Right)
          </button>

          {selectedKid && (
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button
                onClick={() => handleAssign("barracks")}
                style={{
                  flex: 1, padding: "10px 14px", fontSize: 13, fontWeight: 700, background: "#b45309",
                  color: "#fff", border: "2px solid #d97706", borderRadius: 8, cursor: "pointer",
                }}
              >
                🏰 Send to Barracks
              </button>
              <button
                onClick={() => handleAssign("farm")}
                style={{
                  flex: 1, padding: "10px 14px", fontSize: 13, fontWeight: 700, background: "#15803d",
                  color: "#fff", border: "2px solid #22c55e", borderRadius: 8, cursor: "pointer",
                }}
              >
                🌾 Send to Farm
              </button>
            </div>
          )}
        </div>

        {/* Chat */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
          <h3 style={{ margin: "0 0 8px 0", fontSize: 14, fontWeight: 700, color: "#d4a44a" }}>Chat</h3>
          <div ref={chatRef} style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 2, paddingRight: 8 }}>
            {messages.map((msg: any) => (
              <div key={msg.id} style={{ fontSize: 12, lineHeight: 1.5, padding: "3px 0" }}>
                <span style={{
                  fontWeight: 700, marginRight: 6,
                  color: msg.actor === "system" ? "#8a7a5a" : msg.actor.includes("-ai-") ? "#c084fc" : "#60a5fa",
                }}>
                  {msg.actor === "system" ? "system" : msg.actor.includes("-ai-") ? "🤖" : "👤"}:
                </span>
                <span style={{ color: "#d4c4a0" }}>{msg.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Standardized UI */}
      <ChatPanel
        sharedState={sharedState}
        callTool={callTool}
        actorId={actorId}
        ephemeralState={ephemeralState || {}}
        setEphemeral={setEphemeral || (() => {})}
        participants={participants || []}
      />
      <ReportBug callTool={callTool} actorId={actorId} />
    </div>
  );
}

// ── Experience ──────────────────────────────────────────────────────────

export default defineExperience({
  manifest: {
    id: "village-wars",
    title: "Village Wars",
    description: "A strategy game where you manage villages, spawn kids, and assign them to become soldiers or farmers.",
    version: "0.1.0",
    requested_capabilities: [],
    category: "game",
    tags: ["strategy", "villages", "resource-management"],
    agentSlots: [
      {
        role: "opponent",
        systemPrompt: `You are managing the RIGHT village in a strategy game. Your goal is to build a strong village by:
1. Spawning kids from the hospital using village.spawn_kid with side: "right"
2. Assigning kids to either barracks (to become soldiers) or farms (to become farmers)
3. Balancing your economy - farmers generate food, soldiers protect the village

Use village.say to comment on your strategy or react to the game state.
You can see the current resources and units via the watch state.`,
        allowedTools: ["village.say", "village.spawn_kid", "village.assign_kid", "_chat.send"],
        autoSpawn: true,
        maxInstances: 1,
      },
    ],
  },
  Canvas,
  tools,
  agentHints: [...createChatHints(), ...createBugReportHints()],
  initialState: {
    buildings: [
      // Left village
      { id: "hospital-left", type: "hospital", side: "left", pos: { x: 150, y: 100 } },
      { id: "barracks-left", type: "barracks", side: "left", pos: { x: 150, y: 250 } },
      { id: "farm-left", type: "farm", side: "left", pos: { x: 150, y: 400 } },
      // Walls
      { id: "wall-1", type: "wall", side: "middle", pos: { x: 400, y: 100 } },
      { id: "wall-2", type: "wall", side: "middle", pos: { x: 400, y: 200 } },
      { id: "wall-3", type: "wall", side: "middle", pos: { x: 400, y: 300 } },
      { id: "wall-4", type: "wall", side: "middle", pos: { x: 400, y: 400 } },
      { id: "wall-5", type: "wall", side: "middle", pos: { x: 400, y: 500 } },
      // Right village
      { id: "hospital-right", type: "hospital", side: "right", pos: { x: 650, y: 100 } },
      { id: "barracks-right", type: "barracks", side: "right", pos: { x: 650, y: 250 } },
      { id: "farm-right", type: "farm", side: "right", pos: { x: 650, y: 400 } },
    ],
    units: [],
    messages: [
      { id: "welcome", actor: "system", text: "Welcome to Village Wars! Spawn kids from hospitals and assign them to barracks or farms.", ts: Date.now() },
    ],
    resources: {
      left: { food: 0, soldiers: 0 },
      right: { food: 0, soldiers: 0 },
    },
  },
  tests: [
    defineTest({
      name: "spawn kid creates unit",
      run: async ({ tool, ctx: makeCtx, expect }) => {
        const spawn = tool("village.spawn_kid");
        const initialState = {
          buildings: [{ id: "h1", type: "hospital", side: "left", pos: { x: 100, y: 100 } }],
          units: [],
          messages: [],
          resources: { left: { food: 0, soldiers: 0 }, right: { food: 0, soldiers: 0 } },
        };
        const c = makeCtx({ state: initialState });
        await spawn.handler(c, { side: "left" });
        const s = c.getState();
        expect(s.units.length).toBe(1);
        expect(s.units[0].type).toBe("kid");
      },
    }),
  ],
});
