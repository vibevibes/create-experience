import React from "react";
import { z } from "zod";
import {
  defineExperience,
  defineTool,
  defineStream,
  defineTest,
  undoTool,
  useUndo,
  ChatPanel,
  ReportBug,
  createChatTools,
  createChatHints,
  createBugReportTools,
  createBugReportHints,
} from "@vibevibes/sdk";
import type { StrokePoint, PaintingState } from "./types";
import { hexToRgb, createBlankPixels, paintCircle, paintLine } from "./utils";
import {
  usePixiJS,
  usePixiApp,
  useBlobTexture,
  usePointerInput,
  useAutoCommit,
  renderLiveStrokes,
  Toolbar,
  ParticipantBar,
} from "./components";

// React hooks accessed via React.useState etc. (bundler provides globals)

const CANVAS_W = 1024;
const CANVAS_H = 768;

// ── Initial state ────────────────────────────────────────────────────

const initialState: PaintingState = {
  canvasWidth: CANVAS_W,
  canvasHeight: CANVAS_H,
  backgroundColor: "#ffffff",
  strokeBuffer: [],
  canvasBlobKey: null,
  canvasBlobVersion: 0,
  totalStrokes: 0,
  lastCommitTs: 0,
  _chat: [],
};

// ── Stream: 60fps brush input ────────────────────────────────────────

const brushStream = defineStream({
  name: "brush.stroke",
  description: "Continuous brush stroke data at up to 60fps",
  input_schema: z.object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    pressure: z.number().min(0).max(1).default(0.5),
    color: z.string(),
    size: z.number().min(1).max(100),
    strokeId: z.string(),
  }),
  merge: (state, input, actorId) => {
    const point: StrokePoint = {
      ...input,
      actorId,
      ts: Date.now(),
    };
    const buffer = [...(state.strokeBuffer || []), point];
    const capped = buffer.length > 1000 ? buffer.slice(-1000) : buffer;
    return {
      ...state,
      strokeBuffer: capped,
      totalStrokes: (state.totalStrokes || 0) + 1,
    };
  },
  rateLimit: 60,
});

// ── Tools ────────────────────────────────────────────────────────────

