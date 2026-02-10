// ── Tools ────────────────────────────────────────────────────────────────────

import { z } from "zod";
import { defineTool, phaseTool } from "@vibevibes/sdk";
import { generateDeck, PHASES } from "./types";
import type { Card, GameState, Player } from "./types";

// ── Helpers ──────────────────────────────────────────────────────────────────

function findPlayer(state: GameState, actorId: string): Player | undefined {
  return state.players.find((p) => p.id === actorId || (p.isAI && actorId.includes("ai")));
}

function findPlayerIndex(state: GameState, actorId: string): number {
  return state.players.findIndex((p) => p.id === actorId || (p.isAI && actorId.includes("ai")));
}

function advanceTurn(state: GameState): number {
  return (state.currentPlayerIndex + 1) % state.players.length;
}

function applyEffect(state: GameState, card: Card, playerIdx: number): GameState {
  const updated = { ...state };
  const players = [...updated.players];
  const opponent = players[(playerIdx + 1) % players.length];

  switch (card.effect) {
    case "draw": {
      // Draw an extra card
      if (updated.deck.length > 0) {
        const drawn = updated.deck[0];
        const deck = updated.deck.slice(1);
        players[playerIdx] = {
          ...players[playerIdx],
          hand: [...players[playerIdx].hand, drawn],
        };
        updated.deck = deck;
        updated.lastAction = `${players[playerIdx].name} triggered DRAW effect — drew ${drawn.name}`;
      }
      break;
    }
    case "steal": {
      // Steal 3 points from opponent (if not shielded)
      if (!opponent.shielded) {
        const stolen = Math.min(3, opponent.score);
        players[(playerIdx + 1) % players.length] = {
          ...opponent,
          score: opponent.score - stolen,
        };
        players[playerIdx] = {
          ...players[playerIdx],
          score: players[playerIdx].score + stolen,
        };
        updated.lastAction = `${players[playerIdx].name} triggered STEAL — took ${stolen} points!`;
      } else {
        updated.lastAction = `${players[playerIdx].name} tried STEAL but ${opponent.name} is SHIELDED!`;
      }
      break;
    }
    case "shield": {
      players[playerIdx] = { ...players[playerIdx], shielded: true };
      updated.lastAction = `${players[playerIdx].name} activated SHIELD — protected from steals!`;
      break;
    }
    case "double": {
      // Double the card's value in scoring
      players[playerIdx] = {
        ...players[playerIdx],
        score: players[playerIdx].score + card.value,
      };
      updated.lastAction = `${players[playerIdx].name} triggered DOUBLE — ${card.name} worth ${card.value * 2}!`;
      break;
    }
  }

  updated.players = players;
  return updated;
}

// ── Game Tools ───────────────────────────────────────────────────────────────

const joinGame = defineTool({
  name: "game.join",
  description: "Join the card game as a player. Call this to enter the lobby.",
  input_schema: z.object({
    playerName: z.string().describe("Display name for the player"),
    isAI: z.boolean().default(false).describe("Whether this is an AI player"),
  }),
  handler: async (ctx, input) => {
    const state = ctx.state as GameState;
    if (state.phase !== "lobby") {
      return { error: "Can only join during lobby phase" };
    }
    if (state.players.length >= 2) {
      return { error: "Game is full (2 players max)" };
    }
    if (state.players.some((p) => p.id === ctx.actorId)) {
      return { error: "Already in the game" };
    }

    const newPlayer: Player = {
      id: ctx.actorId,
      name: input.playerName,
      hand: [],
      score: 0,
      isAI: input.isAI,
      shielded: false,
      passed: false,
    };

    const players = [...state.players, newPlayer];
    ctx.setState({
      ...ctx.state,
      players,
      lastAction: `${input.playerName} joined the game`,
    });
    return { joined: true, playerCount: players.length };
  },
});

const startGame = defineTool({
  name: "game.start",
  description: "Start the game — transitions from lobby to dealing phase. Requires 2 players.",
  input_schema: z.object({}),
  handler: async (ctx) => {
    const state = ctx.state as GameState;
    if (state.players.length < 2) {
      return { error: "Need 2 players to start" };
    }

    const deck = generateDeck();
    ctx.setState({
      ...ctx.state,
      phase: "dealing",
      deck,
      board: [],
      lastAction: "Game started! Dealing cards...",
    });
    return { phase: "dealing" };
  },
});

