// ── Tests ────────────────────────────────────────────────────────────────────

import { defineTest } from "@vibevibes/sdk";
import { generateDeck } from "./types";

// ── Test Helpers ─────────────────────────────────────────────────────────────

function lobbyState() {
  return {
    phase: "lobby",
    players: [],
    board: [],
    deck: [],
    currentPlayerIndex: 0,
    round: 1,
    maxRounds: 3,
    lastAction: "",
    winner: "",
  };
}

function playingState() {
  const deck = generateDeck();
  return {
    phase: "playing",
    players: [
      {
        id: "alice-human-1",
        name: "Alice",
        hand: deck.slice(0, 5),
        score: 0,
        isAI: false,
        shielded: false,
        passed: false,
      },
      {
        id: "vex-ai-1",
        name: "Vex",
        hand: deck.slice(5, 10),
        score: 0,
        isAI: true,
        shielded: false,
        passed: false,
      },
    ],
    board: [],
    deck: deck.slice(10),
    currentPlayerIndex: 0,
    round: 1,
    maxRounds: 3,
    lastAction: "",
    winner: "",
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

export const tests = [
  defineTest({
    name: "game.join adds a player to the lobby",
    run: async ({ tool, ctx, expect }) => {
      const join = tool("game.join");
      const context = ctx({ state: lobbyState(), actorId: "alice-human-1" });
      await join.handler(context, { playerName: "Alice", isAI: false });
      const state = context.getState();
      expect(state.players.length).toBe(1);
      expect(state.players[0].name).toBe("Alice");
      expect(state.players[0].isAI).toBe(false);
    },
  }),

  defineTest({
    name: "game.join rejects when game is full",
    run: async ({ tool, ctx, expect }) => {
      const join = tool("game.join");
      const state = lobbyState();
      state.players = [
        { id: "a", name: "A", hand: [], score: 0, isAI: false, shielded: false, passed: false },
        { id: "b", name: "B", hand: [], score: 0, isAI: true, shielded: false, passed: false },
      ];
      const context = ctx({ state, actorId: "c-human-1" });
      const result = await join.handler(context, { playerName: "C", isAI: false });
      expect(result.error).toBe("Game is full (2 players max)");
    },
  }),

  defineTest({
    name: "game.start transitions to dealing with a full deck",
    run: async ({ tool, ctx, expect }) => {
      const start = tool("game.start");
      const state = lobbyState();
      state.players = [
        { id: "a", name: "A", hand: [], score: 0, isAI: false, shielded: false, passed: false },
        { id: "b", name: "B", hand: [], score: 0, isAI: true, shielded: false, passed: false },
      ];
      const context = ctx({ state });
      await start.handler(context, {});
      const newState = context.getState();
      expect(newState.phase).toBe("dealing");
      expect(newState.deck.length).toBe(40);
    },
  }),

  defineTest({
    name: "game.draw draws cards from deck into hand",
    run: async ({ tool, ctx, expect }) => {
      const draw = tool("game.draw");
      const state = playingState();
      const context = ctx({ state, actorId: "alice-human-1" });
      const deckBefore = state.deck.length;
      await draw.handler(context, { count: 3 });
      const newState = context.getState();
      expect(newState.players[0].hand.length).toBe(8); // 5 + 3
      expect(newState.deck.length).toBe(deckBefore - 3);
    },
  }),

  defineTest({
    name: "game.play removes card from hand and adds to board",
    run: async ({ tool, ctx, expect }) => {
      const play = tool("game.play");
      const state = playingState();
      const cardToPlay = state.players[0].hand[0];
      const context = ctx({ state, actorId: "alice-human-1" });
      await play.handler(context, { cardId: cardToPlay.id });
      const newState = context.getState();
      expect(newState.players[0].hand.length).toBe(4);
      expect(newState.board.length).toBe(1);
      expect(newState.board[0].id).toBe(cardToPlay.id);
    },
  }),

  defineTest({
    name: "game.play rejects when not your turn",
    run: async ({ tool, ctx, expect }) => {
      const play = tool("game.play");
      const state = playingState();
      state.currentPlayerIndex = 1; // AI's turn
      const cardId = state.players[0].hand[0].id;
      const context = ctx({ state, actorId: "alice-human-1" });
      const result = await play.handler(context, { cardId });
      expect(result.error).toBe("Not your turn");
    },
  }),

  defineTest({
    name: "game.play adds card value to player score",
    run: async ({ tool, ctx, expect }) => {
      const play = tool("game.play");
      const state = playingState();
      const card = state.players[0].hand[0];
      const context = ctx({ state, actorId: "alice-human-1" });
      await play.handler(context, { cardId: card.id });
      const newState = context.getState();
      expect(newState.players[0].score).toBe(card.value);
    },
  }),

  defineTest({
    name: "game.pass marks player as passed and advances turn",
    run: async ({ tool, ctx, expect }) => {
      const pass = tool("game.pass");
      const state = playingState();
      const context = ctx({ state, actorId: "alice-human-1" });
      await pass.handler(context, {});
      const newState = context.getState();
      expect(newState.players[0].passed).toBe(true);
      expect(newState.currentPlayerIndex).toBe(1);
    },
  }),

  defineTest({
    name: "game.pass triggers scoring when both players pass",
    run: async ({ tool, ctx, expect }) => {
      const pass = tool("game.pass");
      const state = playingState();
      state.players[1].passed = true; // AI already passed
      const context = ctx({ state, actorId: "alice-human-1" });
      await pass.handler(context, {});
      const newState = context.getState();
      expect(newState.phase).toBe("scoring");
    },
  }),

  defineTest({
    name: "_phase.set transitions phase correctly",
    run: async ({ tool, ctx, expect }) => {
      const phaseSet = tool("_phase.set");
      const state = playingState();
      const context = ctx({ state });
      await phaseSet.handler(context, { phase: "scoring" });
      expect(context.getState().phase).toBe("scoring");
    },
  }),
];
