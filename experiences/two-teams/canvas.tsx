// ── Canvas for Two Teams ─────────────────────────────────────────────────────

import React from "react";
import { ChatPanel, ReportBug } from "@vibevibes/sdk";
import { TeamPanel } from "./components";
import { getTeamForActor } from "./utils";
import type { TwoTeamsState } from "./types";

export function Canvas(props: any) {
  const { sharedState, callTool, actorId } = props;
  const state = sharedState as TwoTeamsState;
  const myTeam = getTeamForActor(state, actorId);

  const handleJoin = (side: "left" | "right") => {
    callTool("team.join", { side });
  };

  const handleAction = (type: "attack" | "defend" | "boost") => {
    callTool("team.action", { type });
  };

  return (
    <div style={{
      width: "100vw", height: "100vh", background: "#0a0a0a",
      display: "flex", flexDirection: "column", fontFamily: "'Inter', system-ui, sans-serif",
      color: "#fff", overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        display: "flex", justifyContent: "center", alignItems: "center",
        padding: "12px", borderBottom: "1px solid #222", gap: "24px",
      }}>
        <span style={{ color: state.left.color, fontWeight: 700 }}>{state.left.name}</span>
        <PhaseIndicator phase={state.phase} round={state.roundNumber} maxRounds={state.maxRounds} />
        <span style={{ color: state.right.color, fontWeight: 700 }}>{state.right.name}</span>
      </div>

      {/* Main split view */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <TeamPanel
          side="left" name={state.left.name} color={state.left.color}
          score={state.left.score} energy={state.left.energy}
          members={state.left.members} isMyTeam={myTeam === "left"} hasTeam={!!myTeam}
          onJoin={() => handleJoin("left")} onAction={handleAction}
          phase={state.phase} actions={state.actions}
        />
        <TeamPanel
          side="right" name={state.right.name} color={state.right.color}
          score={state.right.score} energy={state.right.energy}
          members={state.right.members} isMyTeam={myTeam === "right"} hasTeam={!!myTeam}
          onJoin={() => handleJoin("right")} onAction={handleAction}
          phase={state.phase} actions={state.actions}
        />
      </div>

      {/* Center overlay buttons */}
      {state.phase === "lobby" && state.left.members.length > 0 && state.right.members.length > 0 && (
        <div style={{
          position: "absolute", top: "50%", left: "50%",
          transform: "translate(-50%, -50%)",
        }}>
          <button onClick={() => callTool("game.start", {})} style={{
            padding: "16px 48px", background: "linear-gradient(135deg, #6366f1, #f43f5e)",
            color: "#fff", border: "none", borderRadius: "12px", cursor: "pointer",
            fontSize: "20px", fontWeight: 800, boxShadow: "0 4px 24px rgba(99,102,241,0.4)",
          }}>
            Start Game
          </button>
        </div>
      )}

      {/* Winner banner */}
      {state.phase === "finished" && (
        <div style={{
          position: "absolute", top: "50%", left: "50%",
          transform: "translate(-50%, -50%)",
          background: "#000d", padding: "40px 60px", borderRadius: "16px",
          textAlign: "center", border: "2px solid #444",
          backdropFilter: "blur(10px)",
        }}>
          <div style={{ fontSize: "48px", fontWeight: 900, marginBottom: "8px" }}>
            {state.winner === "tie" ? "It's a Tie!" : `${state[state.winner!].name} Wins!`}
          </div>
          <div style={{
            fontSize: "20px", color: state.winner !== "tie" ? state[state.winner!].color : "#aaa",
            marginBottom: "20px",
          }}>
            {state.left.score} — {state.right.score}
          </div>
          <button onClick={() => callTool("game.reset", {})} style={{
            padding: "12px 32px", background: "#ffffff20", color: "#fff",
            border: "1px solid #555", borderRadius: "8px", cursor: "pointer",
            fontSize: "16px", fontWeight: 600,
          }}>
            Play Again
          </button>
        </div>
      )}

      <ChatPanel callTool={callTool} state={sharedState} actorId={actorId} />
      <ReportBug callTool={callTool} />
    </div>
  );
}

function PhaseIndicator({ phase, round, maxRounds }: {
  phase: string; round: number; maxRounds: number;
}) {
  const label = phase === "lobby" ? "Waiting for players..."
    : phase === "playing" ? `Round ${round} / ${maxRounds}`
    : "Game Over";

  return (
    <div style={{
      padding: "6px 16px", borderRadius: "20px", background: "#ffffff10",
      fontSize: "14px", fontWeight: 600, color: "#ccc",
    }}>
      {label}
    </div>
  );
}
