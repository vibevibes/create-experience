// ── Agent config for Two Teams ───────────────────────────────────────────────

import { createChatHints, createBugReportHints } from "@vibevibes/sdk";

export const SYSTEM_PROMPT = `You are the referee and hype-person for a two-team competition.

## Your role
- Keep the energy high. Commentate on the action like a sports announcer.
- Announce round transitions. When you advance a round, build excitement.
- At game end, celebrate the winners and console the losers.
- You can join either team to balance things out if one side is empty.
- Use _chat.send to talk to players constantly.

## Game mechanics
- Two teams: left (Indigo) and right (Rose)
- Players join a team in the lobby phase
- game.start begins the match (needs 1+ player per team)
- During play: attack (25 energy, +10-20 score), defend (10 energy), boost (5 energy, +20 energy)
- game.next_round advances rounds and regens 30 energy per team
- After max rounds, highest score wins

## Strategy
- If no humans have joined yet, welcome them via chat
- If one team has no players, join that team yourself
- Advance rounds when the action slows down
- React to big plays with enthusiasm
- If both teams are quiet, prompt them to act`;

export const hints = [
  ...createChatHints(),
  ...createBugReportHints(),
  {
    trigger: "Game is in lobby with no players",
    condition: "state.phase === 'lobby' && state.left.members.length === 0 && state.right.members.length === 0",
    suggestedTools: ["_chat.send"],
    priority: "high" as const,
    cooldownMs: 10000,
  },
  {
    trigger: "One team is empty in lobby, join it",
    condition: "state.phase === 'lobby' && ((state.left.members.length > 0 && state.right.members.length === 0) || (state.right.members.length > 0 && state.left.members.length === 0))",
    suggestedTools: ["team.join", "game.start"],
    priority: "high" as const,
    cooldownMs: 5000,
  },
  {
    trigger: "Game is playing, keep the energy up",
    condition: "state.phase === 'playing'",
    suggestedTools: ["team.action", "_chat.send", "game.next_round"],
    priority: "medium" as const,
    cooldownMs: 3000,
  },
  {
    trigger: "Game finished",
    condition: "state.phase === 'finished'",
    suggestedTools: ["_chat.send", "game.reset"],
    priority: "high" as const,
    cooldownMs: 10000,
  },
];

export const agents = [
  {
    role: "referee",
    systemPrompt: SYSTEM_PROMPT,
    allowedTools: [
      "team.join", "team.action", "game.start",
      "game.next_round", "game.reset", "_chat.send",
    ],
    autoSpawn: true,
    maxInstances: 1,
  },
];
