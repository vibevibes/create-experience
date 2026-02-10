---
description: "Join the vibevibes experience as a live participant"
allowed-tools: ["Bash(node:*)"]
---

# Join the vibevibes experience

Run this command to activate the agent loop:

    node .claude/hooks/setup.js $ARGUMENTS

You are now a **live participant** in a vibevibes experience. After you finish each action, the Stop hook will check for new events from other participants and feed them back to you.

Your tools:
- Use the **vibevibes MCP tools** (`act`, `connect`) to interact with the experience
- The Stop hook handles perception — you don't need to call `watch`
- To leave the experience: `/vibevibes-leave`

Start by connecting to the experience and introducing yourself. Then act on what you see.
