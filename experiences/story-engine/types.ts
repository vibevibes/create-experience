// ── Types ────────────────────────────────────────────────────────────────────

export type Passage = {
  id: string;
  author: string;
  text: string;
  mood: string;
  timestamp: number;
};

export type Character = {
  id: string;
  name: string;
  description: string;
  allegiance: string;
  createdBy: string;
};

export type WorldNote = {
  id: string;
  title: string;
  content: string;
  createdBy: string;
  timestamp: number;
};

export type StoryState = {
  title: string;
  genre: string;
  phase: string;
  passages: Passage[];
  characters: Character[];
  worldNotes: WorldNote[];
  _chat: any[];
  _bugReports: any[];
};
