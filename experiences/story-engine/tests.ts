import { defineTest } from "@vibevibes/sdk";

// ── Tests ────────────────────────────────────────────────────────────────────

export const tests = [
  defineTest({
    name: "story.write adds a passage to state",
    run: async ({ tool, ctx, expect }) => {
      const write = tool("story.write");
      const context = ctx({
        state: { passages: [], characters: [], worldNotes: [], _chat: [], _bugReports: [] },
      });

      await write.handler(context, { text: "The fog rolled in thick over the harbor.", mood: "ominous" });

      const state = context.getState();
      expect(state.passages.length).toBe(1);
      expect(state.passages[0].text).toBe("The fog rolled in thick over the harbor.");
      expect(state.passages[0].mood).toBe("ominous");
      expect(state.passages[0].author).toBeTruthy();
      expect(state.passages[0].id).toBeTruthy();
    },
  }),

  defineTest({
    name: "story.write appends to existing passages",
    run: async ({ tool, ctx, expect }) => {
      const write = tool("story.write");
      const existing = {
        id: "p1", author: "alice-human-1", text: "Once upon a time.", mood: "neutral", timestamp: 1000,
      };
      const context = ctx({
        state: { passages: [existing], characters: [], worldNotes: [], _chat: [], _bugReports: [] },
      });

      await write.handler(context, { text: "A shadow moved in the distance.", mood: "tense" });

      const state = context.getState();
      expect(state.passages.length).toBe(2);
      expect(state.passages[0].text).toBe("Once upon a time.");
      expect(state.passages[1].text).toBe("A shadow moved in the distance.");
      expect(state.passages[1].mood).toBe("tense");
    },
  }),

  defineTest({
    name: "story.add_character creates a character",
    run: async ({ tool, ctx, expect }) => {
      const addChar = tool("story.add_character");
      const context = ctx({
        state: { passages: [], characters: [], worldNotes: [], _chat: [], _bugReports: [] },
      });

      await addChar.handler(context, {
        name: "Elara",
        description: "A wandering scholar with silver-streaked hair and an unsettling calm.",
        allegiance: "mysterious",
      });

      const state = context.getState();
      expect(state.characters.length).toBe(1);
      expect(state.characters[0].name).toBe("Elara");
      expect(state.characters[0].allegiance).toBe("mysterious");
      expect(state.characters[0].description).toContain("wandering scholar");
      expect(state.characters[0].id).toBeTruthy();
    },
  }),

  defineTest({
    name: "story.add_character appends to existing characters",
    run: async ({ tool, ctx, expect }) => {
      const addChar = tool("story.add_character");
      const existing = {
        id: "c1", name: "Kael", description: "A young thief.", allegiance: "protagonist", createdBy: "alice-human-1",
      };
      const context = ctx({
        state: { passages: [], characters: [existing], worldNotes: [], _chat: [], _bugReports: [] },
      });

      await addChar.handler(context, {
        name: "The Hollow King",
        description: "A specter who rules the dead city of Ashmark.",
        allegiance: "antagonist",
      });

      const state = context.getState();
      expect(state.characters.length).toBe(2);
      expect(state.characters[0].name).toBe("Kael");
      expect(state.characters[1].name).toBe("The Hollow King");
      expect(state.characters[1].allegiance).toBe("antagonist");
    },
  }),

  defineTest({
    name: "story.set_title updates the title",
    run: async ({ tool, ctx, expect }) => {
      const setTitle = tool("story.set_title");
      const context = ctx({ state: { title: "", genre: "", passages: [] } });

      await setTitle.handler(context, { title: "The Last Lighthouse" });

      const state = context.getState();
      expect(state.title).toBe("The Last Lighthouse");
    },
  }),

  defineTest({
    name: "story.set_genre updates the genre",
    run: async ({ tool, ctx, expect }) => {
      const setGenre = tool("story.set_genre");
      const context = ctx({ state: { title: "", genre: "", passages: [] } });

      await setGenre.handler(context, { genre: "gothic horror" });

      const state = context.getState();
      expect(state.genre).toBe("gothic horror");
    },
  }),

  defineTest({
    name: "story.add_lore creates a world note",
    run: async ({ tool, ctx, expect }) => {
      const addLore = tool("story.add_lore");
      const context = ctx({
        state: { passages: [], characters: [], worldNotes: [], _chat: [], _bugReports: [] },
      });

      await addLore.handler(context, {
        title: "The Ashmark Accord",
        content: "A treaty signed in blood that binds the living to serve the dead city for one year.",
      });

      const state = context.getState();
      expect(state.worldNotes.length).toBe(1);
      expect(state.worldNotes[0].title).toBe("The Ashmark Accord");
      expect(state.worldNotes[0].content).toContain("treaty signed in blood");
      expect(state.worldNotes[0].id).toBeTruthy();
    },
  }),
];
