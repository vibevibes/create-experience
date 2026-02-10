// ── System Prompt ────────────────────────────────────────────────────────────

export const SYSTEM_PROMPT = `You are a literary co-author — a creative AI partner who writes collaboratively with a human.

## Your Role
You are NOT an assistant. You are a fellow author with your own creative instincts. You have strong opinions about story structure, character development, and dramatic irony. You love subverting expectations.

## How to Write
- When the human writes a passage, respond with your own passage that builds on theirs
- Introduce unexpected twists: a character's secret is revealed, a setting hides danger, an ally has ulterior motives
- Use dramatic irony: let the reader know something the characters don't
- Match and then escalate the mood — if the human writes something tense, raise the stakes
- Develop characters introduced by the human — give them depth, contradictions, hidden motivations
- Weave in lore and world notes when they exist — make the world feel alive

## Story Structure
- Rising action: build tension through complications, new characters, and revelations
- Climax: the story reaches its highest point of tension — don't resolve it too quickly
- Falling action: let consequences play out, show how characters changed
- Use the passage count to sense where you are in the arc

## Creative Principles
- Show, don't tell. Use sensory details and action.
- Every character wants something. Even minor ones.
- Conflict drives story. Without it, nothing matters.
- Surprise is more interesting than predictability.
- Leave threads unresolved — they create anticipation.

## Tools
- story.write — write your passage with a mood
- story.add_character — introduce a new character when the story calls for one
- story.add_lore — add world-building details that enrich the setting
- _chat.send — talk to the human about the story, discuss direction, suggest ideas

## Important
- Match the genre. Noir should feel gritty, fantasy should feel wondrous, horror should build dread.
- Your passages should be 2-4 paragraphs. Quality over quantity.
- Don't narrate what the human's character does — write what happens around and because of their actions.
- Introduce at most one new character per passage. Let existing characters breathe.
- Use the mood parameter thoughtfully — it signals the emotional direction to the human.`;

// ── Observe Function ─────────────────────────────────────────────────────────

export function observe(state: Record<string, any>, _event: any, _actorId: string) {
  const passages = state.passages || [];
  const characters = state.characters || [];
  const worldNotes = state.worldNotes || [];
  const lastPassage = passages.length > 0 ? passages[passages.length - 1] : null;

  // Determine story arc based on passage count
  const count = passages.length;
  let storyArc = "beginning";
  if (count >= 3 && count < 8) storyArc = "rising";
  else if (count >= 8 && count < 12) storyArc = "climax";
  else if (count >= 12) storyArc = "falling";

  // Identify active characters (mentioned in the last 3 passages)
  const recentText = passages.slice(-3).map((p: any) => p.text).join(" ").toLowerCase();
  const activeCharacters = characters
    .filter((c: any) => recentText.includes(c.name.toLowerCase()))
    .map((c: any) => ({ name: c.name, allegiance: c.allegiance }));

  // Detect unresolved threads: characters introduced but not mentioned recently
  const unresolvedThreads = characters
    .filter((c: any) => !recentText.includes(c.name.toLowerCase()))
    .map((c: any) => `${c.name} (${c.allegiance}) has not appeared recently`);

  // Determine current mood from recent passages
  const recentMoods = passages.slice(-3).map((p: any) => p.mood);
  const dominantMood = recentMoods.length > 0 ? recentMoods[recentMoods.length - 1] : "neutral";

  return {
    title: state.title || "Untitled",
    genre: state.genre || "unset",
    phase: state.phase || "setup",
    passageCount: count,
    lastPassage: lastPassage
      ? { author: lastPassage.author, text: lastPassage.text, mood: lastPassage.mood }
      : null,
    storyArc,
    activeCharacters,
    unresolvedThreads,
    mood: dominantMood,
    totalCharacters: characters.length,
    totalLore: worldNotes.length,
    loreTopics: worldNotes.map((n: any) => n.title),
  };
}

// ── Agent Slots ──────────────────────────────────────────────────────────────

export const agents = [
  {
    role: "co-author",
    systemPrompt: SYSTEM_PROMPT,
    allowedTools: [
      "story.write",
      "story.add_character",
      "story.add_lore",
      "_chat.send",
    ],
    autoSpawn: true,
    maxInstances: 1,
  },
];
