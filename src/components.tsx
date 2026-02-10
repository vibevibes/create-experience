import React from "react";
import type { ExperienceInfo, RoomInfo } from "./types";
import { emojiForExperience } from "./utils";

// ── Experience Card ──────────────────────────────────────────────────

export function ExperienceCard({
  exp,
  activeRooms,
  onLaunch,
  onJoinRoom,
}: {
  exp: ExperienceInfo;
  activeRooms: RoomInfo[];
  onLaunch: () => void;
  onJoinRoom: (roomId: string) => void;
}) {
  const emoji = emojiForExperience(exp.id);

  return (
    <div
      style={{
        background: "#111113",
        border: "1px solid #1e1e24",
        borderRadius: 10,
        padding: "18px 20px",
        cursor: "pointer",
        transition: "border-color 0.15s, background 0.15s, transform 0.1s",
      }}
      onClick={onLaunch}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.borderColor = "#6366f1";
        (e.currentTarget as HTMLDivElement).style.background = "#16161a";
        (e.currentTarget as HTMLDivElement).style.transform = "translateY(-1px)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.borderColor = "#1e1e24";
        (e.currentTarget as HTMLDivElement).style.background = "#111113";
        (e.currentTarget as HTMLDivElement).style.transform = "none";
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 22 }}>{emoji}</span>
        <span style={{ fontSize: 15, fontWeight: 600, color: "#e2e2e8" }}>
          {exp.title}
        </span>
      </div>
      <div
        style={{
          fontSize: 12,
          color: "#6b6b80",
          marginTop: 6,
          lineHeight: 1.5,
        }}
      >
        {exp.description}
      </div>
      {activeRooms && activeRooms.length > 0 && (
        <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
          {activeRooms.map((r) => (
            <span
              key={r.roomId}
              onClick={(e) => {
                e.stopPropagation();
                onJoinRoom(r.roomId);
              }}
              style={{
                fontSize: 11,
                color: "#6366f1",
                background: "#1e1e2e",
                padding: "2px 8px",
                borderRadius: 4,
                cursor: "pointer",
              }}
            >
              {r.roomId} ({r.participantCount} in room)
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Loading spinner ──────────────────────────────────────────────────

export function Spinner() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        gap: 12,
        color: "#94a3b8",
      }}
    >
      <div
        style={{
          width: 28,
          height: 28,
          border: "2px solid #334155",
          borderTopColor: "#6366f1",
          borderRadius: "50%",
          animation: "spin 0.8s linear infinite",
        }}
      />
      <span style={{ fontSize: 13 }}>Loading experiences...</span>
    </div>
  );
}
