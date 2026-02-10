import { defineTest } from "@vibevibes/sdk";
import { GRID_SIZE } from "./types";
import type { Tile } from "./types";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeGrid(): Tile[][] {
  const grid: Tile[][] = [];
  for (let y = 0; y < GRID_SIZE; y++) {
    const row: Tile[] = [];
    for (let x = 0; x < GRID_SIZE; x++) {
      row.push({ type: "floor", revealed: false });
    }
    grid.push(row);
  }
  // Reveal starting area
  grid[1][1] = { type: "floor", revealed: true };
  return grid;
}

function baseState() {
  return {
    phase: "exploring",
    grid: makeGrid(),
    player: { x: 1, y: 1, hp: 100, gold: 0, inventory: [] },
    narrative: [],
    encounter: undefined,
    encounterChoices: [],
    dungeonName: "Test Dungeon",
    turnCount: 0,
    _chat: [],
    _bugReports: [],
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

export const tests = [
  defineTest({
    name: "player.move moves to adjacent floor tile",
    run: async ({ tool, ctx, expect }) => {
      const move = tool("player.move");
      const context = ctx({ state: baseState() });
      await move.handler(context, { x: 2, y: 1 });
      const s = context.getState();
      expect(s.player.x).toBe(2);
      expect(s.player.y).toBe(1);
      expect(s.turnCount).toBe(1);
    },
  }),

  defineTest({
    name: "player.move rejects non-adjacent tile",
    run: async ({ tool, ctx, expect }) => {
      const move = tool("player.move");
      const context = ctx({ state: baseState() });
      let threw = false;
      try {
        await move.handler(context, { x: 5, y: 5 });
      } catch {
        threw = true;
      }
      expect(threw).toBe(true);
    },
  }),

  defineTest({
    name: "player.move rejects wall tile",
    run: async ({ tool, ctx, expect }) => {
      const move = tool("player.move");
      const state = baseState();
      state.grid[1][2] = { type: "wall", revealed: true };
      const context = ctx({ state });
      let threw = false;
      try {
        await move.handler(context, { x: 2, y: 1 });
      } catch {
        threw = true;
      }
      expect(threw).toBe(true);
    },
  }),

  defineTest({
    name: "player.move reveals adjacent tiles (fog of war)",
    run: async ({ tool, ctx, expect }) => {
      const move = tool("player.move");
      const context = ctx({ state: baseState() });
      await move.handler(context, { x: 2, y: 1 });
      const s = context.getState();
      // Tiles around (2,1) should be revealed
      expect(s.grid[0][1].revealed).toBe(true);
      expect(s.grid[0][2].revealed).toBe(true);
      expect(s.grid[1][1].revealed).toBe(true);
      expect(s.grid[1][2].revealed).toBe(true);
      expect(s.grid[1][3].revealed).toBe(true);
      expect(s.grid[2][1].revealed).toBe(true);
      expect(s.grid[2][2].revealed).toBe(true);
    },
  }),

  defineTest({
    name: "player.move triggers encounter on entity tile",
    run: async ({ tool, ctx, expect }) => {
      const move = tool("player.move");
      const state = baseState();
      state.grid[1][2] = { type: "floor", revealed: false, entity: "Goblin" };
      const context = ctx({ state });
      await move.handler(context, { x: 2, y: 1 });
      const s = context.getState();
      expect(s.phase).toBe("encounter");
      expect(s.encounter).toBe("Goblin");
    },
  }),

  defineTest({
    name: "player.move on trap reduces HP",
    run: async ({ tool, ctx, expect }) => {
      const move = tool("player.move");
      const state = baseState();
      state.grid[1][2] = { type: "trap", revealed: false };
      const context = ctx({ state });
      await move.handler(context, { x: 2, y: 1 });
      const s = context.getState();
      expect(s.player.hp).toBe(90);
    },
  }),

  defineTest({
    name: "player.move to exit triggers victory",
    run: async ({ tool, ctx, expect }) => {
      const move = tool("player.move");
      const state = baseState();
      state.grid[1][2] = { type: "exit", revealed: false };
      const context = ctx({ state });
      await move.handler(context, { x: 2, y: 1 });
      const s = context.getState();
      expect(s.phase).toBe("victory");
    },
  }),

  defineTest({
    name: "dungeon.place_tiles places tiles on the grid",
    run: async ({ tool, ctx, expect }) => {
      const place = tool("dungeon.place_tiles");
      const context = ctx({ state: baseState() });
      await place.handler(context, {
        tiles: [
          { x: 3, y: 3, type: "floor", revealed: false },
          { x: 4, y: 3, type: "wall", revealed: false },
          { x: 5, y: 3, type: "chest", revealed: false },
        ],
      });
      const s = context.getState();
      expect(s.grid[3][3].type).toBe("floor");
      expect(s.grid[3][4].type).toBe("wall");
      expect(s.grid[3][5].type).toBe("chest");
    },
  }),

  defineTest({
    name: "dungeon.add_entity places an entity on a tile",
    run: async ({ tool, ctx, expect }) => {
      const addEntity = tool("dungeon.add_entity");
      const context = ctx({ state: baseState() });
      await addEntity.handler(context, { x: 3, y: 3, entity: "Skeleton Warrior" });
      const s = context.getState();
      expect(s.grid[3][3].entity).toBe("Skeleton Warrior");
    },
  }),

  defineTest({
    name: "dungeon.narrate adds message and sets choices",
    run: async ({ tool, ctx, expect }) => {
      const narrate = tool("dungeon.narrate");
      const context = ctx({ state: baseState() });
      await narrate.handler(context, {
        message: "A shadow stirs in the darkness.",
        choices: ["Attack", "Flee", "Hide"],
        dungeonName: "The Shadow Crypts",
      });
      const s = context.getState();
      expect(s.narrative.length).toBe(1);
      expect(s.narrative[0]).toBe("A shadow stirs in the darkness.");
      expect(s.encounterChoices.length).toBe(3);
      expect(s.dungeonName).toBe("The Shadow Crypts");
    },
  }),

  defineTest({
    name: "player.pickup adds item and gold",
    run: async ({ tool, ctx, expect }) => {
      const pickup = tool("player.pickup");
      const state = baseState();
      state.phase = "encounter";
      state.encounter = "Chest";
      const context = ctx({ state });
      await pickup.handler(context, {
        item: { name: "Healing Potion", effect: "heal", description: "Restores 25 HP" },
        gold: 50,
        hpChange: 10,
      });
      const s = context.getState();
      expect(s.player.inventory.length).toBe(1);
      expect(s.player.inventory[0].name).toBe("Healing Potion");
      expect(s.player.gold).toBe(50);
      expect(s.player.hp).toBe(100); // capped at 100
      expect(s.phase).toBe("encounter"); // pickup clears encounter
      expect(s.encounter).toBeFalsy();
    },
  }),
];
