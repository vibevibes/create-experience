// ── Tests for Two Teams ──────────────────────────────────────────────────────

import { defineTest } from "@vibevibes/sdk";
import { initialState } from "./utils";

export const tests = [
  defineTest({
    name: "team.join adds player to team",
    run: async ({ tool, ctx, expect }) => {
      const join = tool("team.join");
      const c = ctx({ state: { ...initialState }, actorId: "alice-human-1" });
      await join.handler(c, { side: "left" });
      expect(c.getState().left.members.length).toBe(1);
      expect(c.getState().left.members[0].actorId).toBe("alice-human-1");
    },
  }),
  defineTest({
    name: "team.join prevents double join",
    run: async ({ tool, ctx, expect }) => {
      const join = tool("team.join");
      const state = { ...initialState, left: { ...initialState.left, members: [{ actorId: "alice-human-1", joinedAt: 0 }] } };
      const c = ctx({ state, actorId: "alice-human-1" });
      const result = await join.handler(c, { side: "right" });
      expect(result.error).toBe("Already on team left");
    },
  }),
  defineTest({
    name: "game.start requires players on both teams",
    run: async ({ tool, ctx, expect }) => {
      const start = tool("game.start");
      const c = ctx({ state: { ...initialState } });
      const result = await start.handler(c, {});
      expect(result.error).toBe("Need at least 1 player on each team");
    },
  }),
  defineTest({
    name: "team.action costs energy and adds score for attack",
    run: async ({ tool, ctx, expect }) => {
      const action = tool("team.action");
      const state = {
        ...initialState,
        phase: "playing" as const,
        left: { ...initialState.left, members: [{ actorId: "alice-human-1", joinedAt: 0 }] },
      };
      const c = ctx({ state, actorId: "alice-human-1" });
      await action.handler(c, { type: "attack" });
      expect(c.getState().left.energy).toBe(75);
      expect(c.getState().left.score).toBeGreaterThan(0);
    },
  }),
];
