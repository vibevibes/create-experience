export function emojiForExperience(id: string): string {
  const map: Record<string, string> = {
    "collaborative-paint": "\u{1f58c}",
    "the-sandbox": "\u{1f3d7}",
    "card-game-vibes": "\u{1f0cf}",
    "card-game": "\u{1f0cf}",
    "dashboard": "\u{1f4ca}",
    "dungeon-crawl": "\u{1f3f0}",
    "music-jam": "\u{1f3b9}",
    "story-engine": "\u{1f4d6}",
    "two-teams": "\u{2694}",
  };
  return map[id] || "\u{2728}";
}
