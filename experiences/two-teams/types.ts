// ── Types for Two Teams ──────────────────────────────────────────────────────

export interface TeamMember {
  actorId: string;
  joinedAt: number;
}

export interface TeamAction {
  id: string;
  actorId: string;
  team: "left" | "right";
  type: string;
  value: number;
  ts: number;
}

export interface TwoTeamsState {
  phase: "lobby" | "playing" | "finished";
  left: {
    name: string;
    color: string;
    score: number;
    members: TeamMember[];
    energy: number;
  };
  right: {
    name: string;
    color: string;
    score: number;
    members: TeamMember[];
    energy: number;
  };
  actions: TeamAction[];
  roundTimer: number;
  roundNumber: number;
  maxRounds: number;
  winner: "left" | "right" | "tie" | null;
  _chat: any[];
  _bugReports: any[];
}
