// ── Components ───────────────────────────────────────────────────────────────

import React from "react";
import { Button, Badge, Stack } from "@vibevibes/sdk";
import type { Card, Player, Suit } from "./types";

// ── Suit Colors & Icons ──────────────────────────────────────────────────────

const SUIT_STYLES: Record<Suit, { color: string; bg: string; icon: string }> = {
  fire:  { color: "#ef4444", bg: "rgba(239, 68, 68, 0.15)", icon: "F" },
  water: { color: "#3b82f6", bg: "rgba(59, 130, 246, 0.15)", icon: "W" },
  earth: { color: "#22c55e", bg: "rgba(34, 197, 94, 0.15)",  icon: "E" },
  air:   { color: "#a855f7", bg: "rgba(168, 85, 247, 0.15)", icon: "A" },
};

const EFFECT_LABELS: Record<string, { label: string; color: string }> = {
  draw:   { label: "DRAW",   color: "#06b6d4" },
  steal:  { label: "STEAL",  color: "#f97316" },
  shield: { label: "SHIELD", color: "#22c55e" },
  double: { label: "DOUBLE", color: "#eab308" },
};

// ── CardComponent ────────────────────────────────────────────────────────────

export function CardComponent({
  card,
  onClick,
  disabled,
  faceDown,
  small,
}: {
  card: Card;
  onClick?: () => void;
  disabled?: boolean;
  faceDown?: boolean;
  small?: boolean;
}) {
  const suit = SUIT_STYLES[card.suit];
  const width = small ? 80 : 120;
  const height = small ? 110 : 160;

  if (faceDown) {
    return React.createElement("div", {
      style: {
        width, height,
        borderRadius: 10,
        background: "linear-gradient(135deg, #1e293b, #334155)",
        border: "2px solid #475569",
        display: "flex", alignItems: "center", justifyContent: "center",
        color: "#64748b", fontSize: small ? 16 : 24, fontWeight: 700,
        fontFamily: "system-ui, sans-serif",
      },
    }, "?");
  }

  return React.createElement("div", {
    onClick: disabled ? undefined : onClick,
    style: {
      width, height,
      borderRadius: 10,
      background: `linear-gradient(135deg, #0f172a, ${suit.bg})`,
      border: `2px solid ${suit.color}`,
      cursor: disabled ? "default" : onClick ? "pointer" : "default",
      opacity: disabled ? 0.5 : 1,
      padding: small ? 6 : 10,
      display: "flex", flexDirection: "column" as const,
      justifyContent: "space-between",
      fontFamily: "system-ui, sans-serif",
      transition: "transform 0.15s, box-shadow 0.15s",
      position: "relative" as const,
      boxShadow: onClick && !disabled ? `0 0 12px ${suit.bg}` : "none",
    },
  },
    // Top: value + suit
    React.createElement("div", {
      style: { display: "flex", justifyContent: "space-between", alignItems: "center" },
    },
      React.createElement("span", {
        style: { color: suit.color, fontSize: small ? 14 : 20, fontWeight: 700 },
      }, card.value),
      React.createElement("span", {
        style: {
          color: suit.color, fontSize: small ? 10 : 12, fontWeight: 600,
          padding: "2px 6px", borderRadius: 4, background: suit.bg,
        },
      }, suit.icon),
    ),
    // Center: name
    React.createElement("div", {
      style: {
        color: "#e2e8f0", fontSize: small ? 10 : 13, fontWeight: 600,
        textAlign: "center" as const, lineHeight: 1.2,
      },
    }, card.name),
    // Bottom: effect badge
    React.createElement("div", {
      style: { display: "flex", justifyContent: "center", minHeight: small ? 16 : 20 },
    },
      card.effect ? React.createElement("span", {
        style: {
          fontSize: small ? 8 : 10, fontWeight: 700, letterSpacing: "0.05em",
          color: EFFECT_LABELS[card.effect].color,
          padding: "1px 6px", borderRadius: 4,
          background: `${EFFECT_LABELS[card.effect].color}22`,
        },
      }, EFFECT_LABELS[card.effect].label) : null,
    ),
  );
}

// ── HandDisplay ──────────────────────────────────────────────────────────────

