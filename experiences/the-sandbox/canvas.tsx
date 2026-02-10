import React from "react";
import {
  SceneRenderer,
  ChatPanel,
  ReportBug,
  useSceneTweens,
  useParticleTick,
  useSceneInteraction,
  useSceneDrag,
  useRuleTick,
  createScene,
  nodeById,
} from "@vibevibes/sdk";
import { WorldHUD } from "./components";

const { useCallback } = React;

// ── Canvas ────────────────────────────────────────────────────────────────────

export function Canvas(props: any) {
  const {
    sharedState,
    callTool,
    actorId,
    participants,
    ephemeralState,
    setEphemeral,
  } = props;

  // Scene graph
  const scene = sharedState._scene ?? createScene({ width: 800, height: 600, background: "#0a0a0a" });

  // Rules
  const rules = sharedState._rules ?? [];
  const worldMeta = sharedState._worldMeta ?? {
    name: "",
    description: "",
    paused: false,
    tickSpeed: 100,
  };

  // Spawned rooms registry
  const rooms = sharedState._rooms ?? {};

  // Pipeline: scene → tweens → particles → rules
  const tweened = useSceneTweens(scene);
  const particled = useParticleTick(tweened);
  const { simulatedScene, stats } = useRuleTick(particled, rules, worldMeta, callTool);

  // Interaction hooks
  const interaction = useSceneInteraction();
  const drag = useSceneDrag(callTool);

  // Portal navigation — when a portal node is clicked, navigate to its room
  const handleNodeClick = useCallback((nodeId: string, event: { x: number; y: number }) => {
    const node = nodeById(simulatedScene, nodeId);
    if (node?.data?.entityType === "portal") {
      const targetRoom = node.data.targetRoom;
      if (!targetRoom) return;

      const roomEntry = rooms[targetRoom];
      const url = roomEntry?.url || `?room=${targetRoom}`;
      window.location.href = url;
      return;
    }

    interaction.onNodeClick(nodeId, event);
  }, [simulatedScene, rooms, interaction.onNodeClick]);

  return React.createElement("div", {
    style: {
      width: "100vw",
      height: "100vh",
      background: "#0a0a0a",
      position: "relative",
      overflow: "hidden",
    },
  },
    // Scene renderer
    React.createElement(SceneRenderer, {
      scene: simulatedScene,
      width: scene.width ?? 800,
      height: scene.height ?? 600,
      style: { width: "100%", height: "100%" },
      onNodeClick: handleNodeClick,
      onNodeHover: interaction.onNodeHover,
      onNodeDragStart: drag.onNodeDragStart,
      onNodeDrag: drag.onNodeDrag,
      onNodeDragEnd: drag.onNodeDragEnd,
    }),

    // World HUD
    React.createElement(WorldHUD, {
      worldMeta,
      ruleCount: rules.length,
      stats,
    }),

    // Chat
    React.createElement(ChatPanel, {
      sharedState,
      callTool,
      actorId,
      ephemeralState,
      setEphemeral,
      participants,
    }),

    // Bug report
    React.createElement(ReportBug, {
      callTool,
      actorId,
    }),
  );
}
