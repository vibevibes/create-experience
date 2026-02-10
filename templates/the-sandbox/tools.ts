import { defineTool } from "@vibevibes/sdk";
import { z } from "zod";
import type { SandboxState, Entity, Message, Battle } from "./types";
import { generateId, WORLD_W, WORLD_H } from "./utils";

export const tools = [
  defineTool({
    name: "sandbox.say",
    description: "Say something in the world. Everyone sees it.",
    input_schema: z.object({
      text: z.string().min(1).max(500),
    }),
    handler: (ctx, input) => {
      const state = ctx.state as SandboxState;
      const msg: Message = {
        id: generateId(),
        actor: ctx.actorId,
        text: input.text,
        ts: ctx.timestamp,
      };
      const messages = [...state.messages, msg].slice(-50);
      ctx.setState({ ...state, messages });
      return { said: input.text };
    },
  }),

  defineTool({
    name: "sandbox.move",
    description: "Move your entity to a position in the world.",
    input_schema: z.object({
      x: z.number().min(0).max(WORLD_W),
      y: z.number().min(0).max(WORLD_H),
    }),
    handler: (ctx, input) => {
      const state = ctx.state as SandboxState;
      const target = { x: input.x, y: input.y };
      const entities = state.entities.map((e) =>
        e.id === ctx.actorId ? { ...e, target } : e
      );
      // Auto-create player entity if not present
      if (!entities.find((e) => e.id === ctx.actorId)) {
        entities.push({
          id: ctx.actorId,
          type: ctx.actorId.includes("-ai-") ? "ai" : "player",
          pos: target,
          target,
          label: ctx.actorId.split("-")[0],
        });
      }
      ctx.setState({ ...state, entities });
      return { moved: target };
    },
  }),

  defineTool({
    name: "sandbox.status",
    description: "Set your status (watching, idle, thinking). Shows as an indicator on your entity.",
    input_schema: z.object({
      status: z.enum(["watching", "idle", "thinking"]),
    }),
    handler: (ctx, input) => {
      const state = ctx.state as SandboxState;
      const entities = state.entities.map((e) =>
        e.id === ctx.actorId ? { ...e, status: input.status } : e
      );
      ctx.setState({ ...state, entities });
      return { status: input.status };
    },
  }),

  defineTool({
    name: "sandbox.spawn",
    description: "Place a new entity in the world.",
    input_schema: z.object({
      type: z.string().min(1),
      x: z.number().min(0).max(WORLD_W),
      y: z.number().min(0).max(WORLD_H),
      label: z.string().optional(),
      data: z.record(z.any()).optional(),
    }),
    handler: (ctx, input) => {
      const state = ctx.state as SandboxState;
      const entity: Entity = {
        id: generateId(),
        type: input.type,
        pos: { x: input.x, y: input.y },
        label: input.label,
        data: input.data,
      };
      ctx.setState({ ...state, entities: [...state.entities, entity] });
      return { spawned: entity.id, type: input.type };
    },
  }),

  defineTool({
    name: "sandbox.populate",
    description: "Spawn many entities at once. Each item needs type, x, y, and optional label.",
    input_schema: z.object({
      entities: z.array(z.object({
        type: z.string().min(1),
        x: z.number().min(0).max(WORLD_W),
        y: z.number().min(0).max(WORLD_H),
        label: z.string().optional(),
      })),
    }),
    handler: (ctx, input) => {
      const state = ctx.state as SandboxState;
      const newEntities = input.entities.map((e: any) => ({
        id: generateId(),
        type: e.type,
        pos: { x: e.x, y: e.y },
        label: e.label,
      }));
      ctx.setState({ ...state, entities: [...state.entities, ...newEntities] });
      return { spawned: newEntities.length };
    },
  }),

  defineTool({
    name: "sandbox.tick",
    description: "Advance the world simulation. Creatures wander to random nearby positions.",
    input_schema: z.object({}),
    handler: (ctx) => {
      const state = ctx.state as SandboxState;
      const WANDER_RANGE = 80;
      let moved = 0;
      const entities = state.entities.map((e) => {
        if (e.type !== "creature") return e;
        // Snap pos to previous target (creature walked there by now)
        const base = e.target || e.pos;
        const dx = (Math.random() - 0.5) * WANDER_RANGE * 2;
        const dy = (Math.random() - 0.5) * WANDER_RANGE * 2;
        const nx = Math.max(10, Math.min(WORLD_W - 10, base.x + dx));
        const ny = Math.max(10, Math.min(WORLD_H - 10, base.y + dy));
        moved++;
        return { ...e, pos: base, target: { x: Math.round(nx), y: Math.round(ny) } };
      });
      ctx.setState({ ...state, entities });
      // Proximity battle detection: if a player is within 40px of a creature, start a battle
      const BATTLE_RANGE = 40;
      const battles = [...(state.battles || [])];
      const activeBattlePlayerIds = new Set(battles.filter(b => b.active).map(b => b.playerId));
      const activeBattleCreatureIds = new Set(battles.filter(b => b.active).map(b => b.creatureId));

      for (const player of entities.filter(e => e.type === "player")) {
        if (activeBattlePlayerIds.has(player.id)) continue; // already in battle
        const playerPos = player.target || player.pos;
        for (const creature of entities.filter(e => e.type === "creature")) {
          if (activeBattleCreatureIds.has(creature.id)) continue;
          const creaturePos = creature.target || creature.pos;
          const dx = playerPos.x - creaturePos.x;
          const dy = playerPos.y - creaturePos.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < BATTLE_RANGE) {
            const creatureName = creature.label || "Wild Creature";
            battles.push({
              id: generateId(),
              playerId: player.id,
              creatureId: creature.id,
              creatureName,
              playerHp: 100,
              creatureHp: 60 + Math.floor(Math.random() * 40),
              playerMaxHp: 100,
              creatureMaxHp: 100,
              log: [`A wild ${creatureName} appeared!`],
              active: true,
            });
            break;
          }
        }
      }

      ctx.setState({ ...state, entities, battles });
      return { ticked: true, creaturesMoved: moved, battlesStarted: battles.length - (state.battles || []).length };
    },
  }),

  defineTool({
    name: "battle.attack",
    description: "Attack the creature in your active battle. Deals random damage, creature strikes back.",
    input_schema: z.object({
      battleId: z.string().describe("ID of the battle"),
      move: z.enum(["strike", "power", "defend"]).default("strike").describe("Attack type: strike (balanced), power (high risk/reward), defend (reduce incoming damage)"),
    }),
    handler: (ctx, input) => {
      const state = ctx.state as SandboxState;
      const battles = [...(state.battles || [])];
      const idx = battles.findIndex(b => b.id === input.battleId && b.active);
      if (idx === -1) return { error: "No active battle found" };

      const battle = { ...battles[idx], log: [...battles[idx].log] };

      // Player attack
      let playerDmg = 0;
      let creatureDmg = 0;
      if (input.move === "strike") {
        playerDmg = 10 + Math.floor(Math.random() * 10);
        creatureDmg = 8 + Math.floor(Math.random() * 12);
      } else if (input.move === "power") {
        playerDmg = Math.random() > 0.3 ? 20 + Math.floor(Math.random() * 15) : 0;
        creatureDmg = 10 + Math.floor(Math.random() * 15);
        if (playerDmg === 0) battle.log.push("Your power attack missed!");
      } else {
        playerDmg = 5 + Math.floor(Math.random() * 5);
        creatureDmg = Math.floor((5 + Math.random() * 10) * 0.5);
      }

      if (playerDmg > 0) {
        battle.creatureHp = Math.max(0, battle.creatureHp - playerDmg);
        battle.log.push(`You used ${input.move}! Dealt ${playerDmg} damage.`);
      }

      if (battle.creatureHp <= 0) {
        battle.log.push(`${battle.creatureName} fainted! You win!`);
        battle.active = false;
        // Remove the creature from the world
        const entities = state.entities.filter(e => e.id !== battle.creatureId);
        battles[idx] = battle;
        ctx.setState({ ...state, entities, battles });
        return { result: "victory", playerHp: battle.playerHp, creatureHp: 0 };
      }

      // Creature attacks back
      battle.playerHp = Math.max(0, battle.playerHp - creatureDmg);
      battle.log.push(`${battle.creatureName} attacks! Dealt ${creatureDmg} damage.`);

      if (battle.playerHp <= 0) {
        battle.log.push("You fainted! The creature escapes...");
        battle.active = false;
      }

      battles[idx] = battle;
      ctx.setState({ ...state, battles });
      return { result: battle.active ? "continue" : "defeat", playerHp: battle.playerHp, creatureHp: battle.creatureHp };
    },
  }),

  defineTool({
    name: "battle.run",
    description: "Flee from the current battle. 70% chance to escape.",
    input_schema: z.object({
      battleId: z.string().describe("ID of the battle"),
    }),
    handler: (ctx, input) => {
      const state = ctx.state as SandboxState;
      const battles = [...(state.battles || [])];
      const idx = battles.findIndex(b => b.id === input.battleId && b.active);
      if (idx === -1) return { error: "No active battle found" };

      const battle = { ...battles[idx], log: [...battles[idx].log] };

      if (Math.random() < 0.7) {
        battle.log.push("Got away safely!");
        battle.active = false;
        battles[idx] = battle;
        ctx.setState({ ...state, battles });
        return { escaped: true };
      } else {
        // Failed to run, creature gets a free hit
        const dmg = 10 + Math.floor(Math.random() * 10);
        battle.playerHp = Math.max(0, battle.playerHp - dmg);
        battle.log.push(`Couldn't escape! ${battle.creatureName} attacks for ${dmg} damage.`);
        if (battle.playerHp <= 0) {
          battle.log.push("You fainted!");
          battle.active = false;
        }
        battles[idx] = battle;
        ctx.setState({ ...state, battles });
        return { escaped: false, playerHp: battle.playerHp };
      }
    },
  }),
];
