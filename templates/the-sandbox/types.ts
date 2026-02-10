export type Vec2 = { x: number; y: number };

export type Entity = {
  id: string;
  type: string;
  pos: Vec2;
  target?: Vec2;
  label?: string;
  status?: "watching" | "idle" | "thinking";
  data?: Record<string, any>;
};

export type Message = {
  id: string;
  actor: string;
  text: string;
  ts: number;
};

export type Battle = {
  id: string;
  playerId: string;
  creatureId: string;
  creatureName: string;
  playerHp: number;
  creatureHp: number;
  playerMaxHp: number;
  creatureMaxHp: number;
  log: string[];
  active: boolean;
};

export type SandboxState = {
  entities: Entity[];
  messages: Message[];
  battles?: Battle[];
};
