import React from "react";
import { useBlob, useParticipants, ColorPicker, Slider, Button, Badge } from "@vibevibes/sdk";
import type { StrokePoint } from "./types";

// ── PixiJS CDN loader ────────────────────────────────────────────────

export function usePixiJS(): any {
  const [pixi, setPixi] = React.useState<any>((globalThis as any).PIXI || null);

  React.useEffect(() => {
    if ((globalThis as any).PIXI) {
      setPixi((globalThis as any).PIXI);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/pixi.js@7.3.2/dist/pixi.min.js";
    script.onload = () => setPixi((globalThis as any).PIXI);
    script.onerror = () => console.error("Failed to load PixiJS");
    document.head.appendChild(script);
  }, []);

  return pixi;
}

// ── PixiJS Application ───────────────────────────────────────────────

export function usePixiApp(
  containerRef: React.RefObject<HTMLDivElement>,
  width: number,
  height: number,
  PIXI: any,
) {
  const appRef = React.useRef<any>(null);
  const paintSpriteRef = React.useRef<any>(null);
  const liveGraphicsRef = React.useRef<any>(null);

  React.useEffect(() => {
    if (!PIXI || !containerRef.current) return;
    if (appRef.current) return; // already initialized

    const app = new PIXI.Application({
      width,
      height,
      backgroundColor: 0xffffff,
      antialias: true,
      resolution: 1,
      preserveDrawingBuffer: true,
    });

    containerRef.current.appendChild(app.view);
    app.view.style.display = "block";
    // Prevent browser gesture recognition from delaying/eating pointer events
    app.view.style.touchAction = "none";
    // Disable PixiJS's internal event system so it doesn't race with our DOM listeners
    app.stage.eventMode = "none";
    app.stage.interactiveChildren = false;
    appRef.current = app;

    // Layer 1: committed pixel texture
    const paintSprite = new PIXI.Sprite();
    paintSprite.width = width;
    paintSprite.height = height;
    app.stage.addChild(paintSprite);
    paintSpriteRef.current = paintSprite;

    // Layer 2: live uncommitted strokes
    const liveGfx = new PIXI.Graphics();
    app.stage.addChild(liveGfx);
    liveGraphicsRef.current = liveGfx;

    return () => {
      app.destroy(true, { children: true, texture: true });
      appRef.current = null;
      paintSpriteRef.current = null;
      liveGraphicsRef.current = null;
    };
  }, [PIXI, containerRef, width, height]);

  return { appRef, paintSpriteRef, liveGraphicsRef };
}

// ── Blob → PixiJS Texture ────────────────────────────────────────────

export function useBlobTexture(
  blobKey: string | null,
  width: number,
  height: number,
  paintSpriteRef: React.MutableRefObject<any>,
  PIXI: any,
) {
  const blobData = useBlob(blobKey);

  React.useEffect(() => {
    if (!PIXI || !paintSpriteRef.current) return;

    // No blob (canvas was cleared) — remove the sprite texture
    if (!blobData) {
      paintSpriteRef.current.texture = PIXI.Texture.EMPTY;
      return;
    }

    try {
      const pixels = new Uint8ClampedArray(blobData);
      if (pixels.length !== width * height * 4) return;

      const offscreen = document.createElement("canvas");
      offscreen.width = width;
      offscreen.height = height;
      const ctx2d = offscreen.getContext("2d");
      if (!ctx2d) return;

      const imageData = new ImageData(pixels, width, height);
      ctx2d.putImageData(imageData, 0, 0);

      const texture = PIXI.Texture.from(offscreen);
      paintSpriteRef.current.texture = texture;
      paintSpriteRef.current.width = width;
      paintSpriteRef.current.height = height;
    } catch (e) {
      console.error("Failed to update texture from blob:", e);
    }
  }, [blobData, width, height, PIXI]);
}

// ── Render live strokes as PIXI.Graphics ─────────────────────────────

export function renderLiveStrokes(
  liveGraphics: any,
  strokeBuffer: StrokePoint[],
  canvasWidth: number,
  canvasHeight: number,
) {
  liveGraphics.clear();

  // Connect consecutive points that share the same strokeId
  for (let i = 0; i < strokeBuffer.length; i++) {
    const pt = strokeBuffer[i];
    const x = pt.x * canvasWidth;
    const y = pt.y * canvasHeight;
    const lineWidth = Math.max(2, pt.size * pt.pressure * 2);
    const color = parseInt(pt.color.replace("#", ""), 16);
    const alpha = Math.min(1, pt.pressure);

    const prev = i > 0 ? strokeBuffer[i - 1] : null;
    if (prev && prev.strokeId === pt.strokeId) {
      const px = prev.x * canvasWidth;
      const py = prev.y * canvasHeight;
      liveGraphics.lineStyle({ width: lineWidth, color, alpha, cap: 1 /* ROUND */ });
      liveGraphics.moveTo(px, py);
      liveGraphics.lineTo(x, y);
      liveGraphics.lineStyle(0);
    } else {
      // First point of a stroke — draw a dot so single clicks are visible
      liveGraphics.beginFill(color, alpha);
      liveGraphics.drawCircle(x, y, lineWidth / 2);
      liveGraphics.endFill();
    }
  }
}

// ── Pointer input → stream ───────────────────────────────────────────

export function usePointerInput(
  appRef: React.MutableRefObject<any>,
  streamFn: (name: string, input: any) => void,
  brushColor: string,
  brushSize: number,
  canvasWidth: number,
  canvasHeight: number,
  PIXI: any,
) {
  const drawingRef = React.useRef(false);
  const colorRef = React.useRef(brushColor);
  const sizeRef = React.useRef(brushSize);
  const lastSendRef = React.useRef(0);
  const strokeIdRef = React.useRef("");

  React.useEffect(() => { colorRef.current = brushColor; }, [brushColor]);
  React.useEffect(() => { sizeRef.current = brushSize; }, [brushSize]);

  React.useEffect(() => {
    const app = appRef.current;
    if (!app || !PIXI) return;

    const view = app.view as HTMLCanvasElement;
    // Minimum interval between sends (ms). ~16ms = 60fps ceiling,
    // keeps us well under the server's 60/sec rate limit.
    const MIN_INTERVAL = 16;

    function getPos(e: PointerEvent) {
      const rect = view.getBoundingClientRect();
      return {
        x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
        y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
      };
    }

    function sendStroke(e: PointerEvent) {
      const now = performance.now();
      if (now - lastSendRef.current < MIN_INTERVAL) return; // throttle
      lastSendRef.current = now;

      const pos = getPos(e);
      const pressure = e.pressure > 0 ? e.pressure : 0.5;
      streamFn("brush.stroke", {
        x: pos.x,
        y: pos.y,
        pressure,
        color: colorRef.current,
        size: sizeRef.current,
        strokeId: strokeIdRef.current,
      });
    }

    function onDown(e: PointerEvent) {
      drawingRef.current = true;
      // New stroke — generate a unique ID so we know which points connect
      strokeIdRef.current = Math.random().toString(36).slice(2, 10);
      view.setPointerCapture(e.pointerId);
      // Always send the first point (reset throttle)
      lastSendRef.current = 0;
      sendStroke(e);
    }

    function onMove(e: PointerEvent) {
      if (!drawingRef.current) return;
      sendStroke(e);
    }

    function onUp() {
      drawingRef.current = false;
    }

    view.addEventListener("pointerdown", onDown);
    view.addEventListener("pointermove", onMove);
    view.addEventListener("pointerup", onUp);
    view.addEventListener("pointerleave", onUp);

    return () => {
      view.removeEventListener("pointerdown", onDown);
      view.removeEventListener("pointermove", onMove);
      view.removeEventListener("pointerup", onUp);
      view.removeEventListener("pointerleave", onUp);
    };
  }, [appRef, streamFn, PIXI]);
}

// ── Auto-commit when buffer is large ─────────────────────────────────

export function useAutoCommit(
  bufferLength: number,
  callTool: (name: string, input: any) => Promise<any>,
  threshold: number = 200,
) {
  const commitInProgressRef = React.useRef(false);

  React.useEffect(() => {
    if (bufferLength >= threshold && !commitInProgressRef.current) {
      commitInProgressRef.current = true;
      callTool("canvas.commit", {})
        .catch(() => {})
        .finally(() => {
          commitInProgressRef.current = false;
        });
    }
  }, [bufferLength, callTool, threshold]);
}

// ── Toolbar ──────────────────────────────────────────────────────────

const COLOR_PRESETS = [
  "#000000", "#ffffff", "#ef4444", "#f97316", "#eab308", "#22c55e",
  "#06b6d4", "#3b82f6", "#6366f1", "#8b5cf6", "#ec4899", "#94a3b8",
];

export function Toolbar({
  brushColor,
  setBrushColor,
  brushSize,
  setBrushSize,
  onClear,
  onCommit,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  uncommitted,
}: {
  brushColor: string;
  setBrushColor: (c: string) => void;
  brushSize: number;
  setBrushSize: (s: number) => void;
  onClear: () => void;
  onCommit: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  uncommitted: number;
}) {
  return (
    <div
      style={{
        width: 200,
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 16,
        background: "#111113",
        borderRight: "1px solid #1e1e24",
        overflowY: "auto",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          fontSize: 12,
          fontWeight: 700,
          color: "#6b6b80",
          textTransform: "uppercase" as const,
          letterSpacing: "0.06em",
        }}
      >
        Brush
      </div>

      <ColorPicker
        value={brushColor}
        onChange={setBrushColor}
        presets={COLOR_PRESETS}
      />

      <Slider
        value={brushSize}
        onChange={setBrushSize}
        min={1}
        max={50}
        step={1}
        label="Size"
      />

      {/* Brush preview */}
      <div style={{ display: "flex", justifyContent: "center", padding: 8 }}>
        <div
          style={{
            width: Math.max(4, brushSize * 2),
            height: Math.max(4, brushSize * 2),
            borderRadius: "50%",
            backgroundColor: brushColor,
            border: "1px solid #334155",
          }}
        />
      </div>

      <div
        style={{
          fontSize: 12,
          fontWeight: 700,
          color: "#6b6b80",
          textTransform: "uppercase" as const,
          letterSpacing: "0.06em",
        }}
      >
        Actions
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <Button onClick={onUndo} disabled={!canUndo} variant="ghost" size="sm">
          Undo
        </Button>
        <Button onClick={onRedo} disabled={!canRedo} variant="ghost" size="sm">
          Redo
        </Button>
      </div>

      {uncommitted > 0 && (
        <Button onClick={onCommit} variant="secondary" size="sm">
          Commit ({uncommitted})
        </Button>
      )}

      <Button onClick={onClear} variant="danger" size="sm">
        Clear Canvas
      </Button>
    </div>
  );
}

// ── Participant Bar ──────────────────────────────────────────────────

export function ParticipantBar({
  participants,
  canvasInfo,
}: {
  participants: string[];
  canvasInfo: { width: number; height: number; strokes: number };
}) {
  const parsed = useParticipants(participants);

  return (
    <div
      style={{
        height: 40,
        padding: "0 16px",
        display: "flex",
        alignItems: "center",
        gap: 12,
        background: "#111113",
        borderBottom: "1px solid #1e1e24",
        fontSize: 12,
        color: "#6b6b80",
        flexShrink: 0,
      }}
    >
      <span style={{ fontWeight: 700, color: "#e2e2e8" }}>
        Collaborative Paint
      </span>
      <span>
        {canvasInfo.width}x{canvasInfo.height}
      </span>
      <span>{canvasInfo.strokes} strokes</span>
      <div style={{ flex: 1 }} />
      {parsed.map((p) => (
        <Badge
          key={p.id}
          color={p.type === "ai" ? "purple" : "blue"}
        >
          {p.type === "ai" ? "AI " : ""}
          {p.username}
        </Badge>
      ))}
    </div>
  );
}
