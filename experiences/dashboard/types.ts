// ── Types ────────────────────────────────────────────────────────────────────

export type PanelType = "metric" | "chart" | "list" | "note";

export type DataPoint = {
  id: string;
  label: string;
  value: number;
  timestamp: number;
  category: string;
};

export type Panel = {
  id: string;
  title: string;
  type: PanelType;
  data: any;
  position: { x: number; y: number };
  size: { w: number; h: number };
  createdBy: string;
  createdAt: number;
};

export type DashboardState = {
  panels: Panel[];
  dataPoints: DataPoint[];
  categories: string[];
  lastActivity: number;
  _chat: any[];
  _bugReports: any[];
};
