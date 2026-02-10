export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export const WORLD_W = 800;
export const WORLD_H = 600;

export const ENTITY_COLORS: Record<string, string> = {
  player: "#3b82f6",
  ai: "#a855f7",
  tree: "#22c55e",
  rock: "#6b7280",
  water: "#06b6d4",
  flower: "#f472b6",
  house: "#f59e0b",
  creature: "#ef4444",
};

export function entityColor(type: string): string {
  return ENTITY_COLORS[type] || "#e5e5e5";
}
