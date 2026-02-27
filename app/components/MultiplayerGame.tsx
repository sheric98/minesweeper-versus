"use client";

import { useState, useEffect, useLayoutEffect, useCallback, useRef } from "react";
import {
  Board,
  GamePhase,
  MINE_COUNT,
  ROWS,
  COLS,
  revealCell,
  toggleFlag,
  checkWin,
  countFlags,
  chordReveal,
} from "@/app/lib/minesweeper";
import type { MatchState, ClickLogEntry } from "@/app/lib/multiplayer-types";
import { diffRevealedCells, decodeBoard, cooldownDuration } from "@/app/lib/multiplayer-utils";
import useMockWebSocket from "@/app/lib/useMockWebSocket";
import useWebSocket from "@/app/lib/useWebSocket";

// Use production WebSocket when WS_URL is configured, mock otherwise
const useMultiplayerSocket = process.env.NEXT_PUBLIC_WS_URL
  ? useWebSocket
  : useMockWebSocket;
import Header from "@/app/components/Header";
import BoardComponent from "@/app/components/Board";
import OpponentBoard from "@/app/components/OpponentBoard";
import CooldownOverlay from "@/app/components/CooldownOverlay";
import CountdownOverlay from "@/app/components/CountdownOverlay";
import CountdownBoard from "@/app/components/CountdownBoard";
import GameOverModal from "@/app/components/GameOverModal";

const TOTAL_SAFE_CELLS = ROWS * COLS - MINE_COUNT;

