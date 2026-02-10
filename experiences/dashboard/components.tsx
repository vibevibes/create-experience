import React from "react";
import { Badge, Stack } from "@vibevibes/sdk";
import type { Panel, DataPoint } from "./types";

// ── PanelWrapper ────────────────────────────────────────────────────────────

export function PanelWrapper({
  panel,
  onRemove,
  children,
}: {
  panel: Panel;
  onRemove: (id: string) => void;
  children: any;
}) {
  const isAI = panel.createdBy?.includes("ai");
  return React.createElement("div", {
    style: {
      background: "#1a1a2e",
      border: `1px solid ${isAI ? "#6366f1" : "#2a2a4a"}`,
      borderRadius: 12,
      padding: 16,
      width: panel.size.w,
      minHeight: panel.size.h,
      display: "flex",
      flexDirection: "column" as const,
      gap: 8,
      position: "relative" as const,
      boxShadow: isAI
        ? "0 0 12px rgba(99, 102, 241, 0.15)"
        : "0 2px 8px rgba(0,0,0,0.3)",
    },
  },
    // Header
    React.createElement("div", {
      style: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      },
    },
      React.createElement("span", {
        style: {
          fontSize: 14,
          fontWeight: 600,
          color: "#e2e2e8",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap" as const,
          maxWidth: "70%",
        },
      }, panel.title),
      React.createElement(Stack, { direction: "row", gap: "6px", align: "center" },
        React.createElement(Badge, {
          color: panel.type === "metric" ? "blue"
            : panel.type === "chart" ? "green"
            : panel.type === "list" ? "yellow"
            : "purple",
          style: { fontSize: 10 },
        }, panel.type),
        React.createElement("button", {
          onClick: () => onRemove(panel.id),
          style: {
            background: "none",
            border: "none",
            color: "#6b6b80",
            cursor: "pointer",
            fontSize: 14,
            padding: "2px 4px",
          },
        }, "\u2715"),
      ),
    ),
    // Body
    React.createElement("div", {
      style: { flex: 1, overflow: "hidden" },
    }, children),
  );
}

// ── MetricPanel ─────────────────────────────────────────────────────────────

export function MetricPanel({ panel }: { panel: Panel }) {
  const data = panel.data || {};
  const value = data.value ?? "---";
  const unit = data.unit ?? "";
  const delta = data.delta;

  return React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column" as const,
      alignItems: "center",
      justifyContent: "center",
      height: "100%",
      gap: 4,
    },
  },
    React.createElement("span", {
      style: {
        fontSize: 36,
        fontWeight: 700,
        color: "#fff",
        fontVariantNumeric: "tabular-nums",
      },
    }, typeof value === "number" ? value.toLocaleString() : value),
    unit ? React.createElement("span", {
      style: { fontSize: 13, color: "#94a3b8" },
    }, unit) : null,
    delta !== undefined ? React.createElement("span", {
      style: {
        fontSize: 12,
        color: delta > 0 ? "#22c55e" : delta < 0 ? "#ef4444" : "#94a3b8",
        fontWeight: 500,
      },
    }, `${delta > 0 ? "+" : ""}${delta}%`) : null,
  );
}

// ── ChartPanel (inline SVG bar chart) ───────────────────────────────────────

export function ChartPanel({
  panel,
  dataPoints,
}: {
  panel: Panel;
  dataPoints: DataPoint[];
}) {
  const category = panel.data?.category;
  const filtered = category
    ? dataPoints.filter((dp) => dp.category === category)
    : dataPoints;

  const items = filtered.slice(-10);
  if (items.length === 0) {
    return React.createElement("div", {
      style: { color: "#6b6b80", fontSize: 13, textAlign: "center" as const, padding: 24 },
    }, "No data points yet");
  }

  const maxVal = Math.max(...items.map((d) => Math.abs(d.value)), 1);
  const barWidth = Math.max(20, Math.floor((panel.size.w - 60) / items.length) - 4);
  const chartH = panel.size.h - 80;
  const svgW = items.length * (barWidth + 4) + 20;
  const colors = ["#6366f1", "#22d3ee", "#a78bfa", "#f472b6", "#34d399",
    "#fbbf24", "#fb923c", "#f87171", "#60a5fa", "#c084fc"];

  return React.createElement("svg", {
    width: "100%",
    height: chartH,
    viewBox: `0 0 ${svgW} ${chartH}`,
    style: { overflow: "visible" as const },
  },
    // Bars
    ...items.map((dp, i) => {
      const h = Math.max(4, (Math.abs(dp.value) / maxVal) * (chartH - 30));
      return React.createElement("g", { key: dp.id },
        React.createElement("rect", {
          x: 10 + i * (barWidth + 4),
          y: chartH - 20 - h,
          width: barWidth,
          height: h,
          rx: 3,
          fill: colors[i % colors.length],
          opacity: 0.85,
        }),
        React.createElement("text", {
          x: 10 + i * (barWidth + 4) + barWidth / 2,
          y: chartH - 4,
          textAnchor: "middle",
          fill: "#6b6b80",
          fontSize: 9,
        }, dp.label.slice(0, 6)),
        React.createElement("text", {
          x: 10 + i * (barWidth + 4) + barWidth / 2,
          y: chartH - 24 - h,
          textAnchor: "middle",
          fill: "#94a3b8",
          fontSize: 10,
        }, dp.value.toFixed(0)),
      );
    }),
  );
}

// ── ListPanel ───────────────────────────────────────────────────────────────

export function ListPanel({ panel }: { panel: Panel }) {
  const items: string[] = panel.data?.items || [];

  if (items.length === 0) {
    return React.createElement("div", {
      style: { color: "#6b6b80", fontSize: 13, textAlign: "center" as const, padding: 16 },
    }, "Empty list");
  }

  return React.createElement("ul", {
    style: {
      margin: 0,
      padding: "0 0 0 18px",
      listStyle: "disc",
      color: "#c4c4d4",
      fontSize: 13,
      lineHeight: 1.7,
      overflow: "auto" as const,
      maxHeight: panel.size.h - 60,
    },
  },
    ...items.map((item, i) =>
      React.createElement("li", { key: i }, item)
    ),
  );
}

// ── NotePanel ───────────────────────────────────────────────────────────────

export function NotePanel({ panel }: { panel: Panel }) {
  const text = panel.data?.text || panel.data || "";

  return React.createElement("div", {
    style: {
      fontSize: 13,
      lineHeight: 1.6,
      color: "#d4d4e8",
      whiteSpace: "pre-wrap" as const,
      overflow: "auto" as const,
      maxHeight: panel.size.h - 60,
      fontStyle: "italic",
    },
  }, typeof text === "string" ? text : JSON.stringify(text, null, 2));
}