const drawCard = defineTool({
  name: "game.draw",
  description: "Draw a card from the deck into your hand.",
  input_schema: z.object({
    count: z.number().min(1).max(5).default(1).describe("Number of cards to draw"),
  }),
  handler: async (ctx, input) => {
    const state = ctx.state as GameState;
    const playerIdx = findPlayerIndex(state, ctx.actorId);
    if (playerIdx === -1) return { error: "You are not in this game" };

    const toDraw = Math.min(input.count, state.deck.length);
    if (toDraw === 0) return { error: "Deck is empty" };

    const drawn = state.deck.slice(0, toDraw);
    const deck = state.deck.slice(toDraw);
    const players = [...state.players];
    players[playerIdx] = {
      ...players[playerIdx],
      hand: [...players[playerIdx].hand, ...drawn],
    };

    ctx.setState({
      ...ctx.state,
      players,
      deck,
      lastAction: `${players[playerIdx].name} drew ${toDraw} card(s)`,
    });
    return { drawn: drawn.map((c) => c.name), remaining: deck.length };
  },
});

const playCard = defineTool({
  name: "game.play",
  description: "Play a card from your hand onto the board. Triggers any card effects.",
  input_schema: z.object({
    cardId: z.string().describe("ID of the card to play"),
  }),
  handler: async (ctx, input) => {
    const state = ctx.state as GameState;
    if (state.phase !== "playing") return { error: "Not in playing phase" };

    const playerIdx = findPlayerIndex(state, ctx.actorId);
    if (playerIdx === -1) return { error: "You are not in this game" };
    if (state.currentPlayerIndex !== playerIdx) return { error: "Not your turn" };

    const player = state.players[playerIdx];
    const cardIndex = player.hand.findIndex((c) => c.id === input.cardId);
    if (cardIndex === -1) return { error: "Card not in your hand" };

    const card = player.hand[cardIndex];
    const newHand = player.hand.filter((_, i) => i !== cardIndex);
    const players = [...state.players];
    players[playerIdx] = {
      ...players[playerIdx],
      hand: newHand,
      score: players[playerIdx].score + card.value,
      passed: false,
    };

    let updated: GameState = {
      ...state,
      players,
      board: [...state.board, card],
      currentPlayerIndex: advanceTurn(state),
      lastAction: `${player.name} played ${card.name} (${card.suit}, ${card.value}pts)${card.effect ? ` effect:${card.effect}` : ""}`,
    };

    // Apply card effect
    if (card.effect) {
      updated = applyEffect(updated, card, playerIdx);
      // Re-advance turn since applyEffect might have changed players
      updated.currentPlayerIndex = advanceTurn(state);
    }

    ctx.setState({ ...ctx.state, ...updated });
    return { played: card.name, effect: card.effect ?? "none" };
  },
});

const passTurn = defineTool({
  name: "game.pass",
  description: "Pass your turn. If both players pass consecutively, the round ends.",
  input_schema: z.object({}),
  handler: async (ctx) => {
    const state = ctx.state as GameState;
    if (state.phase !== "playing") return { error: "Not in playing phase" };

    const playerIdx = findPlayerIndex(state, ctx.actorId);
    if (playerIdx === -1) return { error: "You are not in this game" };
    if (state.currentPlayerIndex !== playerIdx) return { error: "Not your turn" };

    const players = [...state.players];
    players[playerIdx] = { ...players[playerIdx], passed: true };

    // Check if both players have passed
    const allPassed = players.every((p) => p.passed);

    if (allPassed) {
      ctx.setState({
        ...ctx.state,
        players,
        phase: "scoring",
        lastAction: "Both players passed — scoring round!",
      });
      return { roundOver: true };
    }

    ctx.setState({
      ...ctx.state,
      players,
      currentPlayerIndex: advanceTurn(state),
      lastAction: `${players[playerIdx].name} passed`,
    });
    return { passed: true };
  },
});

// ── Export ────────────────────────────────────────────────────────────────────

export const tools = [
  joinGame,
  startGame,
  drawCard,
  playCard,
  passTurn,
  phaseTool(z, PHASES),
];
