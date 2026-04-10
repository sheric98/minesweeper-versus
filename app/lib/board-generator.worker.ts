import { generateSolvableBoard } from "./board-generator";
import type { NoGuessDifficulty } from "@/app/components/DifficultySelector";

export interface BoardWorkerRequest {
  startRow: number;
  startCol: number;
  difficulty: NoGuessDifficulty;
}

self.onmessage = (e: MessageEvent<BoardWorkerRequest>) => {
  const { startRow, startCol, difficulty } = e.data;
  const result = generateSolvableBoard(startRow, startCol, difficulty);
  self.postMessage({ board: result.board });
};