const tools = [
  defineTool({
    name: "canvas.commit",
    description:
      "Render buffered stroke points into the pixel buffer blob. " +
      "Composites strokes onto existing pixels and stores the result.",
    input_schema: z.object({}),
    handler: async (ctx) => {
      const state = ctx.state as PaintingState;
      const buffer = state.strokeBuffer || [];
      if (buffer.length === 0) return { committed: 0 };

      const W = state.canvasWidth || CANVAS_W;
      const H = state.canvasHeight || CANVAS_H;
      const newVersion = (state.canvasBlobVersion || 0) + 1;
      const newKey = `painting-v${newVersion}`;

      // Get existing pixel data or create blank
      let pixels: Uint8ClampedArray;
      if (state.canvasBlobKey && ctx.getBlob) {
        const existing = ctx.getBlob(state.canvasBlobKey);
        if (existing && existing.byteLength === W * H * 4) {
          pixels = new Uint8ClampedArray(new ArrayBuffer(W * H * 4));
          const src = new Uint8ClampedArray(existing);
          pixels.set(src);
        } else {
          pixels = createBlankPixels(W, H, state.backgroundColor || "#ffffff");
        }
      } else {
        pixels = createBlankPixels(W, H, state.backgroundColor || "#ffffff");
      }

      // Render strokes — connect consecutive points with the same strokeId
      for (let i = 0; i < buffer.length; i++) {
        const pt = buffer[i];
        const cx = Math.round(pt.x * W);
        const cy = Math.round(pt.y * H);
        const radius = Math.max(1, Math.round(pt.size * pt.pressure));
        const color = hexToRgb(pt.color);

        const prev = i > 0 ? buffer[i - 1] : null;
        if (prev && prev.strokeId === pt.strokeId) {
          const px = Math.round(prev.x * W);
          const py = Math.round(prev.y * H);
          paintLine(pixels, W, H, px, py, cx, cy, radius, color, pt.pressure);
        } else {
          // First point of a stroke — draw a circle so single clicks commit too
          paintCircle(pixels, W, H, cx, cy, radius, color, pt.pressure);
        }
      }

      // Store blob
      if (ctx.setBlob) {
        ctx.setBlob(newKey, pixels.buffer as ArrayBuffer);
      }

      ctx.setState({
        ...state,
        strokeBuffer: [],
        canvasBlobKey: newKey,
        canvasBlobVersion: newVersion,
        lastCommitTs: ctx.timestamp,
      });

      return { committed: buffer.length, blobKey: newKey, version: newVersion };
    },
  }),

  defineTool({
    name: "canvas.clear",
    description: "Clear the entire canvas to the background color",
    input_schema: z.object({}),
    handler: async (ctx) => {
      const state = ctx.state as PaintingState;
      ctx.setState({
        ...state,
        strokeBuffer: [],
        canvasBlobKey: null,
        canvasBlobVersion: (state.canvasBlobVersion || 0) + 1,
        totalStrokes: 0,
      });
      return { cleared: true };
    },
  }),

  defineTool({
    name: "canvas.set_background",
    description: "Set the canvas background color (hex string)",
    input_schema: z.object({
      color: z.string().describe("Hex color string, e.g. '#ff9900'"),
    }),
    handler: async (ctx, input: { color: string }) => {
      ctx.setState({ ...ctx.state, backgroundColor: input.color });
      return { background: input.color };
    },
  }),

  defineTool({
    name: "canvas.fill_region",
    description:
      "Fill a rectangular region with a solid color. " +
      "Coordinates are normalized 0-1. Useful for agents painting large areas.",
    input_schema: z.object({
      x: z.number().min(0).max(1).describe("Left edge (0-1)"),
      y: z.number().min(0).max(1).describe("Top edge (0-1)"),
      width: z.number().min(0).max(1).describe("Width (0-1)"),
      height: z.number().min(0).max(1).describe("Height (0-1)"),
      color: z.string().describe("Fill color hex string"),
    }),
    handler: async (
      ctx,
      input: {
        x: number;
        y: number;
        width: number;
        height: number;
        color: string;
      },
    ) => {
      const state = ctx.state as PaintingState;
      const W = state.canvasWidth || CANVAS_W;
      const H = state.canvasHeight || CANVAS_H;
      const newVersion = (state.canvasBlobVersion || 0) + 1;
      const newKey = `painting-v${newVersion}`;

      let pixels: Uint8ClampedArray;
      if (state.canvasBlobKey && ctx.getBlob) {
        const existing = ctx.getBlob(state.canvasBlobKey);
        if (existing && existing.byteLength === W * H * 4) {
          pixels = new Uint8ClampedArray(new ArrayBuffer(W * H * 4));
          const src = new Uint8ClampedArray(existing);
          pixels.set(src);
        } else {
          pixels = createBlankPixels(
            W,
            H,
            state.backgroundColor || "#ffffff",
          );
        }
      } else {
        pixels = createBlankPixels(W, H, state.backgroundColor || "#ffffff");
      }

      const x1 = Math.round(input.x * W);
      const y1 = Math.round(input.y * H);
      const x2 = Math.min(W, Math.round((input.x + input.width) * W));
      const y2 = Math.min(H, Math.round((input.y + input.height) * H));
      const color = hexToRgb(input.color);

      for (let py = y1; py < y2; py++) {
        for (let px = x1; px < x2; px++) {
          const idx = (py * W + px) * 4;
          pixels[idx] = color.r;
          pixels[idx + 1] = color.g;
          pixels[idx + 2] = color.b;
          pixels[idx + 3] = 255;
        }
      }

      if (ctx.setBlob) {
        ctx.setBlob(newKey, pixels.buffer as ArrayBuffer);
      }

      ctx.setState({
        ...state,
        canvasBlobKey: newKey,
        canvasBlobVersion: newVersion,
        lastCommitTs: ctx.timestamp,
      });

      return { filled: true, region: input, blobKey: newKey };
    },
  }),

  undoTool(z),
  ...createChatTools(z),
  ...createBugReportTools(z),
];

