// ── Canvas ────────────────────────────────────────────────────────────────────

import React from "react";
import { usePhase, useToolCall, Button, Stack } from "@vibevibes/sdk";
import { PHASES } from "./types";
import type { GameState } from "./types";
import {
  CardComponent,
  HandDisplay,
  BoardDisplay,
  ScoreBoard,
  ActionLog,
} from "./components";

// ── Canvas Component ─────────────────────────────────────────────────────────

export function Canvas(props: any) {
  const { sharedState, callTool, actorId } = props;
  const state = sharedState as GameState;
  const { call, loading } = useToolCall(callTool);

  const phase = usePhase(sharedState, callTool, {
    phases: PHASES,
  });

  // Find this player
  const myPlayer = state.players?.find(
    (p) => p.id === actorId || (!p.isAI && !state.players.some((q) => q.id === actorId)),
  );
  const isMyTurn =
    state.players?.[state.currentPlayerIndex]?.id === actorId ||
    (myPlayer && !myPlayer.isAI && state.players?.[state.currentPlayerIndex]?.id === myPlayer?.id);

  return React.createElement("div", {
    style: {
      width: "100vw", height: "100vh",
      background: "linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)",
      color: "#e2e8f0",
      fontFamily: "system-ui, -apple-system, sans-serif",
      display: "flex", flexDirection: "column" as const,
      overflow: "auto",
    },
  },
    // Header
    React.createElement("div", {
      style: {
        padding: "16px 24px",
        borderBottom: "1px solid rgba(99, 102, 241, 0.2)",
        textAlign: "center" as const,
      },
    },
      React.createElement("h1", {
        style: {
          margin: 0, fontSize: 28, fontWeight: 800,
          background: "linear-gradient(90deg, #818cf8, #c084fc)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          letterSpacing: "-0.02em",
        },
      }, "Vibes"),
      React.createElement("div", {
        style: { color: "#64748b", fontSize: 12, marginTop: 4 },
      }, `Phase: ${phase.current}`),
    ),

    // Main content area
    React.createElement("div", {
      style: {
        flex: 1, padding: "16px 24px", maxWidth: 900,
        margin: "0 auto", width: "100%",
      },
    },
      // Phase: Lobby
      phase.is("lobby") ? React.createElement(LobbyView, {
        state, call, loading, actorId,
      }) : null,

      // Phase: Dealing
      phase.is("dealing") ? React.createElement(DealingView, {
        state, call, loading, actorId,
      }) : null,

      // Phase: Playing
      phase.is("playing") ? React.createElement(PlayingView, {
        state, call, loading, actorId, myPlayer, isMyTurn,
      }) : null,

      // Phase: Scoring
      phase.is("scoring") ? React.createElement(ScoringView, {
        state, call, loading, phase,
      }) : null,

      // Phase: Finished
      phase.is("finished") ? React.createElement(FinishedView, {
        state,
      }) : null,
    ),
  );
}

// ── Phase Views ──────────────────────────────────────────────────────────────

function LobbyView({ state, call, loading, actorId }: any) {
  const alreadyJoined = state.players?.some((p: any) => p.id === actorId);
  return React.createElement(Stack, { gap: "16px", align: "center" },
    React.createElement("div", {
      style: { fontSize: 18, fontWeight: 600, color: "#c7d2fe", marginTop: 24 },
    }, "Waiting for players..."),
    React.createElement("div", { style: { color: "#64748b", fontSize: 14 } },
      `${state.players?.length ?? 0}/2 players joined`,
    ),
    !alreadyJoined
      ? React.createElement(Button, {
          onClick: () => call("game.join", { playerName: "Human", isAI: false }),
          disabled: loading,
        }, "Join Game")
      : null,
    state.players?.length === 2
      ? React.createElement(Button, {
          onClick: () => call("game.start", {}),
          disabled: loading,
          variant: "primary",
        }, "Start Game")
      : null,
    // Show joined players
    ...(state.players ?? []).map((p: any) =>
      React.createElement("div", {
        key: p.id,
        style: { color: "#94a3b8", fontSize: 13 },
      }, `${p.name}${p.isAI ? " (AI)" : ""} - ready`),
    ),
  );
}

