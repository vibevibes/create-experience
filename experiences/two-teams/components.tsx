// ── Reusable Components for Two Teams ────────────────────────────────────────

import React from "react";
import type { TeamMember, TeamAction } from "./types";

interface TeamPanelProps {
  side: "left" | "right";
  name: string;
  color: string;
  score: number;
  energy: number;
  members: TeamMember[];
  isMyTeam: boolean;
  hasTeam: boolean;
  onJoin: () => void;
  onAction: (type: "attack" | "defend" | "boost") => void;
  phase: string;
  actions: TeamAction[];
}

export function TeamPanel({
  side, name, color, score, energy, members, isMyTeam, hasTeam, onJoin, onAction, phase, actions,
}: TeamPanelProps) {
  const teamActions = actions.filter((a) => a.team === side).slice(-5);
  return (
    <div style={{
      flex: 1,
      display: "flex",
      flexDirection: "column",
      padding: "24px",
      background: `linear-gradient(180deg, ${color}15 0%, ${color}05 100%)`,
      borderLeft: side === "right" ? "2px solid #333" : "none",
      borderRight: side === "left" ? "2px solid #333" : "none",
    }}>
      <div style={{ textAlign: "center", marginBottom: "20px" }}>
        <h2 style={{ color, margin: 0, fontSize: "28px", fontWeight: 800 }}>{name}</h2>
        <div style={{ color: "#999", fontSize: "13px", marginTop: "4px" }}>
          {members.length} player{members.length !== 1 ? "s" : ""}
        </div>
      </div>

      <div style={{ textAlign: "center", margin: "16px 0" }}>
        <div style={{ fontSize: "56px", fontWeight: 900, color }}>{score}</div>
        <div style={{ color: "#666", fontSize: "12px", textTransform: "uppercase", letterSpacing: "2px" }}>Score</div>
      </div>

      <EnergyBar energy={energy} color={color} />

      {phase === "lobby" && !isMyTeam && (
        <button onClick={onJoin} style={{
          margin: "16px auto", padding: "12px 32px", background: color,
          color: "#fff", border: "none", borderRadius: "8px", cursor: "pointer",
          fontSize: "16px", fontWeight: 700, transition: "transform 0.1s",
        }}>
          {hasTeam ? `Switch to ${name}` : `Join ${name}`}
        </button>
      )}

      {phase === "lobby" && isMyTeam && (
        <div style={{ textAlign: "center", color, fontWeight: 600, margin: "16px 0" }}>
          You're on this team!
        </div>
      )}

      {phase === "playing" && isMyTeam && (
        <div style={{ display: "flex", gap: "8px", justifyContent: "center", margin: "16px 0" }}>
          <ActionButton label="Attack" cost={25} color="#ef4444" onClick={() => onAction("attack")} disabled={energy < 25} />
          <ActionButton label="Defend" cost={10} color="#3b82f6" onClick={() => onAction("defend")} disabled={energy < 10} />
          <ActionButton label="Boost" cost={5} color="#22c55e" onClick={() => onAction("boost")} disabled={energy < 5} />
        </div>
      )}

      <div style={{ flex: 1, overflow: "auto", marginTop: "12px" }}>
        {teamActions.map((a) => (
          <div key={a.id} style={{
            padding: "6px 10px", marginBottom: "4px", borderRadius: "6px",
            background: "#ffffff08", fontSize: "12px", color: "#aaa",
          }}>
            <span style={{ color }}>{a.actorId.split("-")[0]}</span>
            {" "}{a.type} (-{a.value}e)
          </div>
        ))}
      </div>
    </div>
  );
}

function EnergyBar({ energy, color }: { energy: number; color: string }) {
  return (
    <div style={{ margin: "8px 0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "#888", marginBottom: "4px" }}>
        <span>Energy</span>
        <span>{energy}/100</span>
      </div>
      <div style={{ height: "8px", background: "#222", borderRadius: "4px", overflow: "hidden" }}>
        <div style={{
          height: "100%", width: `${energy}%`, background: color,
          borderRadius: "4px", transition: "width 0.3s ease",
        }} />
      </div>
    </div>
  );
}

function ActionButton({ label, cost, color, onClick, disabled }: {
  label: string; cost: number; color: string; onClick: () => void; disabled: boolean;
}) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      padding: "10px 16px", background: disabled ? "#333" : color, color: "#fff",
      border: "none", borderRadius: "6px", cursor: disabled ? "not-allowed" : "pointer",
      fontSize: "13px", fontWeight: 600, opacity: disabled ? 0.5 : 1,
    }}>
      {label}
      <div style={{ fontSize: "10px", opacity: 0.7 }}>{cost}e</div>
    </button>
  );
}
