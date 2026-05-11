import { describe, it, expect } from "vitest";
import {
  createEmptyBoard,
  toggleFlag,
  chordReveal,
  generateBoard,
  revealCell,
  type Board,
} from "../minesweeper";

function setStates(b: Board, entries: Array<[number, number, Board[number][number]["state"]]>): Board {
  const next: Board = b.map(row => row.map(c => ({ ...c })));
  for (const [r, c, state] of entries) next[r][c].state = state;
  return next;
}

describe("toggleFlag", () => {
  it("toggles unrevealed -> flagged -> unrevealed when questionMarks is off", () => {
    const empty = createEmptyBoard();
    const flagged = toggleFlag(empty, 0, 0);
    expect(flagged[0][0].state).toBe("flagged");
    const unflagged = toggleFlag(flagged, 0, 0);
    expect(unflagged[0][0].state).toBe("unrevealed");
  });

  it("treats existing question state as unrevealed when questionMarks is off", () => {
    const empty = createEmptyBoard();
    const withQuestion = setStates(empty, [[0, 0, "question"]]);
    const result = toggleFlag(withQuestion, 0, 0, { questionMarks: false });
    expect(result[0][0].state).toBe("flagged");
  });

  it("cycles unrevealed -> flagged -> question -> unrevealed when questionMarks is on", () => {
    const empty = createEmptyBoard();
    const a = toggleFlag(empty, 1, 1, { questionMarks: true });
    expect(a[1][1].state).toBe("flagged");
    const b = toggleFlag(a, 1, 1, { questionMarks: true });
    expect(b[1][1].state).toBe("question");
    const c = toggleFlag(b, 1, 1, { questionMarks: true });
    expect(c[1][1].state).toBe("unrevealed");
  });

  it("does nothing on revealed cells", () => {
    const board = revealCell(generateBoard(0, 0), 0, 0);
    let r = -1, c = -1;
    outer: for (let i = 0; i < board.length; i++) {
      for (let j = 0; j < board[i].length; j++) {
        if (board[i][j].state === "revealed") { r = i; c = j; break outer; }
      }
    }
    expect(r).toBeGreaterThanOrEqual(0);
    const after = toggleFlag(board, r, c, { questionMarks: true });
    expect(after[r][c].state).toBe("revealed");
    expect(after).toBe(board);
  });
});

describe("chordReveal with question marks", () => {
  it("does not count question cells as flags", () => {
    const synth: Board = [
      [{ isMine: true,  adjacentMines: 0, state: "question"  }, { isMine: false, adjacentMines: 1, state: "unrevealed" }, { isMine: false, adjacentMines: 0, state: "unrevealed" }],
      [{ isMine: false, adjacentMines: 1, state: "unrevealed" }, { isMine: false, adjacentMines: 1, state: "revealed"   }, { isMine: false, adjacentMines: 0, state: "unrevealed" }],
      [{ isMine: false, adjacentMines: 0, state: "unrevealed" }, { isMine: false, adjacentMines: 0, state: "unrevealed" }, { isMine: false, adjacentMines: 0, state: "unrevealed" }],
    ];
    expect(chordReveal(synth, 1, 1)).toBeNull();
  });

  it("includes question cells in unrevealed neighbors when chord conditions are met", () => {
    const synth: Board = [
      [{ isMine: true,  adjacentMines: 0, state: "flagged"   }, { isMine: false, adjacentMines: 1, state: "question" }, { isMine: false, adjacentMines: 0, state: "unrevealed" }],
      [{ isMine: false, adjacentMines: 1, state: "unrevealed" }, { isMine: false, adjacentMines: 1, state: "revealed" }, { isMine: false, adjacentMines: 0, state: "unrevealed" }],
      [{ isMine: false, adjacentMines: 0, state: "unrevealed" }, { isMine: false, adjacentMines: 0, state: "unrevealed" }, { isMine: false, adjacentMines: 0, state: "unrevealed" }],
    ];
    const result = chordReveal(synth, 1, 1);
    expect(result).not.toBeNull();
    expect(result!.hit).toBe(false);
    expect(result!.board[0][1].state).toBe("revealed");
  });
});
