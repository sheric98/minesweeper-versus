"use client";

import { useState, useEffect, useLayoutEffect, useCallback, useRef } from "react";
import {
  Board,
  GamePhase,
  MINE_COUNT,
  ROWS,
  COLS,
  createEmptyBoard,
  generateBoard,
  revealCell,
  toggleFlag,
  checkWin,
  revealAllMines,
  countFlags,
  chordReveal,
} from "@/app/lib/minesweeper";
import { decodeBoard } from "@/app/lib/multiplayer-utils";
import { SUNKEN_INNER } from "@/app/lib/win95";
import Header from "@/app/components/Header";
import BoardComponent from "@/app/components/Board";
import Leaderboard from "@/app/components/Leaderboard";
import DifficultySelector, { type NoGuessDifficulty } from "@/app/components/DifficultySelector";

type GameMode = "random" | "no-guess";

function computeSunkCells(
  hovered: { row: number; col: number } | null,
  leftDown: boolean,
  rightDown: boolean,
  board: Board,
  phase: GamePhase,
): Set<string> {
  if (!hovered || !leftDown || phase === "won" || phase === "lost") return new Set();
  const { row, col } = hovered;
  if (rightDown) {
    const sunk = new Set<string>();
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const nr = row + dr;
        const nc = col + dc;
        if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && board[nr][nc].state === "unrevealed") {
          sunk.add(`${nr}-${nc}`);
        }
      }
    }
    return sunk;
  }
  return board[row][col].state === "unrevealed" ? new Set([`${row}-${col}`]) : new Set();
}

interface MinesweeperGameProps {
  authLevel?: "anonymous" | "google";
  username?: string;
  mode?: GameMode;
}

