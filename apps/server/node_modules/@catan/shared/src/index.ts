export const ROOM_CREATE = "ROOM_CREATE" as const;
export const ROOM_JOIN = "ROOM_JOIN" as const;
export const STATE_SYNC = "STATE_SYNC" as const;
export const ROOM_ERROR = "ROOM_ERROR" as const;

export type PlayerSummary = {
  playerId: string;
  name: string;
};

export type RoomPhase = "lobby";

export type RoomState = {
  roomId: string;
  phase: RoomPhase;
  players: PlayerSummary[];
};

export type StateSyncPayload = {
  roomId: string;
  you: { playerId: string };
  state: RoomState;
};

export type RoomErrorPayload = {
  message: string;
};

export type RoomCreateReq = {
  name: string;
};

export type RoomJoinReq = {
  roomId: string;
  name: string;
};