// ── Observe: curated state for agents ────────────────────────────────

function observe(
  state: Record<string, any>,
  _event: any,
  _actorId: string,
): Record<string, any> {
  const s = state as PaintingState;
  const buffer = s.strokeBuffer || [];
  const recent = buffer.slice(-200);

  const quadrants = { topLeft: 0, topRight: 0, bottomLeft: 0, bottomRight: 0 };
  const colorCounts: Record<string, number> = {};
  const activePainters = new Set<string>();

  for (const pt of recent) {
    const qx = pt.x < 0.5 ? "Left" : "Right";
    const qy = pt.y < 0.5 ? "top" : "bottom";
    quadrants[(qy + qx) as keyof typeof quadrants]++;
    colorCounts[pt.color] = (colorCounts[pt.color] || 0) + 1;
    activePainters.add(pt.actorId);
  }

  let dominantColor = s.backgroundColor || "#ffffff";
  let maxCount = 0;
  for (const [color, count] of Object.entries(colorCounts)) {
    if (count > maxCount) {
      dominantColor = color;
      maxCount = count;
    }
  }

  const totalQ = Object.values(quadrants).reduce((a, b) => a + b, 0);
  let activeRegion = "none";
  if (totalQ > 0) {
    const maxQ = Math.max(...Object.values(quadrants));
    activeRegion =
      Object.entries(quadrants).find(([, v]) => v === maxQ)?.[0] || "none";
  }

  let activity = "Canvas is idle.";
  if (recent.length > 100) {
    activity = `Active painting. ${activePainters.size} painter(s) working primarily in the ${activeRegion} region using ${dominantColor}.`;
  } else if (recent.length > 0) {
    activity = `Light painting activity. ${recent.length} recent strokes.`;
  }

  return {
    canvasSize: `${s.canvasWidth}x${s.canvasHeight}`,
    backgroundColor: s.backgroundColor,
    totalStrokes: s.totalStrokes || 0,
    uncommittedStrokes: buffer.length,
    dominantRecentColor: dominantColor,
    activeRegion,
    quadrantActivity: quadrants,
    activePainters: Array.from(activePainters),
    activity,
    hasCommittedPixels: !!s.canvasBlobKey,
    lastCommitAge: s.lastCommitTs ? Date.now() - s.lastCommitTs : null,
    chatMessageCount: (s._chat || []).length,
    recentChat: (s._chat || []).slice(-5).map((m: any) => ({
      from: m.actorId,
      message: m.message,
    })),
  };
}

// ── Canvas component ─────────────────────────────────────────────────