function DealingView({ state, call, loading, actorId }: any) {
  const myPlayer = state.players?.find((p: any) => p.id === actorId);
  const hasCards = myPlayer?.hand?.length > 0;

  return React.createElement(Stack, { gap: "16px", align: "center" },
    React.createElement("div", {
      style: { fontSize: 18, fontWeight: 600, color: "#c7d2fe", marginTop: 24 },
    }, "Dealing Phase"),
    React.createElement("div", { style: { color: "#64748b", fontSize: 14 } },
      `Deck: ${state.deck?.length ?? 0} cards remaining`,
    ),
    !hasCards
      ? React.createElement(Button, {
          onClick: () => call("game.draw", { count: 5 }),
          disabled: loading,
        }, "Draw 5 Cards")
      : React.createElement("div", { style: { color: "#22c55e", fontSize: 14 } },
          `You have ${myPlayer.hand.length} cards. Waiting for opponent...`,
        ),
    // If both have drawn, show advance button
    state.players?.every((p: any) => p.hand?.length >= 5)
      ? React.createElement(Button, {
          onClick: () => call("_phase.set", { phase: "playing" }),
          disabled: loading,
          variant: "primary",
        }, "Begin Playing!")
      : null,
    ActionLog({ lastAction: state.lastAction }),
  );
}

function PlayingView({ state, call, loading, actorId, myPlayer, isMyTurn }: any) {
  const opponent = state.players?.find((p: any) => p.id !== actorId && p.id !== myPlayer?.id);

  return React.createElement(Stack, { gap: "12px" },
    ScoreBoard({
      players: state.players ?? [],
      currentPlayerIndex: state.currentPlayerIndex ?? 0,
      round: state.round ?? 1,
      maxRounds: state.maxRounds ?? 3,
    }),
    ActionLog({ lastAction: state.lastAction }),
    BoardDisplay({ cards: state.board ?? [] }),
    // Opponent's hand (face down)
    opponent
      ? HandDisplay({
          cards: opponent.hand ?? [],
          isCurrentTurn: false,
          label: `${opponent.name}'s hand`,
          hidden: true,
        })
      : null,
    // My hand
    myPlayer
      ? HandDisplay({
          cards: myPlayer.hand ?? [],
          onPlayCard: (cardId: string) => call("game.play", { cardId }),
          isCurrentTurn: !!isMyTurn,
          label: "Your hand",
        })
      : null,
    // Action buttons
    React.createElement(Stack, { direction: "row", gap: "8px", justify: "center" },
      React.createElement(Button, {
        onClick: () => call("game.draw", { count: 1 }),
        disabled: loading || !isMyTurn || (state.deck?.length ?? 0) === 0,
        variant: "secondary",
        size: "sm",
      }, "Draw Card"),
      React.createElement(Button, {
        onClick: () => call("game.pass", {}),
        disabled: loading || !isMyTurn,
        variant: "ghost",
        size: "sm",
      }, "Pass Turn"),
    ),
  );
}

function ScoringView({ state, call, loading, phase }: any) {
  return React.createElement(Stack, { gap: "16px", align: "center" },
    React.createElement("div", {
      style: { fontSize: 22, fontWeight: 700, color: "#c7d2fe", marginTop: 24 },
    }, "Round Over!"),
    ScoreBoard({
      players: state.players ?? [],
      currentPlayerIndex: -1,
      round: state.round ?? 1,
      maxRounds: state.maxRounds ?? 3,
    }),
    ActionLog({ lastAction: state.lastAction }),
    React.createElement(Button, {
      onClick: () => call("_phase.set", { phase: "finished" }),
      disabled: loading,
      variant: "primary",
    }, "See Results"),
  );
}

function FinishedView({ state }: any) {
  const sorted = [...(state.players ?? [])].sort((a: any, b: any) => b.score - a.score);
  const winner = sorted[0];

  return React.createElement(Stack, { gap: "16px", align: "center" },
    React.createElement("div", {
      style: {
        fontSize: 32, fontWeight: 800, marginTop: 32,
        background: "linear-gradient(90deg, #fbbf24, #f97316)",
        WebkitBackgroundClip: "text",
        WebkitTextFillColor: "transparent",
      },
    }, `${winner?.name ?? "Nobody"} Wins!`),
    React.createElement("div", {
      style: { color: "#94a3b8", fontSize: 16 },
    }, `Final score: ${winner?.score ?? 0} points`),
    ScoreBoard({
      players: state.players ?? [],
      currentPlayerIndex: -1,
      round: state.round ?? 1,
      maxRounds: state.maxRounds ?? 3,
    }),
  );
}
