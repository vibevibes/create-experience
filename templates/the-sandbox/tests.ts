import { defineTest } from "@vibevibes/sdk";

// ── Tests ────────────────────────────────────────────────────────────────────

export const tests = [
  defineTest({
    name: "_rules.set creates a rule",
    run: async ({ tool, ctx, expect }) => {
      const rulesSet = tool("_rules.set");
      const context = ctx({ state: { _rules: [] } });
      await rulesSet.handler(context, {
        id: "test-rule",
        name: "Test Rule",
        description: "A test rule",
        enabled: true,
        trigger: "tick",
        condition: { selector: "entityType:test" },
        effect: { type: "transform", dx: 1 },
      });
      expect(context.state._rules).toBeTruthy();
      expect(context.state._rules.length).toBe(1);
      expect(context.state._rules[0].id).toBe("test-rule");
      expect(context.state._rules[0].name).toBe("Test Rule");
      expect(context.state._rules[0].enabled).toBe(true);
    },
  }),
  defineTest({
    name: "_rules.remove deletes a rule",
    run: async ({ tool, ctx, expect }) => {
      const rulesSet = tool("_rules.set");
      const rulesRemove = tool("_rules.remove");
      const context = ctx({ state: { _rules: [] } });

      await rulesSet.handler(context, {
        id: "temp-rule",
        name: "Temp",
        condition: { selector: "*" },
        effect: { type: "transform", dx: 1 },
      });
      expect(context.state._rules.length).toBe(1);

      await rulesRemove.handler(context, { id: "temp-rule" });
      expect(context.state._rules.length).toBe(0);
    },
  }),
  defineTest({
    name: "room.spawn tracks spawned rooms",
    run: async ({ tool, ctx, expect }) => {
      const spawn = tool("room.spawn");
      const context = ctx({ state: { _rooms: {} } });
      // Manually wire spawnRoom mock (test framework ctx doesn't include it)
      (context as any).spawnRoom = async (opts: any) => ({
        roomId: opts.name || "auto-id",
        url: `?room=${opts.name || "auto-id"}`,
      });
      await spawn.handler(context, { name: "test-room" });
      expect(context.state._rooms["test-room"]).toBeTruthy();
      expect(context.state._rooms["test-room"].roomId).toBe("test-room");
      expect(context.state._rooms["test-room"].url).toBe("?room=test-room");
    },
  }),
  defineTest({
    name: "_rules.world sets metadata",
    run: async ({ tool, ctx, expect }) => {
      const world = tool("_rules.world");
      const context = ctx({ state: {} });
      await world.handler(context, {
        name: "Test World",
        description: "A test",
        paused: true,
        tickSpeed: 50,
      });
      expect(context.state._worldMeta.name).toBe("Test World");
      expect(context.state._worldMeta.description).toBe("A test");
      expect(context.state._worldMeta.paused).toBe(true);
      expect(context.state._worldMeta.tickSpeed).toBe(50);
    },
  }),
];