function computeSunkCells(
  hovered: { row: number; col: number } | null,
  leftDown: boolean,
  rightDown: boolean,
  board: Board,
  playing: boolean,
): Set<string> {
  if (!hovered || !leftDown || !playing) return new Set();
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

interface MultiplayerGameProps {
  matchId: string;
  playerName: string;
}

export default function MultiplayerGame({ matchId, playerName }: MultiplayerGameProps) {
  // -- State --
  const [board, setBoard] = useState<Board | null>(null);
  const [matchState, setMatchState] = useState<MatchState>("lobby");
  const [opponentRevealed, setOpponentRevealed] = useState<Set<string>>(new Set());
  const [opponentRevealedCount, setOpponentRevealedCount] = useState(0);
  const [countdownSeconds, setCountdownSeconds] = useState(5);
  const [cooldownMs, setCooldownMs] = useState(0);
  const [deathCount, setDeathCount] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [clickLog, setClickLog] = useState<ClickLogEntry[]>([]);
  const [sunkCells, setSunkCells] = useState<Set<string>>(new Set());
  const [gameResult, setGameResult] = useState<{
    winner: string;
    yourTimeMs: number;
    opponentTimeMs: number;
  } | null>(null);
  const [opponentName, setOpponentName] = useState("");
  const [opponentDeathCount, setOpponentDeathCount] = useState(0);
  const [opponentDeathFlash, setOpponentDeathFlash] = useState(false);
  const [disconnected, setDisconnected] = useState(false);

  // -- Refs for stable callbacks (synced post-commit, not during render) --
  const boardRef = useRef(board);
  const matchStateRef = useRef(matchState);
  const cooldownMsRef = useRef(cooldownMs);
  const deathCountRef = useRef(deathCount);
  const elapsedSecondsRef = useRef(elapsedSeconds);
  const clickLogRef = useRef(clickLog);

  useLayoutEffect(() => {
    boardRef.current = board;
    matchStateRef.current = matchState;
    cooldownMsRef.current = cooldownMs;
    deathCountRef.current = deathCount;
    elapsedSecondsRef.current = elapsedSeconds;
    clickLogRef.current = clickLog;
  });

  // Mouse tracking refs
  const hoveredCellRef = useRef<{ row: number; col: number } | null>(null);
  const mouseDownCellRef = useRef<{ row: number; col: number } | null>(null);
  const leftDownRef = useRef(false);
  const rightDownRef = useRef(false);
  const wasChordingRef = useRef(false);

  // Store startingSquare for initial reveal after game_start
  const startingSquareRef = useRef<[number, number] | null>(null);

  // Ref for the send function to avoid stale closures
  const sendRef = useRef<(msg: import("@/app/lib/multiplayer-types").ClientMessage) => void>(() => {});

  // -- WebSocket --
  const { send, connectionState } = useMultiplayerSocket({
    matchId,
    onMessage: useCallback((msg) => {
      switch (msg.type) {
        case "match_found":
          setOpponentName(msg.opponent);
          startingSquareRef.current = msg.startingSquare;
          setMatchState("countdown");
          break;

        case "countdown":
          setCountdownSeconds(msg.secondsRemaining);
          break;

        case "game_start": {
          const decoded = decodeBoard(msg.board);
          // Auto-reveal the starting square (flood-fill)
          const sq = startingSquareRef.current;
          if (sq) {
            const revealed = revealCell(decoded, sq[0], sq[1]);
            setBoard(revealed);
            // Report the initial reveal to the server so opponent progress is tracked
            const initialCells = diffRevealedCells(decoded, revealed);
            if (initialCells.length > 0) {
              sendRef.current({ type: "reveal", row: sq[0], col: sq[1], resultCells: initialCells });
            }
          } else {
            setBoard(decoded);
          }
          setMatchState("playing");
          break;
        }

        case "opponent_progress":
          setOpponentRevealed(prev => {
            const next = new Set(prev);
            for (const c of msg.cells) next.add(`${c.row}-${c.col}`);
            return next;
          });
          setOpponentRevealedCount(msg.revealedCount);
          break;

        case "opponent_hit_mine":
          setOpponentDeathCount(msg.deathCount);
          setOpponentDeathFlash(true);
          break;

        case "game_over":
          setMatchState("finished");
          setGameResult({
            winner: msg.winner,
            yourTimeMs: msg.yourTimeMs,
            opponentTimeMs: msg.opponentTimeMs,
          });
          break;

        case "opponent_disconnected":
          setDisconnected(true);
          setMatchState("finished");
          setGameResult({
            winner: playerName,
            yourTimeMs: elapsedSecondsRef.current * 1000,
            opponentTimeMs: 0,
          });
          break;
      }
    }, [playerName]),
  });

  // Keep sendRef in sync
  useLayoutEffect(() => {
    sendRef.current = send;
  });

  // -- Timer --
  useEffect(() => {
    if (matchState !== "playing") return;
    const id = setInterval(() => setElapsedSeconds(s => Math.min(s + 1, 999)), 1000);
    return () => clearInterval(id);
  }, [matchState]);

  // -- Cooldown timer --
  useEffect(() => {
    if (cooldownMs <= 0) return;
    const id = setInterval(() => {
      setCooldownMs(prev => {
        const next = prev - 100;
        return next <= 0 ? 0 : next;
      });
    }, 100);
    return () => clearInterval(id);
  }, [cooldownMs > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  // -- Warn before leaving during an active game --
  useEffect(() => {
    if (matchState !== "playing") return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [matchState]);

  // -- Clear opponent death flash after 600ms --
  useEffect(() => {
    if (!opponentDeathFlash) return;
    const id = setTimeout(() => setOpponentDeathFlash(false), 600);
    return () => clearTimeout(id);
  }, [opponentDeathFlash]);

  // -- Input handlers --

  const handleCellLeftClick = useCallback((row: number, col: number) => {
    const currentBoard = boardRef.current;
    if (matchStateRef.current !== "playing" || !currentBoard) return;
    if (cooldownMsRef.current > 0) return;

    const cell = currentBoard[row][col];
    if (cell.state === "revealed" || cell.state === "flagged") return;

    if (cell.isMine) {
      // Mine hit — cooldown, NOT game over
      const newDeathCount = deathCountRef.current + 1;
      setDeathCount(newDeathCount);
      setCooldownMs(cooldownDuration(newDeathCount - 1));
      setClickLog(prev => [...prev, { type: "reveal", row, col, ts: Date.now() }]);
      sendRef.current({ type: "hit_mine", row, col, deathCount: newDeathCount });
      return;
    }

    const nextBoard = revealCell(currentBoard, row, col);
    const newCells = diffRevealedCells(currentBoard, nextBoard);
    setBoard(nextBoard);
    setClickLog(prev => [...prev, { type: "reveal", row, col, ts: Date.now() }]);
    sendRef.current({ type: "reveal", row, col, resultCells: newCells });

    if (checkWin(nextBoard)) {
      const timeMs = elapsedSecondsRef.current * 1000;
      sendRef.current({
        type: "game_complete",
        timeMs,
        clickLog: [...clickLogRef.current, { type: "reveal", row, col, ts: Date.now() }],
      });
    }
  }, []);

  const handleCellRightClick = useCallback((e: React.MouseEvent, row: number, col: number) => {
    e.preventDefault();
    if (matchStateRef.current !== "playing") return;
    if (cooldownMsRef.current > 0) return;
    if (e.buttons & 1) return;
    if (wasChordingRef.current) return;
    setBoard(prev => (prev ? toggleFlag(prev, row, col) : prev));
    setClickLog(prev => [...prev, { type: "flag", row, col, ts: Date.now() }]);
  }, []);

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
    if (!leftDownRef.current && !rightDownRef.current) wasChordingRef.current = false;
    if (e.button === 0) {
      leftDownRef.current = true;
      mouseDownCellRef.current = hoveredCellRef.current;
    }
    if (e.button === 2) rightDownRef.current = true;
    if (leftDownRef.current && rightDownRef.current) wasChordingRef.current = true;

    const currentBoard = boardRef.current;
    if (currentBoard) {
      setSunkCells(
        computeSunkCells(
          hoveredCellRef.current,
          leftDownRef.current,
          rightDownRef.current,
          currentBoard,
          matchStateRef.current === "playing" && cooldownMsRef.current <= 0,
        ),
      );
    }
  }, []);

  const handleBoardMouseUp = useCallback((e: React.MouseEvent) => {
    const wasChording = leftDownRef.current && rightDownRef.current;
    const downCell = mouseDownCellRef.current;
    if (e.button === 0) {
      leftDownRef.current = false;
      mouseDownCellRef.current = null;
    }
    if (e.button === 2) rightDownRef.current = false;

    const currentBoard = boardRef.current;
    if (currentBoard) {
      setSunkCells(
        computeSunkCells(
          hoveredCellRef.current,
          leftDownRef.current,
          rightDownRef.current,
          currentBoard,
          matchStateRef.current === "playing" && cooldownMsRef.current <= 0,
        ),
      );
    }

    // Drag-release: left released on a different cell (no chord)
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
    if (matchStateRef.current !== "playing" || !currentBoard) return;
    if (cooldownMsRef.current > 0) return;

    const cell = currentBoard[hovered.row][hovered.col];
    if (cell.state !== "revealed") return;

    const result = chordReveal(currentBoard, hovered.row, hovered.col);
    if (!result) return;

    if (result.hit) {
      // Mine hit during chord — don't update board, start cooldown
      const newDeathCount = deathCountRef.current + 1;
      setDeathCount(newDeathCount);
      setCooldownMs(cooldownDuration(newDeathCount - 1));
      setClickLog(prev => [...prev, { type: "chord", row: hovered.row, col: hovered.col, ts: Date.now() }]);
      sendRef.current({ type: "hit_mine", row: hovered.row, col: hovered.col, deathCount: newDeathCount });
    } else {
      const newCells = diffRevealedCells(currentBoard, result.board);
      setBoard(result.board);
      setClickLog(prev => [...prev, { type: "chord", row: hovered.row, col: hovered.col, ts: Date.now() }]);
      sendRef.current({ type: "chord", row: hovered.row, col: hovered.col, resultCells: newCells });

      if (checkWin(result.board)) {
        const timeMs = elapsedSecondsRef.current * 1000;
        sendRef.current({
          type: "game_complete",
          timeMs,
          clickLog: [...clickLogRef.current, { type: "chord", row: hovered.row, col: hovered.col, ts: Date.now() }],
        });
      }
    }
  }, [handleCellLeftClick]);

  const handleCellMouseEnter = useCallback((row: number, col: number) => {
    hoveredCellRef.current = { row, col };
    const currentBoard = boardRef.current;
    if (currentBoard) {
      setSunkCells(
        computeSunkCells(
          { row, col },
          leftDownRef.current,
          rightDownRef.current,
          currentBoard,
          matchStateRef.current === "playing" && cooldownMsRef.current <= 0,
        ),
      );
    }
  }, []);

  const handleBoardMouseLeave = useCallback(() => {
    hoveredCellRef.current = null;
    setSunkCells(new Set());
  }, []);

  // Spacebar: flag unrevealed, or chord-reveal a numbered cell
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      e.preventDefault();
      const hovered = hoveredCellRef.current;
      if (!hovered) return;
      if (matchStateRef.current !== "playing") return;
      if (cooldownMsRef.current > 0) return;

      const currentBoard = boardRef.current;
      if (!currentBoard) return;
      const { row, col } = hovered;
      const cell = currentBoard[row][col];

      if (cell.state === "unrevealed" || cell.state === "flagged") {
        setBoard(prev => (prev ? toggleFlag(prev, row, col) : prev));
        setClickLog(prev => [...prev, { type: "flag", row, col, ts: Date.now() }]);
      } else if (cell.state === "revealed") {
        const result = chordReveal(currentBoard, row, col);
        if (!result) return;
        if (result.hit) {
          const newDeathCount = deathCountRef.current + 1;
          setDeathCount(newDeathCount);
          setCooldownMs(cooldownDuration(newDeathCount - 1));
          setClickLog(prev => [...prev, { type: "chord", row, col, ts: Date.now() }]);
          sendRef.current({ type: "hit_mine", row, col, deathCount: newDeathCount });
        } else {
          const newCells = diffRevealedCells(currentBoard, result.board);
          setBoard(result.board);
          setClickLog(prev => [...prev, { type: "chord", row, col, ts: Date.now() }]);
          sendRef.current({ type: "chord", row, col, resultCells: newCells });
          if (checkWin(result.board)) {
            const timeMs = elapsedSecondsRef.current * 1000;
            sendRef.current({
              type: "game_complete",
              timeMs,
              clickLog: [...clickLogRef.current, { type: "chord", row, col, ts: Date.now() }],
            });
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // -- Derived values --
  const flagsRemaining = board ? MINE_COUNT - countFlags(board) : MINE_COUNT;

  // Map MatchState to GamePhase for the Header component
  const headerPhase: GamePhase =
    matchState === "playing"
      ? "playing"
      : matchState === "finished"
        ? gameResult && (gameResult.winner === playerName || gameResult.winner === "You")
          ? "won"
          : "lost"
        : "idle";

  const playerRevealedCount = board
    ? (() => {
        let count = 0;
        for (let r = 0; r < ROWS; r++) {
          for (let c = 0; c < COLS; c++) {
            if (board[r][c].state === "revealed") count++;
          }
        }
        return count;
      })()
    : 0;

  return (
    <div className="flex flex-col items-center gap-4 select-none relative">
      {/* Connection status indicator */}
      <div className="fixed top-16 right-4 flex items-center gap-2 text-sm font-mono text-ms-dark z-50">
        <span
          className={`inline-block w-2.5 h-2.5 rounded-full ${
            connectionState === "connected"
              ? "bg-green-500"
              : connectionState === "connecting" || connectionState === "reconnecting"
                ? "bg-yellow-500"
                : "bg-red-500"
          }`}
        />
        {connectionState === "connected" && "Connected"}
        {connectionState === "connecting" && "Connecting..."}
        {connectionState === "reconnecting" && "Reconnecting..."}
        {connectionState === "disconnected" && "Disconnected"}
      </div>

      {/* Main game area: player board centered, opponent board anchored to its right */}
      <div className="relative">
        {/* Player board section — centered on screen */}
        <div className="flex flex-col items-center gap-0 relative">
          <Header
            flagsRemaining={flagsRemaining}
            elapsedSeconds={elapsedSeconds}
            phase={headerPhase}
            onReset={() => {}}
            accentColor="blue"
          />
          {matchState === "countdown" && <CountdownOverlay seconds={countdownSeconds} />}
          {board ? (
            <BoardComponent
              board={board}
              phase={headerPhase}
              sunkCells={sunkCells}
              onCellLeftClick={handleCellLeftClick}
              onCellRightClick={handleCellRightClick}
              onCellMouseEnter={handleCellMouseEnter}
              onBoardMouseLeave={handleBoardMouseLeave}
              onBoardMouseDown={handleBoardMouseDown}
              onBoardMouseUp={handleBoardMouseUp}
            />
          ) : matchState === "countdown" && startingSquareRef.current ? (
            <CountdownBoard startingSquare={startingSquareRef.current} />
          ) : (
            <div
              className="bg-[#c0c0c0] border-4 border-t-[#a0a0a0] border-l-[#a0a0a0] border-b-[#d8d8d8] border-r-[#d8d8d8] flex items-center justify-center text-ms-dark"
              style={{ width: `calc(${COLS} * 1.75rem)`, height: `calc(${ROWS} * 1.75rem)` }}
            >
              Waiting for game...
            </div>
          )}
          {cooldownMs > 0 && (
            <CooldownOverlay
              remainingMs={cooldownMs}
              playerPercent={Math.round((playerRevealedCount / TOTAL_SAFE_CELLS) * 100)}
              opponentPercent={Math.round((opponentRevealedCount / TOTAL_SAFE_CELLS) * 100)}
            />
          )}
        </div>

        {/* Opponent section — positioned to the right of the player board */}
        <div className="absolute left-full top-0 ml-6 flex flex-col items-center gap-0">
          <div
            className="flex items-center justify-center px-2 py-1.5 border-4 bg-rose-200 border-t-rose-100 border-l-rose-100 border-b-rose-300 border-r-rose-300 text-sm font-bold font-mono w-full"
          >
            {opponentName || "Opponent"}
          </div>
          <div
            className={`rounded transition-shadow duration-300 ${
              opponentDeathFlash ? "shadow-[0_0_0_3px_#ef4444]" : ""
            }`}
          >
            <OpponentBoard revealedCells={opponentRevealed} />
          </div>
          {opponentDeathCount > 0 && (
            <div className="text-xs font-mono text-red-600">
              Deaths: {opponentDeathCount}
            </div>
          )}
        </div>
      </div>

      {/* Progress bars */}
      {(matchState === "playing" || matchState === "finished") && (
        <div className="flex flex-col gap-2 w-full max-w-xl">
          {/* Player progress */}
          <div className="flex items-center gap-2 font-mono text-sm">
            <span className="w-24 text-right truncate font-bold text-blue-500">You</span>
            <div className="flex-1 h-7 bg-[#333333] border border-[#222222] relative">
              <div
                className="h-full bg-blue-400 transition-all duration-300"
                style={{ width: `${(playerRevealedCount / TOTAL_SAFE_CELLS) * 100}%` }}
              />
              <span className="absolute inset-0 flex items-center justify-center text-white font-bold text-xs drop-shadow-[0_1px_1px_rgba(0,0,0,0.5)]">
                {Math.round((playerRevealedCount / TOTAL_SAFE_CELLS) * 100)}%
              </span>
            </div>
          </div>
          {/* Opponent progress */}
          <div className="flex items-center gap-2 font-mono text-sm">
            <span className="w-24 text-right truncate font-bold text-rose-500">{opponentName || "Opponent"}</span>
            <div className="flex-1 h-7 bg-[#333333] border border-[#222222] relative">
              <div
                className="h-full bg-rose-400 transition-all duration-300"
                style={{ width: `${(opponentRevealedCount / TOTAL_SAFE_CELLS) * 100}%` }}
              />
              <span className="absolute inset-0 flex items-center justify-center text-white font-bold text-xs drop-shadow-[0_1px_1px_rgba(0,0,0,0.5)]">
                {Math.round((opponentRevealedCount / TOTAL_SAFE_CELLS) * 100)}%
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Overlays */}
      {gameResult && (
        <GameOverModal
          winner={gameResult.winner}
          playerName={playerName}
          yourTimeMs={gameResult.yourTimeMs}
          opponentTimeMs={gameResult.opponentTimeMs}
          opponentDisconnected={disconnected}
          loserPercent={
            (gameResult.winner === playerName || gameResult.winner === "You")
              ? Math.round((opponentRevealedCount / TOTAL_SAFE_CELLS) * 100)
              : Math.round((playerRevealedCount / TOTAL_SAFE_CELLS) * 100)
          }
        />
      )}
    </div>
  );
}
