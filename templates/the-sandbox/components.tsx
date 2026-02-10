import React from "react";
import type { SandboxState, Entity, Vec2, Battle } from "./types";
import { WORLD_W, WORLD_H, entityColor } from "./utils";

const { useState, useRef, useEffect, useCallback, useMemo } = React;

const WALK_SPEED = 120;

/* ─── Animation hook ─── */
function useAnimatedEntities(entities: Entity[]) {
  const positionsRef = useRef<Record<string, Vec2>>({});
  const [displayPositions, setDisplayPositions] = useState<Record<string, Vec2>>({});
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);

  useEffect(() => {
    for (const e of entities) {
      if (!positionsRef.current[e.id]) {
        positionsRef.current[e.id] = { ...e.pos };
      }
    }
    for (const id of Object.keys(positionsRef.current)) {
      if (!entities.find((e) => e.id === id)) {
        delete positionsRef.current[id];
      }
    }
  }, [entities]);

  useEffect(() => {
    function tick(now: number) {
      if (!lastTimeRef.current) lastTimeRef.current = now;
      const dt = Math.min((now - lastTimeRef.current) / 1000, 0.1);
      lastTimeRef.current = now;

      let moved = false;
      for (const e of entities) {
        const target = e.target || e.pos;
        const cur = positionsRef.current[e.id] || { ...e.pos };
        const dx = target.x - cur.x;
        const dy = target.y - cur.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > 1) {
          const step = Math.min(WALK_SPEED * dt, dist);
          cur.x += (dx / dist) * step;
          cur.y += (dy / dist) * step;
          positionsRef.current[e.id] = cur;
          moved = true;
        } else if (dist > 0) {
          positionsRef.current[e.id] = { ...target };
          moved = true;
        }
      }

      if (moved) {
        setDisplayPositions({ ...positionsRef.current });
      }

      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [entities]);

  return displayPositions;
}

/* ─── Emoji maps ─── */
const ENTITY_EMOJI: Record<string, string> = {
  tree: "🌳", rock: "🪨", water: "🌊", flower: "🌻", house: "🏡",
  creature: "🐾", player: "🧑‍🌾", ai: "🤖", crop: "🌱", fence: "🪵",
};

const CREATURE_EMOJI: Record<string, string> = {
  fox: "🦊", rabbit: "🐇", deer: "🦌", wolf: "🐺", bear: "🐻",
  snake: "🐍", eagle: "🦅", owl: "🦉", chicken: "🐔", cow: "🐄",
  cat: "🐱", dog: "🐕", default: "🐾",
};

const TREE_EMOJI: Record<string, string> = {
  oak: "🌳", pine: "🌲", birch: "🌳", willow: "🌳", maple: "🍁",
  elm: "🌳", cedar: "🌲", spruce: "🌲", ash: "🌳", default: "🌳",
};

const FLOWER_EMOJI: Record<string, string> = {
  rose: "🌹", daisy: "🌼", tulip: "🌷", lily: "💮", sunflower: "🌻", default: "🌸",
};

function getEmoji(entity: Entity): string {
  const label = (entity.label || "").toLowerCase();
  if (entity.type === "creature") {
    for (const [key, emoji] of Object.entries(CREATURE_EMOJI)) {
      if (label.includes(key)) return emoji;
    }
    return CREATURE_EMOJI.default;
  }
  if (entity.type === "tree") {
    for (const [key, emoji] of Object.entries(TREE_EMOJI)) {
      if (label.includes(key)) return emoji;
    }
    return TREE_EMOJI.default;
  }
  if (entity.type === "flower") {
    for (const [key, emoji] of Object.entries(FLOWER_EMOJI)) {
      if (label.includes(key)) return emoji;
    }
    return FLOWER_EMOJI.default;
  }
  return ENTITY_EMOJI[entity.type] || "❓";
}

/* ─── Status colors ─── */
const STATUS_COLORS: Record<string, string> = {
  watching: "#4ade80",
  idle: "#94a3b8",
  thinking: "#fbbf24",
};

