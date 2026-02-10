import React from "react";
import {
  Button,
  Input,
  Dropdown,
  Stack,
  Badge,
  Modal,
  ChatPanel,
  ReportBug,
  useToolCall,
  useParticipants,
} from "@vibevibes/sdk";
import {
  PanelWrapper,
  MetricPanel,
  ChartPanel,
  ListPanel,
  NotePanel,
} from "./components";
import type { Panel, DataPoint } from "./types";

const { useState, useCallback } = React;

// ── Canvas ──────────────────────────────────────────────────────────────────

export function Canvas(props: any) {
  const {
    sharedState,
    callTool,
    actorId,
    participants,
    ephemeralState,
    setEphemeral,
  } = props;

  const { call, loading } = useToolCall(callTool);
  const parsedParticipants = useParticipants(participants);

  const panels: Panel[] = sharedState.panels || [];
  const dataPoints: DataPoint[] = sharedState.dataPoints || [];
  const categories: string[] = sharedState.categories || [];

  // ── Add Panel Modal ───────────────────────────────────────
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newType, setNewType] = useState("metric");

  // ── Add Data Modal ────────────────────────────────────────
  const [showAddData, setShowAddData] = useState(false);
  const [dataLabel, setDataLabel] = useState("");
  const [dataValue, setDataValue] = useState("");
  const [dataCategory, setDataCategory] = useState("general");

  const handleAddPanel = useCallback(async () => {
    if (!newTitle.trim()) return;
    const col = panels.length % 3;
    const row = Math.floor(panels.length / 3);
    await call("panel.add", {
      title: newTitle,
      type: newType,
      position: { x: col * 320, y: row * 240 },
      size: { w: 300, h: 200 },
    });
    setNewTitle("");
    setShowAddPanel(false);
  }, [newTitle, newType, panels.length, call]);

  const handleAddData = useCallback(async () => {
    if (!dataLabel.trim() || !dataValue.trim()) return;
    await call("data.add", {
      label: dataLabel,
      value: parseFloat(dataValue),
      category: dataCategory,
    });
    setDataLabel("");
    setDataValue("");
  }, [dataLabel, dataValue, dataCategory, call]);

  const handleRemovePanel = useCallback(async (id: string) => {
    await call("panel.remove", { id });
  }, [call]);

  // ── Render panels ─────────────────────────────────────────
  const renderPanelBody = (panel: Panel) => {
    switch (panel.type) {
      case "metric":
        return React.createElement(MetricPanel, { panel });
      case "chart":
        return React.createElement(ChartPanel, { panel, dataPoints });
      case "list":
        return React.createElement(ListPanel, { panel });
      case "note":
        return React.createElement(NotePanel, { panel });
      default:
        return null;
    }
  };

  // ── Participant badges ────────────────────────────────────
  const participantBadges = parsedParticipants.map((p) =>
    React.createElement(Badge, {
      key: p.id,
      color: p.type === "ai" ? "purple" : "blue",
      style: { fontSize: 10 },
    }, `${p.username} (${p.type})`)
  );

  return React.createElement("div", {
    style: {
      width: "100vw",
      height: "100vh",
      background: "#0e0e1a",
      color: "#e2e2e8",
      fontFamily: "system-ui, -apple-system, sans-serif",
      display: "flex",
      flexDirection: "column" as const,
      overflow: "hidden",
    },
  },
    // ── Top Bar ──────────────────────────────────────────────
    React.createElement("div", {
      style: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "12px 20px",
        borderBottom: "1px solid #1e1e2e",
        background: "#111118",
        flexShrink: 0,
      },
    },
      React.createElement(Stack, { direction: "row", gap: "12px", align: "center" },
        React.createElement("span", {
          style: { fontSize: 16, fontWeight: 700, color: "#fff" },
        }, "Dashboard"),
        React.createElement(Badge, { color: "gray", style: { fontSize: 10 } },
          `${panels.length} panels`
        ),
        React.createElement(Badge, { color: "gray", style: { fontSize: 10 } },
          `${dataPoints.length} data points`
        ),
      ),
      React.createElement(Stack, { direction: "row", gap: "8px", align: "center" },
        ...participantBadges,
        React.createElement(Button, {
          onClick: () => setShowAddData(true),
          variant: "secondary",
          size: "sm",
          style: { background: "#1e293b", color: "#94a3b8", border: "1px solid #334155" },
        }, "+ Data"),
        React.createElement(Button, {
          onClick: () => setShowAddPanel(true),
          size: "sm",
        }, "+ Panel"),
      ),
    ),

    // ── Panel Grid ───────────────────────────────────────────
    React.createElement("div", {
      style: {
        flex: 1,
        overflow: "auto",
        padding: 20,
        display: "flex",
        flexWrap: "wrap" as const,
        gap: 16,
        alignContent: "flex-start",
      },
    },
      panels.length === 0
        ? React.createElement("div", {
            style: {
              width: "100%",
              textAlign: "center" as const,
              padding: "80px 0",
              color: "#4a4a5a",
              fontSize: 15,
            },
          },
            React.createElement("div", {
              style: { fontSize: 40, marginBottom: 12, opacity: 0.3 },
            }, "//"),
            "No panels yet. Add a panel or let the AI analyst create one.",
          )
        : panels.map((panel) =>
            React.createElement(PanelWrapper, {
              key: panel.id,
              panel,
              onRemove: handleRemovePanel,
            }, renderPanelBody(panel))
          ),
    ),

    // ── Add Panel Modal ──────────────────────────────────────
    React.createElement(Modal, {
      open: showAddPanel,
      onClose: () => setShowAddPanel(false),
      title: "Add Panel",
      style: { background: "#1e1e2e", color: "#e2e2e8" },
    },
      React.createElement(Stack, { gap: "12px" },
        React.createElement(Input, {
          value: newTitle,
          onChange: setNewTitle,
          placeholder: "Panel title",
          style: { background: "#0e0e1a", color: "#fff", border: "1px solid #334155" },
        }),
        React.createElement(Dropdown, {
          value: newType,
          onChange: setNewType,
          options: [
            { value: "metric", label: "Metric (single value)" },
            { value: "chart", label: "Chart (bar chart)" },
            { value: "list", label: "List (bullet items)" },
            { value: "note", label: "Note (text insight)" },
          ],
          style: { background: "#0e0e1a", color: "#fff", border: "1px solid #334155" },
        }),
        React.createElement(Button, {
          onClick: handleAddPanel,
          disabled: loading || !newTitle.trim(),
        }, "Create Panel"),
      ),
    ),

    // ── Add Data Modal ───────────────────────────────────────
    React.createElement(Modal, {
      open: showAddData,
      onClose: () => setShowAddData(false),
      title: "Add Data Point",
      style: { background: "#1e1e2e", color: "#e2e2e8" },
    },
      React.createElement(Stack, { gap: "12px" },
        React.createElement(Input, {
          value: dataLabel,
          onChange: setDataLabel,
          placeholder: "Label (e.g. Q1 Revenue)",
          style: { background: "#0e0e1a", color: "#fff", border: "1px solid #334155" },
        }),
        React.createElement(Input, {
          value: dataValue,
          onChange: setDataValue,
          placeholder: "Value (numeric)",
          type: "number",
          style: { background: "#0e0e1a", color: "#fff", border: "1px solid #334155" },
        }),
        React.createElement(Input, {
          value: dataCategory,
          onChange: setDataCategory,
          placeholder: "Category",
          style: { background: "#0e0e1a", color: "#fff", border: "1px solid #334155" },
        }),
        React.createElement(Button, {
          onClick: handleAddData,
          disabled: loading || !dataLabel.trim() || !dataValue.trim(),
        }, "Add Data Point"),
      ),
    ),

    // ── Chat & Bug Report ────────────────────────────────────
    React.createElement(ChatPanel, {
      sharedState,
      callTool,
      actorId,
      ephemeralState,
      setEphemeral,
      participants,
    }),
    React.createElement(ReportBug, { callTool, actorId }),
  );
}
