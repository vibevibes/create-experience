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
  tree: "🌳", rock: "🪨", water: "🌊", flower: "🌻", house: "🏡",
  creature: "🐾", player: "🧑‍🌾", ai: "🤖",
};

// ── Tools ───────────────────────────────────────────────────────────────

const tools = [
  defineTool({
    name: "sandbox.say",
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
    name: "sandbox.move",
    description: "Move your entity to a position in the world.",
    input_schema: z.object({ x: z.number().min(0).max(W), y: z.number().min(0).max(H) }),
    handler: (ctx, input) => {
      const state = ctx.state as any;
      const target = { x: input.x, y: input.y };
      const entities = [...(state.entities || [])];
      const idx = entities.findIndex((e: any) => e.id === ctx.actorId);
      if (idx >= 0) {
        entities[idx] = { ...entities[idx], target };
      } else {
        entities.push({
          id: ctx.actorId,
          type: ctx.actorId.includes("-ai-") ? "ai" : "player",
          pos: target,
          target,
          label: ctx.actorId.split("-")[0],
        });
      }
      ctx.setState({ ...state, entities });
      return { moved: target };
    },
  }),

  defineTool({
    name: "sandbox.spawn",
    description: "Place a new entity in the world.",
    input_schema: z.object({
      type: z.string().min(1),
      x: z.number().min(0).max(W),
      y: z.number().min(0).max(H),
      label: z.string().optional(),
    }),
    handler: (ctx, input) => {
      const state = ctx.state as any;
      const entity = { id: uid(), type: input.type, pos: { x: input.x, y: input.y }, label: input.label };
      ctx.setState({ ...state, entities: [...(state.entities || []), entity] });
      return { spawned: entity.id, type: input.type };
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

function EntityNode({ entity, pos }: { entity: any; pos: { x: number; y: number } }) {
  const isPlayer = entity.type === "player" || entity.type === "ai";
  const size = isPlayer ? 32 : entity.type === "tree" ? 36 : entity.type === "house" ? 38 : 24;
  const emoji = EMOJI[entity.type] || "❓";

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
        zIndex: isPlayer ? 20 : Math.round(pos.y),
        filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.3))",
      }}
      title={entity.label || entity.type}
    >
      <span style={{ lineHeight: 1 }}>{emoji}</span>
      {entity.label && (
        <div style={{
          position: "absolute", top: -16, whiteSpace: "nowrap",
          fontSize: 10, fontWeight: 600, textAlign: "center",
          color: isPlayer ? "#fff" : "#c8dfc0",
          textShadow: "0 1px 3px rgba(0,0,0,0.8)",
        }}>
          {entity.label}
        </div>
      )}
    </div>
  );
}

// ── Animated positions hook ─────────────────────────────────────────────

