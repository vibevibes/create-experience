export type StrokePoint = {
  x: number;
  y: number;
  pressure: number;
  color: string;
  size: number;
  actorId: string;
  ts: number;
  strokeId: string;
};

export type PaintingState = {
  canvasWidth: number;
  canvasHeight: number;
  backgroundColor: string;
  strokeBuffer: StrokePoint[];
  canvasBlobKey: string | null;
  canvasBlobVersion: number;
  totalStrokes: number;
  lastCommitTs: number;
  _chat: any[];
};
