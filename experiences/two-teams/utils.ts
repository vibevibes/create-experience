// ── Utils & Constants ────────────────────────────────────────────────────────

import type { TwoTeamsState } from "./types";

export const TEAM_COLORS = {
  left: "#6366f1",   // indigo
  right: "#f43f5e",  // rose
} as const;

export const INITIAL_ENERGY = 100;
export const MAX_ROUNDS = 5;
export const ENERGY_REGEN_PER_ROUND = 30;

export function getTeamForActor(
  state: TwoTeamsState,
  actorId: string
): "left" | "right" | null {
  if (state.left.members.some((m) => m.actorId === actorId)) return "left";
  if (state.right.members.some((m) => m.actorId === actorId)) return "right";
  return null;
}

export function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export const initialState: TwoTeamsState = {
  phase: "lobby",
  left: {
    name: "Indigo",
    color: TEAM_COLORS.left,
    score: 0,
    members: [],
    energy: INITIAL_ENERGY,
  },
  right: {
    name: "Rose",
    color: TEAM_COLORS.right,
    score: 0,
    members: [],
    energy: INITIAL_ENERGY,
  },
  actions: [],
  roundTimer: 0,
  roundNumber: 0,
  maxRounds: MAX_ROUNDS,
  winner: null,
  _chat: [],
  _bugReports: [],
};