export function HandDisplay({
  cards,
  onPlayCard,
  isCurrentTurn,
  label,
  hidden,
}: {
  cards: Card[];
  onPlayCard?: (cardId: string) => void;
  isCurrentTurn: boolean;
  label: string;
  hidden?: boolean;
}) {
  return React.createElement("div", {
    style: { marginBottom: 12 },
  },
    React.createElement("div", {
      style: {
        color: "#94a3b8", fontSize: 12, fontWeight: 600,
        marginBottom: 6, textTransform: "uppercase" as const, letterSpacing: "0.05em",
      },
    }, `${label} (${cards.length} cards)`),
    React.createElement("div", {
      style: {
        display: "flex", gap: 8, flexWrap: "wrap" as const,
        padding: 8, borderRadius: 10,
        background: isCurrentTurn ? "rgba(99, 102, 241, 0.1)" : "rgba(15, 23, 42, 0.5)",
        border: isCurrentTurn ? "1px solid rgba(99, 102, 241, 0.3)" : "1px solid rgba(51, 65, 85, 0.3)",
        minHeight: 60,
      },
    },
      cards.length === 0
        ? React.createElement("span", {
            style: { color: "#475569", fontSize: 12, padding: 10 },
          }, "No cards")
        : cards.map((card) =>
            React.createElement(CardComponent, {
              key: card.id,
              card,
              onClick: onPlayCard && isCurrentTurn ? () => onPlayCard(card.id) : undefined,
              disabled: !isCurrentTurn || !onPlayCard,
              faceDown: hidden,
              small: true,
            }),
          ),
    ),
  );
}

// ── BoardDisplay ─────────────────────────────────────────────────────────────

export function BoardDisplay({ cards }: { cards: Card[] }) {
  return React.createElement("div", {
    style: {
      padding: 16, borderRadius: 12,
      background: "rgba(15, 23, 42, 0.6)",
      border: "1px solid rgba(51, 65, 85, 0.4)",
      minHeight: 120,
    },
  },
    React.createElement("div", {
      style: {
        color: "#64748b", fontSize: 11, fontWeight: 600, marginBottom: 8,
        textTransform: "uppercase" as const, letterSpacing: "0.05em",
      },
    }, `Board (${cards.length} cards played)`),
    React.createElement("div", {
      style: { display: "flex", gap: 6, flexWrap: "wrap" as const },
    },
      cards.length === 0
        ? React.createElement("span", {
            style: { color: "#334155", fontSize: 12, fontStyle: "italic" as const },
          }, "No cards played yet")
        : cards.map((card) =>
            React.createElement(CardComponent, {
              key: card.id,
              card,
              small: true,
            }),
          ),
    ),
  );
}

// ── ScoreBoard ───────────────────────────────────────────────────────────────

export function ScoreBoard({
  players,
  currentPlayerIndex,
  round,
  maxRounds,
}: {
  players: Player[];
  currentPlayerIndex: number;
  round: number;
  maxRounds: number;
}) {
  return React.createElement(Stack, {
    direction: "row", gap: "16px", justify: "center",
    style: { marginBottom: 12 },
  },
    ...players.map((player, idx) =>
      React.createElement("div", {
        key: player.id,
        style: {
          padding: "8px 16px", borderRadius: 8,
          background: idx === currentPlayerIndex ? "rgba(99, 102, 241, 0.2)" : "rgba(15, 23, 42, 0.4)",
          border: idx === currentPlayerIndex ? "1px solid #6366f1" : "1px solid #1e293b",
          textAlign: "center" as const, minWidth: 120,
        },
      },
        React.createElement("div", {
          style: { color: "#e2e8f0", fontSize: 14, fontWeight: 600 },
        }, player.name, player.isAI ? " (AI)" : ""),
        React.createElement("div", {
          style: { color: "#6366f1", fontSize: 24, fontWeight: 700 },
        }, player.score),
        player.shielded ? React.createElement(Badge, { color: "green" }, "Shielded") : null,
        idx === currentPlayerIndex ? React.createElement(Badge, { color: "purple" }, "Turn") : null,
      ),
    ),
    React.createElement("div", {
      style: {
        padding: "8px 16px", borderRadius: 8,
        background: "rgba(15, 23, 42, 0.4)", border: "1px solid #1e293b",
        textAlign: "center" as const,
      },
    },
      React.createElement("div", { style: { color: "#64748b", fontSize: 11 } }, "Round"),
      React.createElement("div", { style: { color: "#e2e8f0", fontSize: 18, fontWeight: 700 } }, `${round}/${maxRounds}`),
    ),
  );
}

// ── ActionLog ────────────────────────────────────────────────────────────────

export function ActionLog({ lastAction }: { lastAction: string }) {
  if (!lastAction) return null;
  return React.createElement("div", {
    style: {
      padding: "8px 14px", borderRadius: 8, marginBottom: 12,
      background: "rgba(99, 102, 241, 0.1)", border: "1px solid rgba(99, 102, 241, 0.2)",
      color: "#c7d2fe", fontSize: 13, fontStyle: "italic" as const,
      textAlign: "center" as const,
    },
  }, lastAction);
}
