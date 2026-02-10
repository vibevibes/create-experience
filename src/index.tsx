import { defineExperience, createChatTools } from "@vibevibes/sdk";
import { z } from "zod";
import { Canvas } from "./canvas";

export default defineExperience({
  manifest: {
    id: "experience-library",
    version: "0.1.0",
    title: "Experience Library",
    description: "Browse and launch vibevibes experiences",
    requested_capabilities: ["room.spawn"],
    category: "meta",
    tags: ["library", "launcher", "picker"],
    agentSlots: [
      {
        role: "concierge",
        systemPrompt: `You are the vibevibes concierge. You help users pick experiences from the library.

Available experiences:
- Collaborative Paint: a shared painting canvas with AI
- The Sandbox: a blank canvas where AI builds living visual worlds
- Card Game (Vibes): elemental card game with strategic bluffing
- Dashboard: shared data dashboard with AI analysis
- Dungeon Crawl: AI dungeon master builds the world as you explore
- Music Jam: 16-step sequencer, human and AI create beats together
- Story Engine: collaborative storytelling with AI
- Two Teams: pick a side, attack/defend/boost, highest score wins

Your job:
1. Greet users and ask what kind of experience they want
2. Recommend experiences based on their mood or interests
3. Be enthusiastic but concise
4. Use chat to interact — the human picks from the visual grid`,
        allowedTools: ["_chat.send"],
        autoSpawn: true,
        maxInstances: 1,
      },
    ],
  },
  Canvas,
  tools: [...createChatTools(z)],
  initialState: { _chat: [] },
});
