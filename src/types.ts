export type ExperienceInfo = {
  id: string;
  title: string;
  description: string;
  source: "host" | "registry";
  loaded: boolean;
  hasRoomConfig: boolean;
};

export type RoomInfo = {
  roomId: string;
  experienceId: string;
  experienceTitle: string;
  participantCount: number;
};

export type LibraryState = {
  _chat: any[];
};