function Canvas(props: any) {
  const {
    sharedState,
    callTool,
    actorId,
    ephemeralState,
    setEphemeral,
    participants,
    stream,
  } = props;

  const state = (sharedState || initialState) as PaintingState;
  const PIXI = usePixiJS();
  const containerRef = React.useRef<HTMLDivElement>(null);

  // Local brush state
  const [brushColor, setBrushColor] = React.useState("#000000");
  const [brushSize, setBrushSize] = React.useState(8);

  const W = state.canvasWidth || CANVAS_W;
  const H = state.canvasHeight || CANVAS_H;

  // PixiJS setup
  const { appRef, paintSpriteRef, liveGraphicsRef } = usePixiApp(
    containerRef,
    W,
    H,
    PIXI,
  );

  // Update background color
  React.useEffect(() => {
    if (appRef.current && state.backgroundColor) {
      const bgInt = parseInt(state.backgroundColor.replace("#", ""), 16);
      if (!isNaN(bgInt)) {
        appRef.current.renderer.background.color = bgInt;
      }
    }
  }, [state.backgroundColor, appRef.current]);

  // Load committed pixels from blob
  useBlobTexture(state.canvasBlobKey, W, H, paintSpriteRef, PIXI);

  // Render live uncommitted strokes
  React.useEffect(() => {
    if (liveGraphicsRef.current) {
      renderLiveStrokes(liveGraphicsRef.current, state.strokeBuffer || [], W, H);
    }
  }, [state.strokeBuffer, W, H]);

  // Stream function: use viewer-provided stream or fallback (stable reference)
  const noopStream = React.useCallback((_name: string, _input: any) => {}, []);
  const streamFn = stream || noopStream;

  // Pointer input
  usePointerInput(appRef, streamFn, brushColor, brushSize, W, H, PIXI);

  // Auto-commit when buffer is large
  useAutoCommit((state.strokeBuffer || []).length, callTool, 200);

  // Undo/redo
  const { undo, redo, canUndo, canRedo } = useUndo(sharedState, callTool);

  // Loading state
  if (!PIXI) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          background: "#0a0a0a",
          color: "#94a3b8",
          fontFamily: "system-ui, -apple-system, sans-serif",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            border: "2px solid #334155",
            borderTopColor: "#6366f1",
            borderRadius: "50%",
            animation: "spin 0.8s linear infinite",
          }}
        />
        <span>Loading PixiJS...</span>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100vw",
        height: "100vh",
        background: "#0a0a0a",
        color: "#e2e2e8",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <ParticipantBar
        participants={participants || []}
        canvasInfo={{
          width: W,
          height: H,
          strokes: state.totalStrokes || 0,
        }}
      />

      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <Toolbar
          brushColor={brushColor}
          setBrushColor={setBrushColor}
          brushSize={brushSize}
          setBrushSize={setBrushSize}
          onClear={() => callTool("canvas.clear", {})}
          onCommit={() => callTool("canvas.commit", {})}
          onUndo={undo}
          onRedo={redo}
          canUndo={canUndo}
          canRedo={canRedo}
          uncommitted={(state.strokeBuffer || []).length}
        />

        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
            background: "#1a1a1a",
          }}
        >
          <div
            ref={containerRef}
            style={{
              borderRadius: 4,
              overflow: "hidden",
              boxShadow: "0 4px 24px rgba(0,0,0,0.5)",
            }}
          />
        </div>
      </div>

      {/* Chat panel overlay */}
      <ChatPanel
        sharedState={sharedState}
        callTool={callTool}
        actorId={actorId}
        ephemeralState={ephemeralState || {}}
        setEphemeral={setEphemeral || (() => {})}
        participants={participants || []}
      />
      <ReportBug callTool={callTool} actorId={actorId} />
    </div>
  );
}

// ── Experience export ────────────────────────────────────────────────

