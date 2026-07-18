import { describe, it, expect } from "vitest";
import {
  BOARD_PRESETS,
  checkWin,
  countFlags,
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

describe("board size presets", () => {
  it("defines the three classic presets", () => {
    expect(BOARD_PRESETS.beginner).toEqual({ rows: 9, cols: 9, mines: 10 });
    expect(BOARD_PRESETS.intermediate).toEqual({ rows: 16, cols: 16, mines: 40 });
    expect(BOARD_PRESETS.expert).toEqual({ rows: 16, cols: 30, mines: 99 });
  });

  it("createEmptyBoard respects the config", () => {
    const b = createEmptyBoard(BOARD_PRESETS.beginner);
    expect(b.length).toBe(9);
    expect(b[0].length).toBe(9);
  });

  it("createEmptyBoard defaults to expert", () => {
    const b = createEmptyBoard();
    expect(b.length).toBe(16);
    expect(b[0].length).toBe(30);
  });

  it("generateBoard places the configured mine count with a safe first click", () => {
    const b = generateBoard(4, 4, BOARD_PRESETS.beginner);
    expect(b.length).toBe(9);
    expect(b[0].length).toBe(9);
    let mines = 0;
    for (const row of b) for (const cell of row) if (cell.isMine) mines++;
    expect(mines).toBe(10);
    for (let dr = -1; dr <= 1; dr++)
      for (let dc = -1; dc <= 1; dc++)
        expect(b[4 + dr][4 + dc].isMine).toBe(false);
  });

  it("checkWin and countFlags work on non-expert dimensions", () => {
    let b = generateBoard(4, 4, BOARD_PRESETS.beginner);
    // reveal every non-mine cell directly
    b = b.map(row => row.map(c => (c.isMine ? c : { ...c, state: "revealed" as const })));
    expect(checkWin(b)).toBe(true);
    // (0,0) is either a mine (unrevealed, flaggable) or a revealed cell (no-op)
    b = toggleFlag(b, 0, 0);
    expect(countFlags(b)).toBeLessThanOrEqual(1);
  });
});