/* ─── Grass pattern via SVG ─── */
function GrassBackground() {
  return (
    <svg width={WORLD_W} height={WORLD_H} style={{ position: "absolute", top: 0, left: 0 }}>
      <defs>
        <pattern id="grass" patternUnits="userSpaceOnUse" width="40" height="40">
          <rect width="40" height="40" fill="#4a7c3f" />
          <rect x="0" y="0" width="20" height="20" fill="#4f8544" opacity="0.5" />
          <rect x="20" y="20" width="20" height="20" fill="#4f8544" opacity="0.5" />
        </pattern>
        <pattern id="grassDetail" patternUnits="userSpaceOnUse" width="80" height="80">
          <circle cx="10" cy="15" r="1" fill="#5a9" opacity="0.3" />
          <circle cx="45" cy="5" r="1" fill="#5a9" opacity="0.2" />
          <circle cx="70" cy="35" r="1" fill="#5a9" opacity="0.25" />
          <circle cx="25" cy="60" r="1" fill="#5a9" opacity="0.2" />
          <circle cx="55" cy="70" r="1" fill="#5a9" opacity="0.3" />
        </pattern>
      </defs>
      <rect width={WORLD_W} height={WORLD_H} fill="url(#grass)" />
      <rect width={WORLD_W} height={WORLD_H} fill="url(#grassDetail)" />
      {/* Subtle grid */}
      {Array.from({ length: Math.floor(WORLD_W / 40) }, (_, i) => (
        <line key={`v${i}`} x1={(i + 1) * 40} y1={0} x2={(i + 1) * 40} y2={WORLD_H} stroke="#3a6a30" strokeWidth={1} opacity={0.3} />
      ))}
      {Array.from({ length: Math.floor(WORLD_H / 40) }, (_, i) => (
        <line key={`h${i}`} x1={0} y1={(i + 1) * 40} x2={WORLD_W} y2={(i + 1) * 40} stroke="#3a6a30" strokeWidth={1} opacity={0.3} />
      ))}
    </svg>
  );
}

/* ─── Entity rendering ─── */
function EntityNode({ entity, displayPos }: { entity: Entity; displayPos?: Vec2 }) {
  const isPlayer = entity.type === "player" || entity.type === "ai";
  const isCreature = entity.type === "creature";
  const pos = displayPos || entity.pos;
  const emoji = getEmoji(entity);
  const size = isPlayer ? 32 : isCreature ? 28 : entity.type === "tree" ? 36 : entity.type === "house" ? 38 : 24;
  const statusColor = entity.status ? STATUS_COLORS[entity.status] || "#94a3b8" : null;

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
        cursor: isCreature ? "pointer" : "default",
        zIndex: isPlayer ? 20 : isCreature ? 10 : Math.round(pos.y),
        filter: isPlayer ? "drop-shadow(0 2px 4px rgba(0,0,0,0.5))" : "drop-shadow(0 1px 2px rgba(0,0,0,0.3))",
        transition: "filter 0.2s",
      }}
      title={`${entity.label || entity.type}${entity.status ? ` (${entity.status})` : ""}`}
    >
      <span style={{ lineHeight: 1 }}>{emoji}</span>

      {/* Status indicator */}
      {statusColor && (
        <div style={{
          position: "absolute",
          bottom: -2,
          right: -2,
          width: 10,
          height: 10,
          borderRadius: "50%",
          backgroundColor: statusColor,
          border: "2px solid #2d5a1e",
          boxShadow: `0 0 4px ${statusColor}`,
        }} />
      )}

      {/* Name label */}
      {entity.label && (
        <div style={{
          position: "absolute",
          top: -18,
          whiteSpace: "nowrap",
          fontSize: 10,
          fontWeight: 600,
          color: isPlayer ? "#fff" : isCreature ? "#fde68a" : "#c8dfc0",
          textAlign: "center",
          textShadow: "0 1px 3px rgba(0,0,0,0.8)",
          fontFamily: "'Segoe UI', system-ui, sans-serif",
        }}>
          {entity.label}
        </div>
      )}
    </div>
  );
}