export default function MinesweeperGame({ authLevel, username, mode = "random" }: MinesweeperGameProps) {
  const [board, setBoard] = useState<Board>(() => createEmptyBoard());
  const [phase, setPhase] = useState<GamePhase>("idle");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [sunkCells, setSunkCells] = useState<Set<string>>(new Set());
  const [leaderboardRefreshKey, setLeaderboardRefreshKey] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [difficulty, setDifficulty] = useState<NoGuessDifficulty>("beginner");
  const scoreSubmittedRef = useRef(false);
  const isGeneratingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Stable refs so callbacks never go stale
  const boardRef = useRef(board);
  const phaseRef = useRef(phase);

  // True once both buttons are simultaneously held; clears only on the next fresh press sequence
  const wasChordingRef = useRef(false);

  // Sync refs after every commit (not during render — satisfies react-hooks/refs)
  useLayoutEffect(() => {
    boardRef.current = board;
    phaseRef.current = phase;
    isGeneratingRef.current = isGenerating;
  });

  const showLeaderboard = mode === "random" || mode === "no-guess";

  // Submit score on win
  useEffect(() => {
    if (phase === "won" && authLevel === "google" && showLeaderboard && !scoreSubmittedRef.current) {
      scoreSubmittedRef.current = true;
      fetch("/api/leaderboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ time_seconds: elapsedSeconds, mode, ...(mode === "no-guess" && { difficulty }) }),
      })
        .then(() => setLeaderboardRefreshKey((k) => k + 1))
        .catch(() => {});
    }
  }, [phase, authLevel, elapsedSeconds, mode, showLeaderboard]);

  // Timer: start when playing, stop otherwise
  useEffect(() => {
    if (phase === "playing") {
      timerRef.current = setInterval(() => {
        setElapsedSeconds(s => Math.min(s + 1, 999));
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [phase]);

  const handleCellLeftClick = useCallback((row: number, col: number) => {
    if (isGeneratingRef.current) return;
    const currentPhase = phaseRef.current;
    const currentBoard = boardRef.current;

    if (currentPhase === "won" || currentPhase === "lost") return;

    const cell = currentBoard[row][col];
    if (cell.state === "revealed" || cell.state === "flagged") return;

    let workingBoard = currentBoard;

    if (currentPhase === "idle") {
      if (mode === "no-guess") {
        setIsGenerating(true);
        let resolved = false;

        const applyBoard = (board: Board) => {
          if (resolved) return;
          resolved = true;
          const revealed = revealCell(board, row, col);
          setBoard(revealed);
          setPhase("playing");
          setIsGenerating(false);
          if (checkWin(revealed)) {
            setPhase("won");
          }
        };

        // Local generation (non-blocking via setTimeout)
        setTimeout(async () => {
          const { generateSolvableBoard } = await import("../lib/board-generator");
          const result = generateSolvableBoard(row, col, difficulty);
          applyBoard(result.board);
        }, 0);

        // Server fallback (fires after 500ms if local generation hasn't finished)
        setTimeout(() => {
          if (resolved) return;
          fetch(`/api/board?difficulty=${encodeURIComponent(difficulty)}&start_row=${row}&start_col=${col}`)
            .then(res => {
              if (!res.ok) throw new Error("Server error");
              return res.json();
            })
            .then(data => {
              applyBoard(decodeBoard(data.board));
            })
            .catch(() => {
              // Ignore — local generation will handle it
            });
        }, 500);
        return;
      }
      workingBoard = generateBoard(row, col);
      setPhase("playing");
    }

    if (workingBoard[row][col].isMine) {
      setBoard(revealAllMines(workingBoard, row, col));
      setPhase("lost");
      return;
    }

    const nextBoard = revealCell(workingBoard, row, col);
    setBoard(nextBoard);

    if (checkWin(nextBoard)) {
      setPhase("won");
    }
  }, [mode, difficulty]);

  const handleCellRightClick = useCallback((e: React.MouseEvent, row: number, col: number) => {
    e.preventDefault();
    if (phaseRef.current !== "playing" || isGeneratingRef.current) return;
    if (e.buttons & 1) return; // left button held — chording, not flagging
    if (wasChordingRef.current) return; // chord just ended — suppress flag on second-button release
    setBoard(prev => toggleFlag(prev, row, col));
  }, []);

  const handleReset = useCallback(() => {
    setBoard(createEmptyBoard());
    setPhase("idle");
    setElapsedSeconds(0);
    scoreSubmittedRef.current = false;
  }, []);

  const handleDifficultyChange = useCallback((d: NoGuessDifficulty) => {
    setDifficulty(d);
    setBoard(createEmptyBoard());
    setPhase("idle");
    setElapsedSeconds(0);
    scoreSubmittedRef.current = false;
  }, []);

  // Track hovered cell for spacebar/chord handling (ref to avoid re-renders)
  const hoveredCellRef = useRef<{ row: number; col: number } | null>(null);

  // Track the cell where left-mousedown started, to detect drag-releases
  const mouseDownCellRef = useRef<{ row: number; col: number } | null>(null);

  // Track held mouse buttons for two-button chord reveal
  const leftDownRef = useRef(false);
  const rightDownRef = useRef(false);

  // Reset button state when mouse is released outside the board
  useEffect(() => {
    const reset = () => {
      leftDownRef.current = false;
      rightDownRef.current = false;
      mouseDownCellRef.current = null;
      setSunkCells(new Set());
    };
    window.addEventListener("mouseup", reset);
    return () => window.removeEventListener("mouseup", reset);
  }, []);

  const handleBoardMouseDown = useCallback((e: React.MouseEvent) => {
    // Fresh press sequence: clear chord memory when starting with both buttons up
    if (!leftDownRef.current && !rightDownRef.current) wasChordingRef.current = false;
    if (e.button === 0) {
      leftDownRef.current = true;
      mouseDownCellRef.current = hoveredCellRef.current;
    }
    if (e.button === 2) rightDownRef.current = true;
    if (leftDownRef.current && rightDownRef.current) wasChordingRef.current = true;
    setSunkCells(computeSunkCells(hoveredCellRef.current, leftDownRef.current, rightDownRef.current, boardRef.current, phaseRef.current));
  }, []);

  const handleBoardMouseUp = useCallback((e: React.MouseEvent) => {
    const wasChording = leftDownRef.current && rightDownRef.current;
    const downCell = mouseDownCellRef.current;
    if (e.button === 0) {
      leftDownRef.current = false;
      mouseDownCellRef.current = null;
    }
    if (e.button === 2) rightDownRef.current = false;
    setSunkCells(computeSunkCells(hoveredCellRef.current, leftDownRef.current, rightDownRef.current, boardRef.current, phaseRef.current));

    // Drag-release: left released on a different cell — only if chord mode was never active
    if (!wasChordingRef.current && !wasChording && e.button === 0) {
      const hovered = hoveredCellRef.current;
      if (hovered && downCell && (hovered.row !== downCell.row || hovered.col !== downCell.col)) {
        handleCellLeftClick(hovered.row, hovered.col);
        return;
      }
    }

    if (!wasChording) return;

    const hovered = hoveredCellRef.current;
    if (!hovered) return;
    if (phaseRef.current !== "playing") return;

    const currentBoard = boardRef.current;
    const cell = currentBoard[hovered.row][hovered.col];
    if (cell.state !== "revealed") return;

    const result = chordReveal(currentBoard, hovered.row, hovered.col);
    if (!result) return;
    if (result.hit) {
      setBoard(result.board);
      setPhase("lost");
    } else {
      setBoard(result.board);
      if (checkWin(result.board)) setPhase("won");
    }
  }, [handleCellLeftClick]);

  const handleCellMouseEnter = useCallback((row: number, col: number) => {
    hoveredCellRef.current = { row, col };
    setSunkCells(computeSunkCells({ row, col }, leftDownRef.current, rightDownRef.current, boardRef.current, phaseRef.current));
  }, []);

  const handleBoardMouseLeave = useCallback(() => {
    hoveredCellRef.current = null;
    setSunkCells(new Set());
  }, []);

  // Spacebar: flag unrevealed cell, or chord-reveal a numbered cell
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      e.preventDefault();
      const hovered = hoveredCellRef.current;
      if (!hovered) return;

      const currentPhase = phaseRef.current;
      if (currentPhase !== "playing") return;

      const currentBoard = boardRef.current;
      const { row, col } = hovered;
      const cell = currentBoard[row][col];

      if (cell.state === "unrevealed" || cell.state === "flagged") {
        setBoard(prev => toggleFlag(prev, row, col));
      } else if (cell.state === "revealed") {
        const result = chordReveal(currentBoard, row, col);
        if (!result) return;
        if (result.hit) {
          setBoard(result.board);
          setPhase("lost");
        } else {
          setBoard(result.board);
          if (checkWin(result.board)) {
            setPhase("won");
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const flagsRemaining = MINE_COUNT - countFlags(board);

  return (
    <div className="flex flex-col lg:flex-row items-center lg:items-start gap-4 select-none">
      <div className="flex flex-col items-center gap-0">
        {mode === "no-guess" && (
          <DifficultySelector
            difficulty={difficulty}
            onDifficultyChange={handleDifficultyChange}
          />
        )}
        <Header
          flagsRemaining={flagsRemaining}
          elapsedSeconds={elapsedSeconds}
          phase={phase}
          onReset={handleReset}
        />
        <BoardComponent
          board={board}
          phase={phase}
          sunkCells={sunkCells}
          onCellLeftClick={handleCellLeftClick}
          onCellRightClick={handleCellRightClick}
          onCellMouseEnter={handleCellMouseEnter}
          onBoardMouseLeave={handleBoardMouseLeave}
          onBoardMouseDown={handleBoardMouseDown}
          onBoardMouseUp={handleBoardMouseUp}
        />
        {(isGenerating || phase === "won" || phase === "lost") && (
          <div className={`${SUNKEN_INNER} bg-black mt-2 px-4 py-1.5 font-mono font-bold text-center`}>
            {isGenerating && <span className="text-[#808080]">Generating board...</span>}
            {!isGenerating && phase === "won" && (
              <>
                <span className="text-green-500">You win!</span>
                {authLevel !== "google" && (
                  <span className="text-[#808080] text-xs ml-2">Sign in to save scores</span>
                )}
              </>
            )}
            {!isGenerating && phase === "lost" && <span className="text-red-500">Game over.</span>}
          </div>
        )}
      </div>
      {showLeaderboard && (
        <Leaderboard username={username} refreshKey={leaderboardRefreshKey} mode={mode} difficulty={mode === "no-guess" ? difficulty : undefined} />
      )}
    </div>
  );
}