function useAnimatedPositions(entities: any[]) {
  const posRef = useRef<Record<string, { x: number; y: number }>>({});
  const [display, setDisplay] = useState<Record<string, { x: number; y: number }>>({});
  const rafRef = useRef(0);
  const lastRef = useRef(0);

  useEffect(() => {
    for (const e of entities) {
      if (!posRef.current[e.id]) posRef.current[e.id] = { ...e.pos };
    }
    const ids = new Set(entities.map((e: any) => e.id));
    for (const id of Object.keys(posRef.current)) {
      if (!ids.has(id)) delete posRef.current[id];
    }
  }, [entities]);

  useEffect(() => {
    function tick(now: number) {
      if (!lastRef.current) lastRef.current = now;
      const dt = Math.min((now - lastRef.current) / 1000, 0.1);
      lastRef.current = now;
      let moved = false;
      for (const e of entities) {
        const target = e.target || e.pos;
        const cur = posRef.current[e.id] || { ...e.pos };
        const dx = target.x - cur.x, dy = target.y - cur.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 1) {
          const step = Math.min(120 * dt, dist);
          cur.x += (dx / dist) * step;
          cur.y += (dy / dist) * step;
          posRef.current[e.id] = cur;
          moved = true;
        } else if (dist > 0) {
          posRef.current[e.id] = { ...target };
          moved = true;
        }
      }
      if (moved) setDisplay({ ...posRef.current });
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [entities]);

  return display;
}

// ── Canvas ──────────────────────────────────────────────────────────────

function Canvas(props: any) {
  const { sharedState, callTool, actorId, ephemeralState, setEphemeral, participants } = props;
  const state = sharedState || { entities: [], messages: [] };
  const entities = state.entities || [];
  const messages = state.messages || [];
  const display = useAnimatedPositions(entities);
  const [chatInput, setChatInput] = useState("");
  const chatRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages.length]);

  const handleWorldClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    callTool("sandbox.move", { x: Math.round(e.clientX - rect.left), y: Math.round(e.clientY - rect.top) });
  };

  const handleSay = () => {
    if (!chatInput.trim()) return;
    callTool("sandbox.say", { text: chatInput.trim() });
    setChatInput("");
  };

  const sorted = [...entities].sort((a, b) => {
    return ((display[a.id] || a.pos).y) - ((display[b.id] || b.pos).y);
  });

  return (
    <div style={{ display: "flex", height: "100vh", background: "#1a120a", color: "#e5dcc8", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      {/* World */}
      <div
        onClick={handleWorldClick}
        style={{
          position: "relative", width: W, height: H, margin: 16,
          borderRadius: 12, overflow: "hidden", cursor: "crosshair", flexShrink: 0,
          border: "3px solid #5a4020", boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
        }}
      >
        <GrassBackground />
        {sorted.map((e) => (
          <EntityNode key={e.id} entity={e} pos={display[e.id] || e.pos} />
        ))}
        {entities.length === 0 && (
          <div style={{
            position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 16, color: "#8a7a5a", pointerEvents: "none", fontWeight: 600,
          }}>
            Click anywhere to enter the world
          </div>
        )}
      </div>

      {/* Chat panel */}
      <div style={{
        flex: 1, display: "flex", flexDirection: "column", margin: "16px 16px 16px 0", minWidth: 0,
        background: "linear-gradient(180deg, #2a1a0a 0%, #1f140a 100%)", borderRadius: 12,
        border: "2px solid #5a4020", padding: 16,
      }}>
        <h2 style={{ margin: "0 0 12px 0", fontSize: 17, fontWeight: 800, color: "#d4a44a", letterSpacing: 1, borderBottom: "1px solid #3a2a10", paddingBottom: 10 }}>
          The Sandbox
        </h2>
        <div ref={chatRef} style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 2, paddingRight: 8 }}>
          {messages.map((msg: any) => (
            <div key={msg.id} style={{ fontSize: 13, lineHeight: 1.5, padding: "5px 0", borderBottom: "1px solid #2a1a0a" }}>
              <span style={{
                fontWeight: 700, marginRight: 6,
                color: msg.actor === "system" ? "#8a7a5a" : msg.actor.includes("-ai-") ? "#c084fc" : "#60a5fa",
              }}>
                {msg.actor === "system" ? "system" : msg.actor.includes("-ai-") ? "🤖 ai" : `🧑‍🌾 ${msg.actor.split("-")[0]}`}:
              </span>
              <span style={{ color: "#d4c4a0" }}>{msg.text}</span>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <input
            type="text" value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSay()}
            placeholder="Say something..."
            style={{
              flex: 1, padding: "10px 14px", fontSize: 13, background: "#1a0f05",
              border: "2px solid #5a4020", borderRadius: 8, color: "#e5dcc8", outline: "none",
            }}
          />
          <button onClick={handleSay} style={{
            padding: "10px 18px", fontSize: 13, fontWeight: 700, background: "#b45309",
            color: "#fff", border: "2px solid #d97706", borderRadius: 8, cursor: "pointer",
          }}>
            Say
          </button>
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
2. Use sandbox.spawn to place new entities (tree, rock, water, flower, house, creature)
3. Use sandbox.move to move yourself around the world

The world is ${W}x${H} pixels. Position entities within these bounds.
You can also use _chat.send to reply in the collapsible chat panel.`,
        allowedTools: ["sandbox.say", "sandbox.move", "sandbox.spawn", "_chat.send"],
        autoSpawn: true,
        maxInstances: 1,
      },
    ],
  },
  Canvas,
  tools,
  agentHints: [...createChatHints(), ...createBugReportHints()],
  initialState: {
    entities: [],
    messages: [
      { id: "welcome", actor: "system", text: "Welcome to The Sandbox. Click the world to enter, then tell the AI what to build.", ts: Date.now() },
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