/* ─── HP Bar ─── */
function HpBar({ current, max, color }: { current: number; max: number; color: string }) {
  const pct = Math.max(0, Math.min(100, (current / max) * 100));
  return (
    <div style={{ width: "100%", height: 16, background: "#2a1a0a", borderRadius: 8, overflow: "hidden", border: "2px solid #5a3a1a" }}>
      <div style={{
        width: `${pct}%`,
        height: "100%",
        background: pct > 50 ? color : pct > 25 ? "#d97706" : "#dc2626",
        borderRadius: 6,
        transition: "width 0.3s ease",
        boxShadow: `inset 0 2px 4px rgba(255,255,255,0.2)`,
      }} />
    </div>
  );
}

/* ─── Battle Overlay ─── */
function BattleOverlay({ battle, callTool }: { battle: Battle; callTool: (name: string, input: any) => Promise<any> }) {
  const [acting, setActing] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [battle.log.length]);

  const doAction = async (move?: string) => {
    if (acting) return;
    setActing(true);
    try {
      if (move) {
        await callTool("battle.attack", { battleId: battle.id, move });
      } else {
        await callTool("battle.run", { battleId: battle.id });
      }
    } finally {
      setActing(false);
    }
  };

  const lower = battle.creatureName.toLowerCase();
  let emoji = "🐾";
  for (const [key, e] of Object.entries(CREATURE_EMOJI)) {
    if (lower.includes(key)) { emoji = e; break; }
  }

  return (
    <div onClick={(e) => e.stopPropagation()} style={{
      position: "absolute",
      inset: 0,
      background: "rgba(0,0,0,0.8)",
      backdropFilter: "blur(4px)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 100,
    }}>
      <div style={{
        width: 400,
        background: "linear-gradient(180deg, #2a1a0a 0%, #1a0f05 100%)",
        border: "3px solid #8b6914",
        borderRadius: 16,
        padding: 20,
        display: "flex",
        flexDirection: "column",
        gap: 14,
        boxShadow: "0 8px 32px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,200,50,0.1)",
      }}>
        {/* Header */}
        <div style={{
          textAlign: "center", fontSize: 15, fontWeight: 800,
          color: "#fbbf24", textTransform: "uppercase", letterSpacing: 3,
          textShadow: "0 2px 4px rgba(0,0,0,0.5)",
          fontFamily: "'Segoe UI', system-ui, sans-serif",
        }}>
          Wild Encounter!
        </div>

        {/* Creature */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "8px 12px", background: "rgba(239,68,68,0.1)", borderRadius: 10, border: "1px solid rgba(239,68,68,0.2)" }}>
          <div style={{ fontSize: 44, filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.5))" }}>{emoji}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6, color: "#fca5a5", fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
              {battle.creatureName}
            </div>
            <HpBar current={battle.creatureHp} max={battle.creatureMaxHp} color="#ef4444" />
            <div style={{ fontSize: 11, color: "#a87", marginTop: 3, fontFamily: "monospace" }}>
              {battle.creatureHp}/{battle.creatureMaxHp}
            </div>
          </div>
        </div>

        {/* Player */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "8px 12px", background: "rgba(59,130,246,0.1)", borderRadius: 10, border: "1px solid rgba(59,130,246,0.2)" }}>
          <div style={{ fontSize: 44, filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.5))" }}>🧑‍🌾</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6, color: "#93c5fd", fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
              You
            </div>
            <HpBar current={battle.playerHp} max={battle.playerMaxHp} color="#3b82f6" />
            <div style={{ fontSize: 11, color: "#78a", marginTop: 3, fontFamily: "monospace" }}>
              {battle.playerHp}/{battle.playerMaxHp}
            </div>
          </div>
        </div>

        {/* Battle log */}
        <div ref={logRef} style={{
          height: 72,
          overflowY: "auto",
          background: "#0f0a04",
          borderRadius: 8,
          padding: "8px 10px",
          fontSize: 12,
          color: "#d4c4a0",
          lineHeight: 1.7,
          border: "1px solid #3a2a10",
          fontFamily: "'Segoe UI', system-ui, sans-serif",
        }}>
          {battle.log.map((line, i) => (
            <div key={i} style={{ color: i === battle.log.length - 1 ? "#fef3c7" : "#8a7a5a" }}>{line}</div>
          ))}
        </div>

        {/* Actions */}
        {battle.active ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <button onClick={() => doAction("strike")} disabled={acting} style={battleBtn("#2563eb", "#1d4ed8")}>
              ⚔️ Strike
            </button>
            <button onClick={() => doAction("power")} disabled={acting} style={battleBtn("#7c3aed", "#6d28d9")}>
              💥 Power
            </button>
            <button onClick={() => doAction("defend")} disabled={acting} style={battleBtn("#059669", "#047857")}>
              🛡️ Defend
            </button>
            <button onClick={() => doAction()} disabled={acting} style={battleBtn("#6b7280", "#4b5563")}>
              🏃 Run
            </button>
          </div>
        ) : (
          <div style={{ textAlign: "center", padding: "8px 0" }}>
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 6, color: battle.playerHp > 0 ? "#4ade80" : "#f87171", textShadow: "0 2px 4px rgba(0,0,0,0.5)" }}>
              {battle.playerHp > 0 ? "Victory!" : "Defeated..."}
            </div>
            <div style={{ fontSize: 11, color: "#8a7a5a" }}>
              Click the world to continue exploring.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function battleBtn(bg: string, hover: string): React.CSSProperties {
  return {
    padding: "10px 0",
    fontSize: 13,
    fontWeight: 700,
    background: bg,
    color: "#fff",
    border: "2px solid rgba(255,255,255,0.15)",
    borderRadius: 8,
    cursor: "pointer",
    fontFamily: "'Segoe UI', system-ui, sans-serif",
    textShadow: "0 1px 2px rgba(0,0,0,0.3)",
    boxShadow: "0 2px 4px rgba(0,0,0,0.3)",
  };
}

