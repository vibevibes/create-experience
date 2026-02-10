import React from "react";
import type { ExperienceInfo, RoomInfo } from "./types";
import { ExperienceCard, Spinner } from "./components";

const SERVER = typeof window !== "undefined" ? window.location.origin : "http://localhost:4321";

export function Canvas(props: any) {
  const [experiences, setExperiences] = React.useState<ExperienceInfo[]>([]);
  const [rooms, setRooms] = React.useState<RoomInfo[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [launching, setLaunching] = React.useState<string | null>(null);

  // Fetch experience list and active rooms
  React.useEffect(() => {
    async function load() {
      try {
        const [expRes, roomRes] = await Promise.all([
          fetch(`${SERVER}/experiences`).then((r) => r.json()),
          fetch(`${SERVER}/rooms`).then((r) => r.json()),
        ]);
        setExperiences(
          Array.isArray(expRes)
            ? expRes.filter((e: ExperienceInfo) => e.id !== "experience-library")
            : [],
        );
        setRooms(
          Array.isArray(roomRes)
            ? roomRes
                .filter((r: any) => r.roomId !== "local")
                .map((r: any) => ({
                  roomId: r.roomId,
                  experienceId: r.experienceId,
                  experienceTitle: r.experienceTitle,
                  participantCount: r.participantCount,
                }))
            : [],
        );
      } catch (err) {
        console.error("Failed to load library:", err);
      }
      setLoading(false);
    }
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, []);

  async function spawnExperience(experienceId: string) {
    setLaunching(experienceId);
    try {
      const res = await fetch(`${SERVER}/rooms/spawn`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ experienceId, sourceRoomId: "library" }),
      });
      const data = await res.json();
      if (data.error) {
        console.error("Spawn failed:", data.error);
        setLaunching(null);
        return;
      }
      // Navigate browser to the spawned room
      const q = new URLSearchParams(window.location.search);
      q.set("room", data.roomId);
      window.location.search = q.toString();
    } catch (err) {
      console.error("Spawn failed:", err);
      setLaunching(null);
    }
  }

  function joinRoom(roomId: string) {
    const q = new URLSearchParams(window.location.search);
    q.set("room", roomId);
    window.location.search = q.toString();
  }

  if (loading) return <Spinner />;

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        background: "#0a0a0a",
        overflowY: "auto",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "40px 24px" }}>
        <h1
          style={{
            fontSize: 24,
            fontWeight: 700,
            color: "#e2e2e8",
            marginBottom: 6,
          }}
        >
          vibevibes
        </h1>
        <p style={{ fontSize: 13, color: "#6b6b80", marginBottom: 32 }}>
          Pick an experience. Humans and AI, together.
        </p>

        {launching && (
          <div
            style={{
              padding: "10px 16px",
              background: "#1e1e2e",
              borderRadius: 8,
              color: "#6366f1",
              fontSize: 13,
              marginBottom: 16,
            }}
          >
            Launching {launching}...
          </div>
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr",
            gap: 10,
          }}
        >
          {experiences.map((exp) => (
            <ExperienceCard
              key={exp.id}
              exp={exp}
              activeRooms={rooms.filter((r) => r.experienceId === exp.id)}
              onLaunch={() => spawnExperience(exp.id)}
              onJoinRoom={joinRoom}
            />
          ))}
        </div>

        {experiences.length === 0 && (
          <div style={{ color: "#4a4a5a", fontSize: 13, padding: "24px 0" }}>
            No experiences found. Add some to experiences/ and restart.
          </div>
        )}
      </div>
    </div>
  );
}
