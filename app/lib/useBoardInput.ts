"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  type Board,
  ROWS,
  COLS,
} from "@/app/lib/minesweeper";
import type { ControlsPrefs } from "@/app/lib/controls";

function computeSunkCells(
  hovered: { row: number; col: number } | null,
  leftDown: boolean,
  rightDown: boolean,
  board: Board | null,
  enabled: boolean,
  showChordPreview: boolean,
): Set<string> {
  if (!hovered || !leftDown || !enabled || !board) return new Set();
  const { row, col } = hovered;
  if (rightDown && showChordPreview) {
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

interface UseBoardInputArgs {
  controls: ControlsPrefs;
  board: Board | null;
  enabled: boolean;
  onReveal: (row: number, col: number) => void;
  onFlag: (row: number, col: number) => void;
  onChord: (row: number, col: number) => void;
}

export interface BoardInputHandlers {
  boardHandlers: {
    onMouseDown: (e: React.MouseEvent) => void;
    onMouseUp: (e: React.MouseEvent) => void;
    onMouseLeave: () => void;
    onDoubleClick: (e: React.MouseEvent) => void;
  };
  cellHandlers: {
    onCellLeftClick: (row: number, col: number) => void;
    onCellRightClick: (e: React.MouseEvent, row: number, col: number) => void;
    onCellMouseEnter: (row: number, col: number) => void;
  };
  sunkCells: Set<string>;
}

export function useBoardInput({
  controls,
  board,
  enabled,
  onReveal,
  onFlag,
  onChord,
}: UseBoardInputArgs): BoardInputHandlers {
  const [sunkCells, setSunkCells] = useState<Set<string>>(new Set());

  // Refs synced post-commit so callbacks never see stale state.
  const boardRef = useRef(board);
  const enabledRef = useRef(enabled);
  const controlsRef = useRef(controls);
  const onRevealRef = useRef(onReveal);
  const onFlagRef = useRef(onFlag);
  const onChordRef = useRef(onChord);
  useLayoutEffect(() => {
    boardRef.current = board;
    enabledRef.current = enabled;
    controlsRef.current = controls;
    onRevealRef.current = onReveal;
    onFlagRef.current = onFlag;
    onChordRef.current = onChord;
  });

  const hoveredCellRef = useRef<{ row: number; col: number } | null>(null);
  const mouseDownCellRef = useRef<{ row: number; col: number } | null>(null);
  const leftDownRef = useRef(false);
  const rightDownRef = useRef(false);
  const wasChordingRef = useRef(false);
  // Suppresses the second click of a native double-click: boardRef.current
  // hasn't yet flipped to "revealed" between click 1 and click 2, so without
  // this guard both clicks would fire onReveal on the same cell.
  const lastRevealRef = useRef<{ row: number; col: number; ts: number } | null>(null);

  const recomputeSunk = useCallback(() => {
    const showPreview = controlsRef.current.chordTrigger === "both-buttons";
    setSunkCells(
      computeSunkCells(
        hoveredCellRef.current,
        leftDownRef.current,
        rightDownRef.current,
        boardRef.current,
        enabledRef.current,
        showPreview,
      ),
    );
  }, []);

  // Reset state if the user releases a button outside the board.
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

  // Spacebar listener — branches on controls.spacebarAction.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      const action = controlsRef.current.spacebarAction;
      if (action === "off") return; // page default (scroll, etc.) preserved
      e.preventDefault();
      const hovered = hoveredCellRef.current;
      if (!hovered) return;
      if (!enabledRef.current) return;
      const b = boardRef.current;
      if (!b) return;
      const cell = b[hovered.row][hovered.col];

      if (cell.state === "unrevealed" || cell.state === "flagged" || cell.state === "question") {
        onFlagRef.current(hovered.row, hovered.col);
        return;
      }
      if (action === "flag-or-chord" && cell.state === "revealed") {
        onChordRef.current(hovered.row, hovered.col);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const handleCellLeftClick = useCallback((row: number, col: number) => {
    if (!enabledRef.current) return;
    const b = boardRef.current;
    if (!b) return;
    const cell = b[row][col];
    if (cell.state === "revealed" || cell.state === "flagged" || cell.state === "question") return;
    const now = Date.now();
    const last = lastRevealRef.current;
    if (last && last.row === row && last.col === col && now - last.ts < 300) return;
    lastRevealRef.current = { row, col, ts: now };
    onRevealRef.current(row, col);
  }, []);

  const handleCellRightClick = useCallback((e: React.MouseEvent, row: number, col: number) => {
    e.preventDefault();
    if (!enabledRef.current) return;
    if (e.buttons & 1) return; // left-button held — chording, not flagging
    if (wasChordingRef.current) return; // chord just ended — suppress spurious flag
    const b = boardRef.current;
    if (!b) return;
    const cell = b[row][col];
    if (cell.state !== "unrevealed" && cell.state !== "flagged" && cell.state !== "question") return;
    onFlagRef.current(row, col);
  }, []);

  const handleCellMouseEnter = useCallback((row: number, col: number) => {
    hoveredCellRef.current = { row, col };
    recomputeSunk();
  }, [recomputeSunk]);

  const handleBoardMouseLeave = useCallback(() => {
    hoveredCellRef.current = null;
    setSunkCells(new Set());
  }, []);

  const handleBoardMouseDown = useCallback((e: React.MouseEvent) => {
    // Fresh press sequence: clear chord memory.
    if (!leftDownRef.current && !rightDownRef.current) wasChordingRef.current = false;

    const trigger = controlsRef.current.chordTrigger;

    // Middle-button chord (only when this is the active chord trigger).
    if (e.button === 1 && trigger === "middle-click") {
      e.preventDefault();
      const hovered = hoveredCellRef.current;
      if (!hovered || !enabledRef.current) return;
      const b = boardRef.current;
      if (!b) return;
      if (b[hovered.row][hovered.col].state === "revealed") {
        onChordRef.current(hovered.row, hovered.col);
      }
      return;
    }

    if (e.button === 0) {
      leftDownRef.current = true;
      mouseDownCellRef.current = hoveredCellRef.current;
    }
    if (e.button === 2) rightDownRef.current = true;
    if (leftDownRef.current && rightDownRef.current && trigger === "both-buttons") {
      wasChordingRef.current = true;
    }
    recomputeSunk();
  }, [recomputeSunk]);

  const handleBoardMouseUp = useCallback((e: React.MouseEvent) => {
    const trigger = controlsRef.current.chordTrigger;
    const wasBothHeld = leftDownRef.current && rightDownRef.current;
    const downCell = mouseDownCellRef.current;
    if (e.button === 0) {
      leftDownRef.current = false;
      mouseDownCellRef.current = null;
    }
    if (e.button === 2) rightDownRef.current = false;
    recomputeSunk();

    // Drag-release: only when no chord was in progress.
    if (!wasChordingRef.current && !wasBothHeld && e.button === 0) {
      const hovered = hoveredCellRef.current;
      if (hovered && downCell && (hovered.row !== downCell.row || hovered.col !== downCell.col)) {
        handleCellLeftClick(hovered.row, hovered.col);
        return;
      }
    }

    // Both-buttons chord on release.
    if (wasBothHeld && trigger === "both-buttons") {
      const hovered = hoveredCellRef.current;
      if (!hovered || !enabledRef.current) return;
      const b = boardRef.current;
      if (!b) return;
      if (b[hovered.row][hovered.col].state === "revealed") {
        onChordRef.current(hovered.row, hovered.col);
      }
    }
  }, [handleCellLeftClick, recomputeSunk]);

  const handleBoardDoubleClick = useCallback((e: React.MouseEvent) => {
    if (controlsRef.current.chordTrigger !== "double-click") return;
    e.preventDefault();
    const hovered = hoveredCellRef.current;
    if (!hovered || !enabledRef.current) return;
    const b = boardRef.current;
    if (!b) return;
    if (b[hovered.row][hovered.col].state === "revealed") {
      onChordRef.current(hovered.row, hovered.col);
    }
  }, []);

  return {
    boardHandlers: {
      onMouseDown: handleBoardMouseDown,
      onMouseUp: handleBoardMouseUp,
      onMouseLeave: handleBoardMouseLeave,
      onDoubleClick: handleBoardDoubleClick,
    },
    cellHandlers: {
      onCellLeftClick: handleCellLeftClick,
      onCellRightClick: handleCellRightClick,
      onCellMouseEnter: handleCellMouseEnter,
    },
    sunkCells,
  };
}