/* ─── Toolbar ─── */
function Toolbar({ actorId, entities }: { actorId: string; entities: Entity[] }) {
  const player = entities.find(e => e.id === actorId);
  const creatureCount = entities.filter(e => e.type === "creature").length;
  const treeCount = entities.filter(e => e.type === "tree").length;

  return (
    <div style={{
      position: "absolute",
      bottom: 0,
      left: 0,
      right: 0,
      height: 44,
      background: "linear-gradient(180deg, rgba(42,26,10,0.9) 0%, rgba(26,15,5,0.95) 100%)",
      borderTop: "2px solid #8b6914",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 20,
      padding: "0 16px",
      zIndex: 50,
    }}>
      <ToolbarItem emoji="🧑‍🌾" label={player?.label || "you"} />
      <ToolbarItem emoji="🌳" label={`${treeCount} trees`} />
      <ToolbarItem emoji="🐾" label={`${creatureCount} wild`} />
      <ToolbarItem emoji="❤️" label="100 HP" />
      <ToolbarItem emoji="⭐" label="Lv 1" />
    </div>
  );
}

function ToolbarItem({ emoji, label }: { emoji: string; label: string }) {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 6,
      fontSize: 12,
      color: "#d4c4a0",
      fontFamily: "'Segoe UI', system-ui, sans-serif",
    }}>
      <span style={{ fontSize: 16 }}>{emoji}</span>
      <span style={{ fontWeight: 600 }}>{label}</span>
    </div>
  );
}

