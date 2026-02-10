import React from "react";
import { Badge, Button, Card, Stack, Modal } from "@vibevibes/sdk";
import type { Tile, Player, Item } from "./types";
import { TILE_COLORS, TILE_ICONS, GRID_SIZE } from "./types";

// ── TileComponent ────────────────────────────────────────────────────────────

export function TileComponent({
  tile,
  x,
  y,
  isPlayer,
  tileSize,
  onClick,
}: {
  tile: Tile;
  x: number;
  y: number;
  isPlayer: boolean;
  tileSize: number;
  onClick: (x: number, y: number) => void;
}) {
  if (!tile.revealed) {
    return React.createElement("div", {
      style: {
        width: tileSize,
        height: tileSize,
        background: "#0a0a14",
        border: "1px solid #0f0f1a",
        boxSizing: "border-box" as const,
      },
    });
  }

  const bg = isPlayer ? "#4a2fd4" : TILE_COLORS[tile.type];
  const icon = isPlayer ? "\u{1F9D9}" : tile.entity ? "\u{1F47E}" : TILE_ICONS[tile.type];
  const canClick = tile.type !== "wall";

  return React.createElement("div", {
    onClick: canClick ? () => onClick(x, y) : undefined,
    style: {
      width: tileSize,
      height: tileSize,
      background: bg,
      border: `1px solid ${isPlayer ? "#7c5df8" : "#1e1e30"}`,
      boxSizing: "border-box" as const,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: tileSize * 0.45,
      cursor: canClick ? "pointer" : "default",
      transition: "background 0.15s",
      position: "relative" as const,
    },
  }, icon);
}

// ── PlayerStats ──────────────────────────────────────────────────────────────

export function PlayerStats({ player, phase }: { player: Player; phase: string }) {
  const hpColor = player.hp > 60 ? "#22c55e" : player.hp > 30 ? "#eab308" : "#ef4444";
  const hpPct = `${player.hp}%`;

  return React.createElement(Card, {
    style: {
      background: "rgba(10, 10, 20, 0.9)",
      border: "1px solid #2a2a3a",
      padding: "12px",
      minWidth: 200,
    },
  },
    React.createElement(Stack, { gap: "8px" },
      React.createElement("div", {
        style: { color: "#e2e2e8", fontSize: 13, fontWeight: 600 },
      }, "Adventurer"),
      // HP bar
      React.createElement("div", { style: { fontSize: 11, color: "#94a3b8" } }, `HP: ${player.hp}/100`),
      React.createElement("div", {
        style: {
          width: "100%",
          height: 8,
          background: "#1a1a2e",
          borderRadius: 4,
          overflow: "hidden",
        },
      },
        React.createElement("div", {
          style: {
            width: hpPct,
            height: "100%",
            background: hpColor,
            borderRadius: 4,
            transition: "width 0.3s",
          },
        }),
      ),
      // Gold
      React.createElement(Stack, { direction: "row", gap: "12px" },
        React.createElement(Badge, { color: "yellow" }, `${player.gold} Gold`),
        React.createElement(Badge, { color: "purple" }, phase),
      ),
    ),
  );
}

// ── InventoryPanel ───────────────────────────────────────────────────────────

export function InventoryPanel({
  items,
  onUse,
}: {
  items: Item[];
  onUse: (name: string) => void;
}) {
  if (items.length === 0) {
    return React.createElement("div", {
      style: { color: "#4a4a5a", fontSize: 12, padding: 8 },
    }, "Inventory empty");
  }

  return React.createElement(Stack, { gap: "4px" },
    React.createElement("div", {
      style: { color: "#94a3b8", fontSize: 11, fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: "0.05em" },
    }, "Inventory"),
    ...items.map((item, i) =>
      React.createElement(Stack, {
        key: `${item.name}-${i}`,
        direction: "row",
        gap: "8px",
        align: "center",
        style: {
          padding: "4px 8px",
          background: "rgba(30, 30, 50, 0.6)",
          borderRadius: 6,
          border: "1px solid #2a2a3a",
        },
      },
        React.createElement("div", { style: { flex: 1 } },
          React.createElement("div", { style: { color: "#e2e2e8", fontSize: 12, fontWeight: 500 } }, item.name),
          React.createElement("div", { style: { color: "#6b6b80", fontSize: 10 } }, item.description),
        ),
        React.createElement(Button, {
          size: "sm",
          variant: "ghost",
          onClick: () => onUse(item.name),
          style: { color: "#60a5fa", fontSize: 10, padding: "2px 6px" },
        }, "Use"),
      ),
    ),
  );
}

// ── NarrativeBox ─────────────────────────────────────────────────────────────

export function NarrativeBox({ messages }: { messages: string[] }) {
  const listRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages.length]);

  return React.createElement("div", {
    ref: listRef,
    style: {
      maxHeight: 180,
      overflowY: "auto" as const,
      padding: "8px 10px",
      background: "rgba(10, 10, 20, 0.9)",
      border: "1px solid #2a2a3a",
      borderRadius: 8,
      fontFamily: "'Georgia', serif",
    },
  },
    messages.length === 0
      ? React.createElement("div", {
          style: { color: "#4a4a5a", fontSize: 12, fontStyle: "italic" },
        }, "The dungeon awaits...")
      : messages.map((msg, i) =>
          React.createElement("div", {
            key: i,
            style: {
              color: "#c4b5a0",
              fontSize: 12,
              lineHeight: 1.6,
              marginBottom: 4,
              borderLeft: "2px solid #4a3520",
              paddingLeft: 8,
            },
          }, msg),
        ),
  );
}

// ── EncounterModal ───────────────────────────────────────────────────────────

export function EncounterModal({
  encounter,
  choices,
  narrative,
  onChoice,
  onClose,
}: {
  encounter: string;
  choices: string[];
  narrative: string[];
  onChoice: (choice: string) => void;
  onClose: () => void;
}) {
  const lastNarrative = narrative.length > 0 ? narrative[narrative.length - 1] : "";

  return React.createElement(Modal, {
    open: true,
    onClose,
    title: `Encounter: ${encounter}`,
    style: {
      background: "#1a1a2e",
      border: "1px solid #4a3520",
      color: "#e2e2e8",
    },
  },
    React.createElement(Stack, { gap: "12px" },
      lastNarrative ? React.createElement("div", {
        style: {
          color: "#c4b5a0",
          fontSize: 13,
          fontFamily: "'Georgia', serif",
          lineHeight: 1.6,
          padding: "8px 12px",
          background: "rgba(0,0,0,0.3)",
          borderRadius: 6,
          borderLeft: "3px solid #b8860b",
        },
      }, lastNarrative) : null,
      choices.length > 0
        ? React.createElement(Stack, { gap: "6px" },
            React.createElement("div", {
              style: { color: "#94a3b8", fontSize: 11, fontWeight: 600 },
            }, "What do you do?"),
            ...choices.map((choice, i) =>
              React.createElement(Button, {
                key: i,
                variant: "secondary",
                onClick: () => onChoice(choice),
                style: {
                  background: "#2a2a3a",
                  color: "#e2e2e8",
                  border: "1px solid #3a3a4a",
                  textAlign: "left" as const,
                  justifyContent: "flex-start",
                },
              }, choice),
            ),
          )
        : React.createElement("div", {
            style: { color: "#6b6b80", fontSize: 12, fontStyle: "italic" },
          }, "The dungeon master is considering your fate..."),
    ),
  );
}
