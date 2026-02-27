import type { Board } from "./minesweeper";

// WebSocket connection state (shared by mock and production hooks)
export type ConnectionState = "connecting" | "connected" | "reconnecting" | "disconnected";

// Match lifecycle
export type MatchState = "lobby" | "countdown" | "playing" | "finished";

// Replay log entry for server-side validation
export type ClickLogEntry = {
  type: "reveal" | "chord" | "flag";
  row: number;
  col: number;
  ts: number;
};

// Client → Server messages
export type ClientMessage =
  | {
      type: "reveal";
      row: number;
      col: number;
      resultCells: { row: number; col: number }[];
    }
  | { type: "hit_mine"; row: number; col: number; deathCount: number }
  | {
      type: "chord";
      row: number;
      col: number;
      resultCells: { row: number; col: number }[];
    }
  | { type: "game_complete"; timeMs: number; clickLog: ClickLogEntry[] };

// Server → Client messages
export type ServerMessage =
  | {
      type: "match_found";
      matchId: string;
      opponent: string;
      startingSquare: [number, number];
    }
  | { type: "countdown"; secondsRemaining: number }
  | { type: "game_start"; board: string } // obfuscated board
  | {
      type: "opponent_progress";
      cells: { row: number; col: number }[];
      revealedCount: number;
    }
  | { type: "opponent_hit_mine"; deathCount: number }
  | {
      type: "game_over";
      winner: string;
      yourTimeMs: number;
      opponentTimeMs: number;
    }
  | { type: "opponent_disconnected" };

// Multiplayer game state managed by MultiplayerGame component
export interface MultiplayerGameState {
  matchState: MatchState;
  board: Board | null;
  opponentRevealed: Set<string>; // "row-col" keys for opponent mini-board
  opponentRevealedCount: number;
  countdownSeconds: number;
  cooldownMs: number; // remaining cooldown (0 = not in cooldown)
  deathCount: number;
  elapsedSeconds: number;
  clickLog: ClickLogEntry[];
}