/* ─── Main Canvas ─── */
export function Canvas({
  sharedState,
  callTool,
  actorId,
}: {
  sharedState: SandboxState;
  callTool: (name: string, input: any) => Promise<any>;
  actorId: string;
  [key: string]: any;
}) {
  const state = sharedState || { entities: [], messages: [] };
  const entities = state.entities || [];
  const messages = state.messages || [];
  const battles = state.battles || [];
  const displayPositions = useAnimatedEntities(entities);
  const [chatInput, setChatInput] = useState("");
  const chatRef = useRef<HTMLDivElement>(null);

  const activeBattle = battles.find(b => b.playerId === actorId && b.active) || null;

  const handleWorldClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.round(e.clientX - rect.left);
    const y = Math.round(e.clientY - rect.top);
    callTool("sandbox.move", { x, y });
  };

  const handleSay = () => {
    if (!chatInput.trim()) return;
    callTool("sandbox.say", { text: chatInput.trim() });
    setChatInput("");
  };

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        background: "#1a120a",
        color: "#e5dcc8",
        fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
      }}
    >
      {/* World */}
      <div
        onClick={handleWorldClick}
        style={{
          position: "relative",
          width: WORLD_W,
          height: WORLD_H,
          margin: "16px",
          borderRadius: 12,
          overflow: "hidden",
          cursor: "crosshair",
          flexShrink: 0,
          border: "3px solid #5a4020",
          boxShadow: "0 4px 20px rgba(0,0,0,0.4), inset 0 0 60px rgba(0,0,0,0.1)",
        }}
      >
        <GrassBackground />

        {/* Sort entities by Y for depth */}
        {[...entities].sort((a, b) => {
          const ay = (displayPositions[a.id] || a.pos).y;
          const by = (displayPositions[b.id] || b.pos).y;
          return ay - by;
        }).map((e) => (
          <EntityNode key={e.id} entity={e} displayPos={displayPositions[e.id]} />
        ))}

        {entities.length === 0 && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 16,
              color: "#8a7a5a",
              pointerEvents: "none",
              fontWeight: 600,
              textShadow: "0 1px 3px rgba(0,0,0,0.5)",
            }}
          >
            Click anywhere to enter the valley
          </div>
        )}

        {/* Toolbar at bottom of world */}
        <Toolbar actorId={actorId} entities={entities} />

        {/* Battle overlay */}
        {activeBattle && (
          <BattleOverlay battle={activeBattle} callTool={callTool} />
        )}
      </div>

      {/* Chat panel */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          margin: "16px 16px 16px 0",
          minWidth: 0,
          background: "linear-gradient(180deg, #2a1a0a 0%, #1f140a 100%)",
          borderRadius: 12,
          border: "2px solid #5a4020",
          padding: 16,
        }}
      >
        <h2 style={{
          margin: "0 0 12px 0",
          fontSize: 17,
          fontWeight: 800,
          color: "#d4a44a",
          letterSpacing: 1,
          textShadow: "0 1px 2px rgba(0,0,0,0.3)",
          borderBottom: "1px solid #3a2a10",
          paddingBottom: 10,
        }}>
          🏡 The Valley
        </h2>

        {/* Messages */}
        <div
          ref={chatRef}
          style={{
            flex: 1,
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 2,
            paddingRight: 8,
          }}
        >
          {messages.map((msg) => (
            <div
              key={msg.id}
              style={{
                fontSize: 13,
                lineHeight: 1.5,
                padding: "5px 0",
                borderBottom: "1px solid #2a1a0a",
              }}
            >
              <span
                style={{
                  fontWeight: 700,
                  color: msg.actor === "system"
                    ? "#8a7a5a"
                    : msg.actor.includes("-ai-")
                    ? "#c084fc"
                    : "#60a5fa",
                  marginRight: 6,
                }}
              >
                {msg.actor === "system" ? "📜 system" : msg.actor.includes("-ai-") ? "🤖 claude" : `🧑‍🌾 ${msg.actor.split("-")[0]}`}:
              </span>
              <span style={{ color: "#d4c4a0" }}>{msg.text}</span>
            </div>
          ))}
        </div>

        {/* Input */}
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <input
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSay()}
            placeholder="Say something..."
            style={{
              flex: 1,
              padding: "10px 14px",
              fontSize: 13,
              background: "#1a0f05",
              border: "2px solid #5a4020",
              borderRadius: 8,
              color: "#e5dcc8",
              outline: "none",
              fontFamily: "'Segoe UI', system-ui, sans-serif",
            }}
          />
          <button
            onClick={handleSay}
            style={{
              padding: "10px 18px",
              fontSize: 13,
              fontWeight: 700,
              background: "#b45309",
              color: "#fff",
              border: "2px solid #d97706",
              borderRadius: 8,
              cursor: "pointer",
              boxShadow: "0 2px 4px rgba(0,0,0,0.3)",
            }}
          >
            Say
          </button>
        </div>
      </div>
    </div>
  );
}
