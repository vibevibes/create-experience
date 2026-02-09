import { defineExperience, defineTool, Button, Stack } from "@vibevibes/sdk";
import { z } from "zod";
import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";

// Default camera position for new participants
const DEFAULT_CAMERA = {
  position: { x: 5, y: 5, z: 5 },
  lookAt: { x: 0, y: 0, z: 0 },
};

// Canvas Component - renders the 3D scene from each participant's POV
function Canvas({ actorId, sharedState, callTool, ephemeralState, setEphemeral, participants }: any) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);

  const [showControls, setShowControls] = useState(true);
  const [objectType, setObjectType] = useState<"box" | "sphere" | "cylinder">("box");

  // Get this participant's camera settings from ephemeral state
  const myCamera = ephemeralState[actorId]?.camera || DEFAULT_CAMERA;

  // Camera movement handlers
  const moveCamera = (dx: number, dy: number, dz: number) => {
    const newCamera = {
      position: {
        x: myCamera.position.x + dx,
        y: myCamera.position.y + dy,
        z: myCamera.position.z + dz,
      },
      lookAt: myCamera.lookAt,
    };
    setEphemeral({ camera: newCamera });
  };

  const rotateCamera = (angle: number) => {
    const centerX = myCamera.lookAt.x;
    const centerZ = myCamera.lookAt.z;
    const radius = Math.sqrt(
      Math.pow(myCamera.position.x - centerX, 2) +
      Math.pow(myCamera.position.z - centerZ, 2)
    );
    const currentAngle = Math.atan2(
      myCamera.position.z - centerZ,
      myCamera.position.x - centerX
    );
    const newAngle = currentAngle + (angle * Math.PI) / 180;

    const newCamera = {
      position: {
        x: centerX + radius * Math.cos(newAngle),
        y: myCamera.position.y,
        z: centerZ + radius * Math.sin(newAngle),
      },
      lookAt: myCamera.lookAt,
    };
    setEphemeral({ camera: newCamera });
  };

  const addObject = async () => {
    await callTool("object.add", {
      type: objectType,
      x: myCamera.lookAt.x,
      y: myCamera.lookAt.y,
      z: myCamera.lookAt.z,
      size: 1,
      color: ["#ff0000", "#00ff00", "#0000ff", "#ffff00", "#ff00ff"][Math.floor(Math.random() * 5)],
    });
  };

  // Initialize Three.js scene
  useEffect(() => {
    if (!containerRef.current) return;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 10, 10);
    scene.add(directionalLight);

    // Grid helper
    const gridHelper = new THREE.GridHelper(20, 20, 0x444444, 0x222222);
    scene.add(gridHelper);

    // Add some objects from shared state
    const objects = sharedState.objects || [];
    objects.forEach((obj: any) => {
      let mesh: THREE.Mesh;

      switch (obj.type) {
        case "box":
          mesh = new THREE.Mesh(
            new THREE.BoxGeometry(obj.size, obj.size, obj.size),
            new THREE.MeshStandardMaterial({ color: obj.color })
          );
          break;
        case "sphere":
          mesh = new THREE.Mesh(
            new THREE.SphereGeometry(obj.size / 2, 32, 32),
            new THREE.MeshStandardMaterial({ color: obj.color })
          );
          break;
        case "cylinder":
          mesh = new THREE.Mesh(
            new THREE.CylinderGeometry(obj.size / 2, obj.size / 2, obj.size, 32),
            new THREE.MeshStandardMaterial({ color: obj.color })
          );
          break;
        default:
          return;
      }

      mesh.position.set(obj.position.x, obj.position.y, obj.position.z);
      mesh.rotation.set(obj.rotation.x, obj.rotation.y, obj.rotation.z);
      scene.add(mesh);
    });

    // Handle window resize
    const handleResize = () => {
      if (!cameraRef.current || !rendererRef.current) return;
      cameraRef.current.aspect = window.innerWidth / window.innerHeight;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener("resize", handleResize);

    // Keyboard controls
    const handleKeyDown = (e: KeyboardEvent) => {
      const step = 1;
      switch (e.key.toLowerCase()) {
        case "w": moveCamera(0, 0, -step); break;
        case "s": moveCamera(0, 0, step); break;
        case "a": moveCamera(-step, 0, 0); break;
        case "d": moveCamera(step, 0, 0); break;
        case "q": moveCamera(0, step, 0); break;
        case "e": moveCamera(0, -step, 0); break;
        case "arrowleft": rotateCamera(-15); break;
        case "arrowright": rotateCamera(15); break;
        case " ": e.preventDefault(); addObject(); break;
        case "h": setShowControls(prev => !prev); break;
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    // Animation loop
    let animationId: number;
    const animate = () => {
      animationId = requestAnimationFrame(animate);
      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
    };
    animate();

    // Initialize ephemeral camera if not set
    if (!ephemeralState[actorId]?.camera) {
      setEphemeral({ camera: DEFAULT_CAMERA });
    }

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("keydown", handleKeyDown);
      if (rendererRef.current && containerRef.current) {
        containerRef.current.removeChild(rendererRef.current.domElement);
      }
    };
  }, [myCamera, objectType]);

  // Update camera position when ephemeral state changes
  useEffect(() => {
    if (cameraRef.current) {
      cameraRef.current.position.set(
        myCamera.position.x,
        myCamera.position.y,
        myCamera.position.z
      );
      cameraRef.current.lookAt(
        myCamera.lookAt.x,
        myCamera.lookAt.y,
        myCamera.lookAt.z
      );
    }
  }, [myCamera]);

  // Update objects when shared state changes
  useEffect(() => {
    if (!sceneRef.current) return;

    // Clear existing objects (except lights and grid)
    const objectsToRemove = sceneRef.current.children.filter(
      (child) => child instanceof THREE.Mesh && !(child instanceof THREE.GridHelper)
    );
    objectsToRemove.forEach((obj) => sceneRef.current!.remove(obj));

    // Add new objects
    const objects = sharedState.objects || [];
    objects.forEach((obj: any) => {
      let mesh: THREE.Mesh;

      switch (obj.type) {
        case "box":
          mesh = new THREE.Mesh(
            new THREE.BoxGeometry(obj.size, obj.size, obj.size),
            new THREE.MeshStandardMaterial({ color: obj.color })
          );
          break;
        case "sphere":
          mesh = new THREE.Mesh(
            new THREE.SphereGeometry(obj.size / 2, 32, 32),
            new THREE.MeshStandardMaterial({ color: obj.color })
          );
          break;
        case "cylinder":
          mesh = new THREE.Mesh(
            new THREE.CylinderGeometry(obj.size / 2, obj.size / 2, obj.size, 32),
            new THREE.MeshStandardMaterial({ color: obj.color })
          );
          break;
        default:
          return;
      }

      mesh.position.set(obj.position.x, obj.position.y, obj.position.z);
      mesh.rotation.set(obj.rotation.x, obj.rotation.y, obj.rotation.z);
      sceneRef.current!.add(mesh);
    });
  }, [sharedState.objects]);

  return (
    <div style={{ position: "relative", width: "100vw", height: "100vh", overflow: "hidden" }}>
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />

      {/* Info overlay */}
      <div style={{
        position: "absolute",
        top: 20,
        left: 20,
        background: "rgba(0,0,0,0.85)",
        color: "white",
        padding: "15px",
        borderRadius: "8px",
        fontFamily: "monospace",
        fontSize: "13px",
        maxWidth: "300px",
      }}>
        <div style={{ marginBottom: "10px" }}>
          <strong style={{ fontSize: "15px" }}>Your POV: {actorId}</strong>
        </div>
        <div>Camera: ({myCamera.position.x.toFixed(1)}, {myCamera.position.y.toFixed(1)}, {myCamera.position.z.toFixed(1)})</div>
        <div>Objects: {sharedState.objects?.length || 0}</div>
        <div>Participants: {participants.length}</div>
      </div>

      {/* Interactive Controls */}
      {showControls && (
        <div style={{
          position: "absolute",
          bottom: 20,
          left: 20,
          background: "rgba(0,0,0,0.85)",
          color: "white",
          padding: "20px",
          borderRadius: "12px",
          fontFamily: "system-ui, sans-serif",
          fontSize: "13px",
          minWidth: "280px",
        }}>
          <div style={{ marginBottom: "15px" }}>
            <strong style={{ fontSize: "15px" }}>Controls</strong>
            <button
              onClick={() => setShowControls(false)}
              style={{
                float: "right",
                background: "transparent",
                border: "1px solid #555",
                color: "#aaa",
                borderRadius: "4px",
                padding: "2px 8px",
                cursor: "pointer",
                fontSize: "11px",
              }}
            >
              Hide (H)
            </button>
          </div>

          {/* Camera Movement */}
          <div style={{ marginBottom: "15px" }}>
            <div style={{ color: "#888", marginBottom: "8px", fontSize: "11px" }}>CAMERA MOVEMENT</div>
            <Stack direction="column" gap="8px">
              <Stack direction="row" gap="4px">
                <Button onClick={() => moveCamera(0, 1, 0)} size="sm" style={{ flex: 1, padding: "8px", fontSize: "11px" }}>↑ Up (Q)</Button>
                <Button onClick={() => moveCamera(0, -1, 0)} size="sm" style={{ flex: 1, padding: "8px", fontSize: "11px" }}>↓ Down (E)</Button>
              </Stack>
              <Stack direction="row" gap="4px">
                <Button onClick={() => moveCamera(-1, 0, 0)} size="sm" style={{ flex: 1, padding: "8px", fontSize: "11px" }}>← Left (A)</Button>
                <Button onClick={() => moveCamera(1, 0, 0)} size="sm" style={{ flex: 1, padding: "8px", fontSize: "11px" }}>→ Right (D)</Button>
              </Stack>
              <Stack direction="row" gap="4px">
                <Button onClick={() => moveCamera(0, 0, -1)} size="sm" style={{ flex: 1, padding: "8px", fontSize: "11px" }}>Forward (W)</Button>
                <Button onClick={() => moveCamera(0, 0, 1)} size="sm" style={{ flex: 1, padding: "8px", fontSize: "11px" }}>Back (S)</Button>
              </Stack>
              <Stack direction="row" gap="4px">
                <Button onClick={() => rotateCamera(-15)} size="sm" style={{ flex: 1, padding: "8px", fontSize: "11px" }}>⟲ Rotate Left</Button>
                <Button onClick={() => rotateCamera(15)} size="sm" style={{ flex: 1, padding: "8px", fontSize: "11px" }}>⟳ Rotate Right</Button>
              </Stack>
            </Stack>
          </div>

          {/* Object Spawning */}
          <div>
            <div style={{ color: "#888", marginBottom: "8px", fontSize: "11px" }}>ADD OBJECTS</div>
            <Stack direction="row" gap="4px" style={{ marginBottom: "8px" }}>
              <button
                onClick={() => setObjectType("box")}
                style={{
                  flex: 1,
                  padding: "6px",
                  background: objectType === "box" ? "#6366f1" : "#333",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer",
                  fontSize: "11px",
                }}
              >
                Box
              </button>
              <button
                onClick={() => setObjectType("sphere")}
                style={{
                  flex: 1,
                  padding: "6px",
                  background: objectType === "sphere" ? "#6366f1" : "#333",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer",
                  fontSize: "11px",
                }}
              >
                Sphere
              </button>
              <button
                onClick={() => setObjectType("cylinder")}
                style={{
                  flex: 1,
                  padding: "6px",
                  background: objectType === "cylinder" ? "#6366f1" : "#333",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer",
                  fontSize: "11px",
                }}
              >
                Cylinder
              </button>
            </Stack>
            <Button onClick={addObject} style={{ width: "100%", padding: "10px", fontSize: "12px" }}>
              Add {objectType.charAt(0).toUpperCase() + objectType.slice(1)} (Space)
            </Button>
          </div>

          <div style={{ marginTop: "12px", fontSize: "10px", color: "#666", borderTop: "1px solid #333", paddingTop: "8px" }}>
            Press H to toggle controls • Arrow keys to rotate
          </div>
        </div>
      )}

      {/* Show controls button when hidden */}
      {!showControls && (
        <button
          onClick={() => setShowControls(true)}
          style={{
            position: "absolute",
            bottom: 20,
            left: 20,
            background: "rgba(0,0,0,0.7)",
            color: "white",
            border: "1px solid #555",
            borderRadius: "8px",
            padding: "10px 16px",
            cursor: "pointer",
            fontSize: "12px",
          }}
        >
          Show Controls (H)
        </button>
      )}
    </div>
  );
}

