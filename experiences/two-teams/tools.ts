// ── Tools for Two Teams ──────────────────────────────────────────────────────

import { defineTool, quickTool, createChatTools, createBugReportTools } from "@vibevibes/sdk";
import { z } from "zod";
import { getTeamForActor, generateId, INITIAL_ENERGY, ENERGY_REGEN_PER_ROUND } from "./utils";
import type { TwoTeamsState } from "./types";

const joinTeam = defineTool({
  name: "team.join",
  description: "Join a team (left or right). Each player can only be on one team.",
  input_schema: z.object({
    side: z.enum(["left", "right"]).describe("Which team to join"),
  }),
  handler: async (ctx, input) => {
    const state = ctx.state as TwoTeamsState;
    const existing = getTeamForActor(state, ctx.actorId);
    if (existing === input.side) return { error: `Already on team ${existing}` };

    // Remove from old team if switching
    const updates: any = {};
    if (existing) {
      const oldTeam = { ...state[existing] };
      oldTeam.members = oldTeam.members.filter((m) => m.actorId !== ctx.actorId);
      updates[existing] = oldTeam;
    }

    // Add to new team
    const newTeam = { ...(updates[input.side] || state[input.side]) };
    newTeam.members = [...newTeam.members, { actorId: ctx.actorId, joinedAt: ctx.timestamp }];
    updates[input.side] = newTeam;

    ctx.setState({ ...state, ...updates });
    return { joined: input.side, switched: !!existing, memberCount: newTeam.members.length };
  },
});

const startGame = quickTool(
  "game.start",
  "Start the game. Requires at least 1 player on each team.",
  z.object({}),
  async (ctx) => {
    const state = ctx.state as TwoTeamsState;
    if (state.phase !== "lobby") return { error: "Game already started" };
    if (state.left.members.length === 0 || state.right.members.length === 0) {
      return { error: "Need at least 1 player on each team" };
    }
    ctx.setState({
      ...state,
      phase: "playing",
      roundNumber: 1,
      left: { ...state.left, energy: INITIAL_ENERGY },
      right: { ...state.right, energy: INITIAL_ENERGY },
    });
    return { started: true, round: 1 };
  }
);

const teamAction = defineTool({
  name: "team.action",
  description: "Perform a team action: attack (costs energy, adds score), defend (costs less energy, blocks), or boost (regens energy for team).",
  input_schema: z.object({
    type: z.enum(["attack", "defend", "boost"]).describe("Action type"),
  }),
  handler: async (ctx, input) => {
    const state = ctx.state as TwoTeamsState;
    if (state.phase !== "playing") return { error: "Game not in progress" };

    const side = getTeamForActor(state, ctx.actorId);
    if (!side) return { error: "Not on a team. Use team.join first." };

    const myTeam = { ...state[side] };
    const otherSide = side === "left" ? "right" : "left";
    const otherTeam = { ...state[otherSide] };

    const costs = { attack: 25, defend: 10, boost: 5 };
    const cost = costs[input.type];
    if (myTeam.energy < cost) return { error: `Not enough energy (need ${cost}, have ${myTeam.energy})` };

    myTeam.energy -= cost;

    if (input.type === "attack") {
      const points = 10 + Math.floor(Math.random() * 11);
      myTeam.score += points;
    } else if (input.type === "boost") {
      myTeam.energy = Math.min(myTeam.energy + 20, INITIAL_ENERGY);
    }

    const action = {
      id: generateId(),
      actorId: ctx.actorId,
      team: side,
      type: input.type,
      value: cost,
      ts: ctx.timestamp,
    };

    ctx.setState({
      ...state,
      [side]: myTeam,
      [otherSide]: otherTeam,
      actions: [...state.actions.slice(-20), action],
    });
    return { action: input.type, energy: myTeam.energy, score: myTeam.score };
  },
});

const nextRound = quickTool(
  "game.next_round",
  "Advance to the next round. Both teams regain some energy.",
  z.object({}),
  async (ctx) => {
    const state = ctx.state as TwoTeamsState;
    if (state.phase !== "playing") return { error: "Game not in progress" };

    const newRound = state.roundNumber + 1;
    if (newRound > state.maxRounds) {
      const winner = state.left.score > state.right.score ? "left"
        : state.right.score > state.left.score ? "right" : "tie";
      ctx.setState({ ...state, phase: "finished", winner });
      return { finished: true, winner };
    }

    ctx.setState({
      ...state,
      roundNumber: newRound,
      left: { ...state.left, energy: Math.min(state.left.energy + ENERGY_REGEN_PER_ROUND, INITIAL_ENERGY) },
      right: { ...state.right, energy: Math.min(state.right.energy + ENERGY_REGEN_PER_ROUND, INITIAL_ENERGY) },
    });
    return { round: newRound };
  }
);

const resetGame = quickTool(
  "game.reset",
  "Reset the game back to lobby state.",
  z.object({}),
  async (ctx) => {
    const state = ctx.state as TwoTeamsState;
    ctx.setState({
      ...state,
      phase: "lobby",
      left: { ...state.left, score: 0, energy: INITIAL_ENERGY, members: [] },
      right: { ...state.right, score: 0, energy: INITIAL_ENERGY, members: [] },
      actions: [],
      roundNumber: 0,
      winner: null,
    });
    return { reset: true };
  }
);

export const tools = [
  joinTeam,
  startGame,
  teamAction,
  nextRound,
  resetGame,
  ...createChatTools(z),
  ...createBugReportTools(z),
];
