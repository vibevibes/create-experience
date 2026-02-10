// ── Types ────────────────────────────────────────────────────────────────────

export type WorldMeta = {
  name: string;
  description: string;
  paused: boolean;
  tickSpeed: number;
};

export type RoomEntry = {
  roomId: string;
  url: string;
};

export type SandboxState = {
  _scene: any;
  _rules: any[];
  _worldMeta: WorldMeta;
  _rooms: Record<string, RoomEntry>;
  _chat: any[];
  _bugReports: any[];
};

export type RuleStats = {
  rulesEvaluated: number;
  rulesFired: number;
  nodesAffected: number;
  ticksElapsed: number;
};
