import React from "react";
import { usePhase, useToolCall, ChatPanel, ReportBug, Stack, Button, Badge } from "@vibevibes/sdk";
import { TileComponent, PlayerStats, InventoryPanel, NarrativeBox, EncounterModal } from "./components";
import { GRID_SIZE, PHASES } from "./types";
import type { DungeonState, Tile } from "./types";

const { useCallback, useMemo } = React;

// ── Canvas ───────────────────────────────────────────────────────────────────

export function Canvas(props: any) {
  const { sharedState, callTool, actorId, participants, ephemeralState, setEphemeral } = props;
  const state = sharedState as DungeonState;
  const { call, loading } = useToolCall(callTool);

  const phase = usePhase(sharedState, callTool, { phases: PHASES });

  const grid: Tile[][] = state.grid || [];
  const player = state.player || { x: 1, y: 1, hp: 100, gold: 0, inventory: [] };

  // Compute tile size to fit the grid
  const tileSize = useMemo(() => {
    const maxWidth = Math.min(typeof window !== "undefined" ? window.innerWidth * 0.6 : 480, 480);
    return Math.floor(maxWidth / GRID_SIZE);
  }, []);

  // Handle tile click (player movement)
  const handleTileClick = useCallback((x: number, y: number) => {
    if (phase.is("exploring") && !loading) {
      const dx = Math.abs(x - player.x);
      const dy = Math.abs(y - player.y);
      if (dx <= 1 && dy <= 1 && !(dx === 0 && dy === 0)) {
        call("player.move", { x, y }).catch(() => {});
      }
    }
  }, [phase, loading, player.x, player.y, call]);

  // Handle item use
  const handleUseItem = useCallback((name: string) => {
    call("player.use_item", { itemName: name }).catch(() => {});
  }, [call]);

  // Handle encounter choice — send as chat so the DM can react
  const handleEncounterChoice = useCallback((choice: string) => {
    call("_chat.send", { message: choice }).catch(() => {});
  }, [call]);

  const handleDismissEncounter = useCallback(() => {
    // Player can dismiss only if encounter is already resolved (no choices left)
    if (state.encounterChoices.length === 0) {
      call("_phase.set", { phase: "exploring" }).catch(() => {});
    }
  }, [call, state.encounterChoices]);

  // ── Intro Screen ──────────────────────────────────────────
  if (phase.is("intro")) {
    return React.createElement("div", {
      style: {
        width: "100vw", height: "100vh", background: "#0a0a14",
        display: "flex", alignItems: "center", justifyContent: "center",
        flexDirection: "column" as const, gap: 20, fontFamily: "system-ui, sans-serif",
      },
    },
      React.createElement("div", {
        style: { fontSize: 32, color: "#b8860b", fontFamily: "'Georgia', serif", fontWeight: 700 },
      }, state.dungeonName),
      React.createElement("div", {
        style: { color: "#94a3b8", fontSize: 14, maxWidth: 400, textAlign: "center" as const, lineHeight: 1.6 },
      }, "A dungeon awaits your exploration. The Dungeon Master watches from the shadows, building the world ahead of you. Click tiles to move. Reveal the darkness. Survive."),
      React.createElement(Button, {
        onClick: () => call("_phase.set", { phase: "exploring" }),
        style: { fontSize: 16, padding: "12px 32px" },
      }, "Enter the Dungeon"),
      React.createElement(ReportBug, { callTool, actorId }),
    );
  }

  // ── Victory / Defeat ──────────────────────────────────────
  if (phase.is("victory") || phase.is("defeat")) {
    const isVictory = phase.is("victory");
    return React.createElement("div", {
      style: {
        width: "100vw", height: "100vh", background: "#0a0a14",
        display: "flex", alignItems: "center", justifyContent: "center",
        flexDirection: "column" as const, gap: 16, fontFamily: "system-ui, sans-serif",
      },
    },
      React.createElement("div", {
        style: { fontSize: 36, color: isVictory ? "#22c55e" : "#ef4444", fontWeight: 700 },
      }, isVictory ? "Victory!" : "Defeated"),
      React.createElement("div", { style: { color: "#94a3b8", fontSize: 14 } },
        isVictory
          ? `You escaped with ${player.gold} gold and ${player.inventory.length} items in ${state.turnCount} turns.`
          : "The dungeon claims another soul...",
      ),
      React.createElement(NarrativeBox, { messages: state.narrative.slice(-5) }),
      React.createElement(ReportBug, { callTool, actorId }),
    );
  }

  // ── Main Exploring/Encounter View ─────────────────────────
  return React.createElement("div", {
    style: {
      width: "100vw", height: "100vh", background: "#0a0a14",
      display: "flex", overflow: "hidden", fontFamily: "system-ui, sans-serif",
    },
  },
    // Left sidebar: stats + inventory + narrative
    React.createElement("div", {
      style: {
        width: 240, padding: 12, display: "flex", flexDirection: "column" as const, gap: 8,
        borderRight: "1px solid #1e1e30", overflowY: "auto" as const,
      },
    },
      React.createElement("div", {
        style: { color: "#b8860b", fontSize: 14, fontWeight: 700, fontFamily: "'Georgia', serif" },
      }, state.dungeonName),
      React.createElement(PlayerStats, { player, phase: phase.current }),
      React.createElement(InventoryPanel, { items: player.inventory, onUse: handleUseItem }),
      React.createElement(Badge, { color: "gray", style: { alignSelf: "flex-start" } }, `Turn ${state.turnCount}`),
    ),

    // Center: dungeon grid
    React.createElement("div", {
      style: {
        flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
        flexDirection: "column" as const, gap: 12,
      },
    },
      React.createElement("div", {
        style: {
          display: "grid",
          gridTemplateColumns: `repeat(${GRID_SIZE}, ${tileSize}px)`,
          gridTemplateRows: `repeat(${GRID_SIZE}, ${tileSize}px)`,
          border: "2px solid #2a2a3a",
          borderRadius: 4,
        },
      },
        ...grid.flatMap((row, y) =>
          row.map((tile, x) =>
            React.createElement(TileComponent, {
              key: `${x}-${y}`,
              tile,
              x,
              y,
              isPlayer: x === player.x && y === player.y,
              tileSize,
              onClick: handleTileClick,
            }),
          ),
        ),
      ),
    ),

    // Right sidebar: narrative log
    React.createElement("div", {
      style: {
        width: 260, padding: 12, display: "flex", flexDirection: "column" as const, gap: 8,
        borderLeft: "1px solid #1e1e30",
      },
    },
      React.createElement("div", {
        style: { color: "#6b6b80", fontSize: 11, fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: "0.05em" },
      }, "Dungeon Log"),
      React.createElement(NarrativeBox, { messages: state.narrative }),
    ),

    // Encounter modal overlay
    phase.is("encounter") && state.encounter
      ? React.createElement(EncounterModal, {
          encounter: state.encounter,
          choices: state.encounterChoices,
          narrative: state.narrative,
          onChoice: handleEncounterChoice,
          onClose: handleDismissEncounter,
        })
      : null,

    // Chat & bug report
    React.createElement(ChatPanel, { sharedState, callTool, actorId, ephemeralState, setEphemeral, participants }),
    React.createElement(ReportBug, { callTool, actorId }),
  );
}