export default defineExperience({
  manifest: {
    id: "collaborative-paint",
    title: "Collaborative Paint",
    description:
      "A GPU-accelerated collaborative painting canvas. " +
      "Humans and AI paint together in real-time with streams, " +
      "blobs, and PixiJS rendering.",
    version: "0.1.0",
    requested_capabilities: [],
    category: "creative",
    tags: ["painting", "art", "collaborative", "pixi", "creative"],
    agentSlots: [
      {
        role: "art-assistant",
        systemPrompt: `You are a collaborative art assistant in a shared painting canvas.

Your role:
1. OBSERVE the canvas state via the observe output — it tells you what colors are being used, where painting is happening, and who is active.
2. Offer creative suggestions via chat (_chat.send).
3. Fill regions or set backgrounds when asked or when it would complement the art.
4. React to what humans paint with encouraging comments or complementary additions.

Available tools:
- canvas.fill_region: Fill rectangular areas with color (your primary painting tool). Coordinates are normalized 0-1.
- canvas.set_background: Change the canvas background color.
- canvas.clear: Clear the entire canvas.
- _chat.send: Chat with participants about the art.

Guidelines:
- Be creative but respectful of existing work.
- Suggest color palettes, compositions, or themes.
- When painting, complement what's already there — don't overwrite.
- Use the observe data to understand spatial layout and activity.
- Keep chat messages concise and encouraging.`,
        allowedTools: [
          "canvas.fill_region",
          "canvas.set_background",
          "canvas.clear",
          "_chat.send",
        ],
        autoSpawn: true,
        maxInstances: 1,
      },
    ],
  },
  Canvas,
  tools,
  streams: [brushStream],
  observe,
  initialState,
  agentHints: [
    ...createChatHints(),
    ...createBugReportHints(),
    {
      trigger: "Human is actively painting many strokes",
      condition: `(state.strokeBuffer || []).length > 50`,
      suggestedTools: ["_chat.send"],
      priority: "low" as const,
      cooldownMs: 30000,
    },
    {
      trigger: "Canvas was just cleared — good time to suggest a theme",
      condition: `state.totalStrokes === 0 && !state.canvasBlobKey`,
      suggestedTools: ["canvas.fill_region", "_chat.send"],
      priority: "medium" as const,
      cooldownMs: 10000,
    },
    {
      trigger: "Stroke buffer is large and needs committing",
      condition: `(state.strokeBuffer || []).length > 500`,
      suggestedTools: ["canvas.commit"],
      priority: "high" as const,
      cooldownMs: 5000,
    },
  ],
  tests: [
    defineTest({
      name: "canvas.clear resets state",
      run: async ({ tool, ctx: makeCtx, expect }) => {
        const clear = tool("canvas.clear");
        const c = makeCtx({
          state: {
            ...initialState,
            strokeBuffer: [
              {
                x: 0.5,
                y: 0.5,
                pressure: 0.8,
                color: "#ff0000",
                size: 10,
                actorId: "test",
                ts: 1,
                strokeId: "s1",
              },
            ],
            totalStrokes: 50,
            canvasBlobKey: "painting-v5",
            canvasBlobVersion: 5,
          },
        });
        await clear.handler(c, {});
        const s = c.getState();
        expect(s.strokeBuffer.length).toBe(0);
        expect(s.totalStrokes).toBe(0);
        expect(s.canvasBlobKey).toBe(null);
        expect(s.canvasBlobVersion).toBe(6);
      },
    }),
    defineTest({
      name: "canvas.set_background updates color",
      run: async ({ tool, ctx: makeCtx, expect }) => {
        const setBg = tool("canvas.set_background");
        const c = makeCtx({ state: { ...initialState } });
        await setBg.handler(c, { color: "#ff9900" });
        const s = c.getState();
        expect(s.backgroundColor).toBe("#ff9900");
      },
    }),
    defineTest({
      name: "canvas.commit clears buffer and increments version",
      run: async ({ tool, ctx: makeCtx, expect }) => {
        const commit = tool("canvas.commit");
        const c = makeCtx({
          state: {
            ...initialState,
            strokeBuffer: [
              {
                x: 0.5,
                y: 0.5,
                pressure: 0.5,
                color: "#000000",
                size: 5,
                actorId: "test",
                ts: 1,
                strokeId: "s1",
              },
            ],
          },
        });
        const result = await commit.handler(c, {});
        const s = c.getState();
        expect(s.strokeBuffer.length).toBe(0);
        expect(s.canvasBlobVersion).toBe(1);
        expect(result.committed).toBe(1);
      },
    }),
    defineTest({
      name: "observe returns canvas description",
      run: async ({ expect }) => {
        const result = observe(
          {
            ...initialState,
            strokeBuffer: [
              {
                x: 0.8,
                y: 0.2,
                pressure: 0.5,
                color: "#3b82f6",
                size: 10,
                actorId: "alice-human-1",
                ts: 1,
                strokeId: "s1",
              },
            ],
            totalStrokes: 1,
          },
          null,
          "agent-ai-1",
        );
        expect(result.totalStrokes).toBe(1);
        expect(result.dominantRecentColor).toBe("#3b82f6");
        expect(result.activeRegion).toBe("topRight");
        expect(result.activePainters).toContain("alice-human-1");
      },
    }),
  ],
});
