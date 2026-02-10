// ── Types ────────────────────────────────────────────────────────────────────

import { z } from "zod";

// ── Enums & Constants ────────────────────────────────────────────────────────

export const SUITS = ["fire", "water", "earth", "air"] as const;
export const EFFECTS = ["draw", "steal", "shield", "double"] as const;
export const PHASES = ["lobby", "dealing", "playing", "scoring", "finished"] as const;

export type Suit = (typeof SUITS)[number];
export type Effect = (typeof EFFECTS)[number];
export type Phase = (typeof PHASES)[number];

// ── Zod Schemas ──────────────────────────────────────────────────────────────

export const cardSchema = z.object({
  id: z.string(),
  name: z.string(),
  value: z.number().min(1).max(10),
  suit: z.enum(SUITS),
  effect: z.enum(EFFECTS).optional(),
});

export const playerSchema = z.object({
  id: z.string(),
  name: z.string(),
  hand: z.array(cardSchema).default([]),
  score: z.number().default(0),
  isAI: z.boolean().default(false),
  shielded: z.boolean().default(false),
  passed: z.boolean().default(false),
});

export const stateSchema = z.object({
  phase: z.enum(PHASES).default("lobby"),
  players: z.array(playerSchema).default([]),
  board: z.array(cardSchema).default([]),
  deck: z.array(cardSchema).default([]),
  currentPlayerIndex: z.number().default(0),
  round: z.number().default(1),
  maxRounds: z.number().default(3),
  lastAction: z.string().default(""),
  winner: z.string().default(""),
});

// ── TypeScript Types ─────────────────────────────────────────────────────────

export type Card = z.infer<typeof cardSchema>;
export type Player = z.infer<typeof playerSchema>;
export type GameState = z.infer<typeof stateSchema>;

// ── Deck Generation ──────────────────────────────────────────────────────────

const CARD_NAMES: Record<Suit, string[]> = {
  fire:  ["Ember", "Blaze", "Inferno", "Spark", "Flame", "Pyre", "Scorch", "Cinder", "Flare", "Wildfire"],
  water: ["Tide", "Ripple", "Torrent", "Mist", "Wave", "Deluge", "Splash", "Cascade", "Drizzle", "Monsoon"],
  earth: ["Stone", "Root", "Quake", "Pebble", "Boulder", "Crag", "Dust", "Terra", "Ridge", "Fossil"],
  air:   ["Gust", "Breeze", "Cyclone", "Zephyr", "Gale", "Whirl", "Draft", "Storm", "Wisp", "Tempest"],
};

export function generateDeck(): Card[] {
  const deck: Card[] = [];
  let idCounter = 0;

  for (const suit of SUITS) {
    for (let value = 1; value <= 10; value++) {
      const card: Card = {
        id: `card-${idCounter++}`,
        name: CARD_NAMES[suit][value - 1],
        value,
        suit,
      };
      // High-value cards (7+) get random effects
      if (value >= 7) {
        card.effect = EFFECTS[Math.floor(Math.random() * EFFECTS.length)];
      }
      deck.push(card);
    }
  }

  // Shuffle
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }

  return deck;
}

// ── Scoring ──────────────────────────────────────────────────────────────────

export function calculateScore(board: Card[], playerId: string): number {
  const playerCards = board.filter((c) => c.id.startsWith(playerId));
  // Simple scoring: sum of values, suit combos get bonus
  let total = playerCards.reduce((sum, c) => sum + c.value, 0);

  // Bonus for suit variety
  const suits = new Set(playerCards.map((c) => c.suit));
  if (suits.size >= 3) total += 5;
  if (suits.size === 4) total += 10;

  return total;
}
