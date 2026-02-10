import { defineTest } from "@vibevibes/sdk";
import { createInitialState } from "./types";

// ── Tests ────────────────────────────────────────────────────────────────────

export const tests = [
  defineTest({
    name: "seq.toggle activates an inactive step",
    run: async ({ tool, ctx, expect }) => {
      const toggle = tool("seq.toggle");
      const state = createInitialState();
      const context = ctx({ state });

      await toggle.handler(context, { trackIndex: 0, stepIndex: 3 });

      expect(context.state.tracks[0].pattern[3].active).toBe(true);
    },
  }),

  defineTest({
    name: "seq.toggle deactivates an active step",
    run: async ({ tool, ctx, expect }) => {
      const toggle = tool("seq.toggle");
      const state = createInitialState();
      state.tracks[1].pattern[7].active = true;
      const context = ctx({ state });

      await toggle.handler(context, { trackIndex: 1, stepIndex: 7 });

      expect(context.state.tracks[1].pattern[7].active).toBe(false);
    },
  }),

  defineTest({
    name: "seq.toggle sets velocity and color",
    run: async ({ tool, ctx, expect }) => {
      const toggle = tool("seq.toggle");
      const state = createInitialState();
      const context = ctx({ state });

      await toggle.handler(context, {
        trackIndex: 2,
        stepIndex: 0,
        active: true,
        velocity: 0.5,
        color: "#ff00ff",
      });

      const step = context.state.tracks[2].pattern[0];
      expect(step.active).toBe(true);
      expect(step.velocity).toBe(0.5);
      expect(step.color).toBe("#ff00ff");
    },
  }),

  defineTest({
    name: "seq.toggle with active=false forces step off",
    run: async ({ tool, ctx, expect }) => {
      const toggle = tool("seq.toggle");
      const state = createInitialState();
      state.tracks[0].pattern[0].active = true;
      const context = ctx({ state });

      await toggle.handler(context, { trackIndex: 0, stepIndex: 0, active: false });

      expect(context.state.tracks[0].pattern[0].active).toBe(false);
    },
  }),

  defineTest({
    name: "seq.set_track writes a full 16-step pattern",
    run: async ({ tool, ctx, expect }) => {
      const setTrack = tool("seq.set_track");
      const state = createInitialState();
      const context = ctx({ state });

      const fourOnFloor = [
        true, false, false, false,
        true, false, false, false,
        true, false, false, false,
        true, false, false, false,
      ];

      await setTrack.handler(context, {
        trackIndex: 0,
        pattern: fourOnFloor,
        velocity: 0.9,
      });

      const track = context.state.tracks[0];
      expect(track.pattern[0].active).toBe(true);
      expect(track.pattern[1].active).toBe(false);
      expect(track.pattern[4].active).toBe(true);
      expect(track.pattern[0].velocity).toBe(0.9);
      // Count active steps
      const activeCount = track.pattern.filter((s: any) => s.active).length;
      expect(activeCount).toBe(4);
    },
  }),

  defineTest({
    name: "seq.set_track renames track when name is provided",
    run: async ({ tool, ctx, expect }) => {
      const setTrack = tool("seq.set_track");
      const state = createInitialState();
      const context = ctx({ state });

      await setTrack.handler(context, {
        trackIndex: 5,
        pattern: Array(16).fill(false),
        name: "Lead Synth",
      });

      expect(context.state.tracks[5].name).toBe("Lead Synth");
    },
  }),

  defineTest({
    name: "seq.clear_track sets all steps to inactive",
    run: async ({ tool, ctx, expect }) => {
      const clearTrack = tool("seq.clear_track");
      const state = createInitialState();
      // Activate some steps first
      state.tracks[2].pattern[0].active = true;
      state.tracks[2].pattern[4].active = true;
      state.tracks[2].pattern[8].active = true;
      const context = ctx({ state });

      await clearTrack.handler(context, { trackIndex: 2 });

      const activeCount = context.state.tracks[2].pattern
        .filter((s: any) => s.active).length;
      expect(activeCount).toBe(0);
    },
  }),

  defineTest({
    name: "seq.mute toggles track muted state",
    run: async ({ tool, ctx, expect }) => {
      const mute = tool("seq.mute");
      const state = createInitialState();
      const context = ctx({ state });

      // Mute
      await mute.handler(context, { trackIndex: 3 });
      expect(context.state.tracks[3].muted).toBe(true);

      // Unmute
      await mute.handler(context, { trackIndex: 3 });
      expect(context.state.tracks[3].muted).toBe(false);
    },
  }),

  defineTest({
    name: "seq.set_bpm updates tempo",
    run: async ({ tool, ctx, expect }) => {
      const setBpm = tool("seq.set_bpm");
      const state = createInitialState();
      const context = ctx({ state });

      await setBpm.handler(context, { bpm: 140 });

      expect(context.state.bpm).toBe(140);
    },
  }),

  defineTest({
    name: "seq.set_key updates key and scale",
    run: async ({ tool, ctx, expect }) => {
      const setKey = tool("seq.set_key");
      const state = createInitialState();
      const context = ctx({ state });

      await setKey.handler(context, { key: "F", scale: "minor" });

      expect(context.state.key).toBe("F");
      expect(context.state.scale).toBe("minor");
    },
  }),

  defineTest({
    name: "seq.randomize creates pattern with approximate density",
    run: async ({ tool, ctx, expect }) => {
      const randomize = tool("seq.randomize");
      const state = createInitialState();
      const context = ctx({ state });

      await randomize.handler(context, { trackIndex: 7, density: 1.0 });

      // With density 1.0, all steps should be active
      const activeCount = context.state.tracks[7].pattern
        .filter((s: any) => s.active).length;
      expect(activeCount).toBe(16);
    },
  }),

  defineTest({
    name: "seq.toggle does not affect other tracks",
    run: async ({ tool, ctx, expect }) => {
      const toggle = tool("seq.toggle");
      const state = createInitialState();
      state.tracks[0].pattern[0].active = true;
      const context = ctx({ state });

      await toggle.handler(context, { trackIndex: 1, stepIndex: 0 });

      // Track 0 should be unchanged
      expect(context.state.tracks[0].pattern[0].active).toBe(true);
      // Track 1 should be toggled on
      expect(context.state.tracks[1].pattern[0].active).toBe(true);
    },
  }),
];