// Tools for camera control and object manipulation
const tools = [
  defineTool({
    name: "camera.set_position",
    description: "Set camera position for the calling agent. Each participant has their own camera POV.",
    input_schema: z.object({
      x: z.number().describe("X coordinate"),
      y: z.number().describe("Y coordinate"),
      z: z.number().describe("Z coordinate"),
    }),
    handler: async (ctx, input) => {
      // This updates the agent's ephemeral state, not shared state
      // The framework will handle ephemeral state updates automatically
      // We'll return the new camera position
      const newCamera = {
        position: { x: input.x, y: input.y, z: input.z },
        lookAt: ctx.memory.camera?.lookAt || { x: 0, y: 0, z: 0 },
      };

      ctx.setMemory({ camera: newCamera });

      return {
        success: true,
        camera: newCamera,
        message: `Camera moved to (${input.x}, ${input.y}, ${input.z})`,
      };
    },
  }),

  defineTool({
    name: "camera.look_at",
    description: "Set what point the camera is looking at",
    input_schema: z.object({
      x: z.number().describe("X coordinate to look at"),
      y: z.number().describe("Y coordinate to look at"),
      z: z.number().describe("Z coordinate to look at"),
    }),
    handler: async (ctx, input) => {
      const currentCamera = ctx.memory.camera || DEFAULT_CAMERA;
      const newCamera = {
        position: currentCamera.position,
        lookAt: { x: input.x, y: input.y, z: input.z },
      };

      ctx.setMemory({ camera: newCamera });

      return {
        success: true,
        camera: newCamera,
        message: `Camera now looking at (${input.x}, ${input.y}, ${input.z})`,
      };
    },
  }),

  defineTool({
    name: "camera.orbit",
    description: "Orbit camera around a point at a given radius and angle",
    input_schema: z.object({
      centerX: z.number().default(0).describe("X coordinate of orbit center"),
      centerY: z.number().default(0).describe("Y coordinate of orbit center"),
      centerZ: z.number().default(0).describe("Z coordinate of orbit center"),
      radius: z.number().default(5).describe("Distance from center"),
      angleY: z.number().describe("Horizontal angle in degrees (0-360)"),
      height: z.number().default(5).describe("Height of camera above center"),
    }),
    handler: async (ctx, input) => {
      const angleRad = (input.angleY * Math.PI) / 180;
      const x = input.centerX + input.radius * Math.cos(angleRad);
      const z = input.centerZ + input.radius * Math.sin(angleRad);
      const y = input.centerY + input.height;

      const newCamera = {
        position: { x, y, z },
        lookAt: { x: input.centerX, y: input.centerY, z: input.centerZ },
      };

      ctx.setMemory({ camera: newCamera });

      return {
        success: true,
        camera: newCamera,
        message: `Camera orbiting at ${input.angleY}° around (${input.centerX}, ${input.centerY}, ${input.centerZ})`,
      };
    },
  }),

  defineTool({
    name: "object.add",
    description: "Add a 3D object to the shared scene",
    input_schema: z.object({
      type: z.enum(["box", "sphere", "cylinder"]).describe("Type of object"),
      x: z.number().describe("X position"),
      y: z.number().describe("Y position"),
      z: z.number().describe("Z position"),
      size: z.number().default(1).describe("Size of the object"),
      color: z.string().default("#3498db").describe("Hex color (e.g. #ff0000)"),
    }),
    handler: async (ctx, input) => {
      const objects = ctx.state.objects || [];
      const newObject = {
        id: `obj-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: input.type,
        position: { x: input.x, y: input.y, z: input.z },
        rotation: { x: 0, y: 0, z: 0 },
        size: input.size,
        color: input.color,
        createdBy: ctx.actorId,
        createdAt: ctx.timestamp,
      };

      ctx.setState({
        ...ctx.state,
        objects: [...objects, newObject],
      });

      return {
        success: true,
        object: newObject,
        message: `Added ${input.type} at (${input.x}, ${input.y}, ${input.z})`,
      };
    },
  }),

  defineTool({
    name: "object.remove",
    description: "Remove a 3D object by its ID",
    input_schema: z.object({
      id: z.string().describe("Object ID to remove"),
    }),
    handler: async (ctx, input) => {
      const objects = ctx.state.objects || [];
      const filtered = objects.filter((obj: any) => obj.id !== input.id);

      if (filtered.length === objects.length) {
        return {
          success: false,
          message: `Object ${input.id} not found`,
        };
      }

      ctx.setState({
        ...ctx.state,
        objects: filtered,
      });

      return {
        success: true,
        message: `Removed object ${input.id}`,
      };
    },
  }),

  defineTool({
    name: "object.list",
    description: "List all objects in the scene",
    input_schema: z.object({}),
    handler: async (ctx) => {
      const objects = ctx.state.objects || [];
      return {
        count: objects.length,
        objects: objects.map((obj: any) => ({
          id: obj.id,
          type: obj.type,
          position: obj.position,
          size: obj.size,
          color: obj.color,
          createdBy: obj.createdBy,
        })),
      };
    },
  }),
];

export default defineExperience({
  manifest: {
    id: "threejs-pov",
    version: "0.0.1",
    title: "Three.js Multi-POV Experience",
    description: "A 3D scene where each participant (human or agent) has their own camera perspective. Agents can move their camera and add objects to the shared scene.",
    requested_capabilities: [],
  },
  Canvas,
  tools,
});
