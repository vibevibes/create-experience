import React from "react";
import type { WorldMeta, RuleStats } from "./types";

// ── WorldHUD ─────────────────────────────────────────────────────────────────

export function WorldHUD({
  worldMeta,
  ruleCount,
  stats,
}: {
  worldMeta: WorldMeta;
  ruleCount: number;
  stats: RuleStats;
}) {
  if (!worldMeta.name && !worldMeta.description && ruleCount === 0) return null;

  return React.createElement("div", {
    style: {
      position: "absolute",
      top: 12,
      left: 12,
      padding: "10px 14px",
      background: "rgba(10, 10, 10, 0.7)",
      backdropFilter: "blur(12px)",
      WebkitBackdropFilter: "blur(12px)",
      borderRadius: 10,
      border: "1px solid rgba(255, 255, 255, 0.08)",
      color: "#e2e2e8",
      fontSize: 12,
      fontFamily: "system-ui, -apple-system, sans-serif",
      lineHeight: 1.5,
      maxWidth: 260,
      pointerEvents: "none",
      zIndex: 100,
    },
  },
    worldMeta.name ? React.createElement("div", {
      style: { fontWeight: 700, fontSize: 14, color: "#fff", marginBottom: 2 },
    }, worldMeta.name) : null,
    worldMeta.description ? React.createElement("div", {
      style: { color: "#94a3b8", fontSize: 11, marginBottom: 6 },
    }, worldMeta.description) : null,
    React.createElement("div", {
      style: { display: "flex", gap: 12, color: "#6b6b80", fontSize: 10, fontVariantNumeric: "tabular-nums" },
    },
      React.createElement("span", null, `${ruleCount} rules`),
      React.createElement("span", null, `tick ${stats.ticksElapsed}`),
      stats.rulesFired > 0 ? React.createElement("span", null, `${stats.nodesAffected} affected`) : null,
    ),
    worldMeta.paused ? React.createElement("div", {
      style: {
        marginTop: 6,
        padding: "2px 8px",
        background: "rgba(239, 68, 68, 0.2)",
        color: "#f87171",
        borderRadius: 4,
        fontSize: 10,
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        display: "inline-block",
      },
    }, "Paused") : null,
  );
}
