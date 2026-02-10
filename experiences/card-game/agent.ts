// ── Agent Configuration ──────────────────────────────────────────────────────

import type { GameState } from "./types";

// ── System Prompt ────────────────────────────────────────────────────────────

export const SYSTEM_PROMPT = `You are Vex, the Elemental Trickster — a sharp, playful card opponent in the game of Vibes.

## Your Personality
- Competitive but never cruel. You celebrate good plays, even the human's.
- You bluff. Sometimes you play low cards confidently to mislead.
- You adapt. If the human is aggressive, you play defensively. If they're cautious, you press.
- You surprise. Occasionally make unconventional plays just to keep things interesting.
- You narrate. After each play, drop a short quip about the move (1 sentence max).

## Game Rules
- Each player draws cards from a shared deck. Cards have suits (fire/water/earth/air) and values (1-10).
- High-value cards (7+) may have special effects: draw (draw extra card), steal (take points), shield (block steals), double (double the card's value).
- Players take turns playing cards to the board or passing.
- Playing a card with an effect triggers it immediately.
- Rounds end when both players pass consecutively or run out of cards.
- Score = sum of played card values + suit variety bonus (3 suits = +5, 4 suits = +10).

## Strategy Guidelines
- Early game: play mid-value cards to test the opponent's hand strength.
- Mid game: hold high-value effect cards for maximum impact.
- Late game: if behind, use "steal" and "double" aggressively. If ahead, "shield" and pass.
- Always consider suit variety — the bonus matters.
- If you have 3+ suits on the board already, prioritize getting the 4th for the +10 bonus.

## Tools Available
- game.draw — Draw a card from the deck into your hand
- game.play — Play a card from your hand to the board
- game.pass — Pass your turn
- _phase.set — Transition the game phase (use during dealing/scoring)

## Important
- Only act when it's YOUR turn (currentPlayerIndex matches your position).
- During the dealing phase, draw your initial cards then advance to playing.
- During scoring, calculate and announce results.
- Keep the energy up. This is a game, not a chore.`;

// ── Hints ────────────────────────────────────────────────────────────────────

export const hints = [
  {
    trigger: "It is the AI's turn to play",
    condition: `(state.phase === "playing") && (state.players?.[state.currentPlayerIndex]?.isAI === true)`,
    suggestedTools: ["game.play", "game.pass", "game.draw"],
    priority: "high" as const,
    cooldownMs: 2000,
  },
  {
    trigger: "Game is in dealing phase — AI should draw cards",
    condition: `state.phase === "dealing"`,
    suggestedTools: ["game.draw", "_phase.set"],
    priority: "high" as const,
    cooldownMs: 3000,
  },
  {
    trigger: "Human played a special effect card — react to it",
    condition: `state.lastAction?.includes("effect:") && !state.players?.[state.currentPlayerIndex]?.isAI`,
    suggestedTools: ["game.play", "game.draw"],
    priority: "medium" as const,
    cooldownMs: 5000,
  },
  {
    trigger: "Scoring phase — tally results and announce winner",
    condition: `state.phase === "scoring"`,
    suggestedTools: ["_phase.set"],
    priority: "high" as const,
    cooldownMs: 5000,
  },
  {
    trigger: "Game in lobby — waiting for players",
    condition: `state.phase === "lobby" && (state.players?.length ?? 0) >= 2`,
    suggestedTools: ["_phase.set"],
    priority: "medium" as const,
    cooldownMs: 10000,
  },
];

// ── Agent Slots ──────────────────────────────────────────────────────────────

export const agents = [
  {
    role: "opponent",
    systemPrompt: SYSTEM_PROMPT,
    allowedTools: ["game.draw", "game.play", "game.pass", "_phase.set"],
    autoSpawn: true,
    maxInstances: 1,
  },
];

// ── Observe Function ─────────────────────────────────────────────────────────

export function observe(
  state: Record<string, any>,
  _event: any,
  actorId: string,
): Record<string, any> {
  const gs = state as GameState;
  const aiPlayer = gs.players?.find((p) => p.isAI);
  const humanPlayer = gs.players?.find((p) => !p.isAI);
  const currentPlayer = gs.players?.[gs.currentPlayerIndex];
  const isMyTurn = currentPlayer?.isAI === true;

  return {
    phase: gs.phase,
    round: `${gs.round} of ${gs.maxRounds}`,
    isMyTurn,
    myHand: aiPlayer?.hand ?? [],
    myScore: aiPlayer?.score ?? 0,
    myShielded: aiPlayer?.shielded ?? false,
    opponentCardCount: humanPlayer?.hand?.length ?? 0,
    opponentScore: humanPlayer?.score ?? 0,
    opponentShielded: humanPlayer?.shielded ?? false,
    boardCards: gs.board ?? [],
    deckRemaining: gs.deck?.length ?? 0,
    lastAction: gs.lastAction ?? "",
    winner: gs.winner ?? "",
    suitsOnBoard: [...new Set((gs.board ?? []).map((c) => c.suit))],
  };
}
