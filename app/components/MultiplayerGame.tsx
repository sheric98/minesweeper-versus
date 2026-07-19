"use client";

import { useState, useEffect, useLayoutEffect, useCallback, useRef, type CSSProperties } from "react";
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
import type { MatchState, ClickLogEntry, EloChange } from "@/app/lib/multiplayer-types";
import type { RematchState } from "@/app/components/GameOverModal";
import { diffRevealedCells, decodeBoard, cooldownDuration } from "@/app/lib/multiplayer-utils";
import useMockWebSocket from "@/app/lib/useMockWebSocket";
import useWebSocket from "@/app/lib/useWebSocket";
import { useBoardInput } from "@/app/lib/useBoardInput";
import { useControls } from "@/app/components/ControlsProvider";

// Use production WebSocket when WS_URL is configured, mock otherwise
const useMultiplayerSocket = process.env.NEXT_PUBLIC_WS_URL
  ? useWebSocket
  : useMockWebSocket;
import { SUNKEN_INNER } from "@/app/lib/win95";
import Header from "@/app/components/Header";
import BoardComponent from "@/app/components/Board";
import OpponentBoard from "@/app/components/OpponentBoard";
import CooldownOverlay from "@/app/components/CooldownOverlay";
import CountdownOverlay from "@/app/components/CountdownOverlay";
import CountdownBoard from "@/app/components/CountdownBoard";
import GameOverModal from "@/app/components/GameOverModal";

const TOTAL_SAFE_CELLS = ROWS * COLS - MINE_COUNT;


interface MultiplayerGameProps {
  matchId: string;
  playerName: string;
  authLevel: "anonymous" | "google";
}

export default function MultiplayerGame({ matchId, playerName, authLevel }: MultiplayerGameProps) {
  const { controls } = useControls();

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
  const [gameResult, setGameResult] = useState<{
    winner: string;
    yourTimeMs: number;
    opponentTimeMs: number;
  } | null>(null);
  const [opponentName, setOpponentName] = useState("");
  const [opponentIsBot, setOpponentIsBot] = useState(false);
  const [opponentDeathCount, setOpponentDeathCount] = useState(0);
  const [opponentDeathFlash, setOpponentDeathFlash] = useState(false);
  const [disconnected, setDisconnected] = useState(false);
  const [rematchState, setRematchState] = useState<RematchState>("idle");
  const [playerWins, setPlayerWins] = useState(0);
  const [opponentWins, setOpponentWins] = useState(0);
  const [h2hRecord, setH2hRecord] = useState<{ wins: number; losses: number } | null>(null);
  const [startingSquare, setStartingSquare] = useState<[number, number] | null>(null);
  const [eloChange, setEloChange] = useState<EloChange | null>(null);
  const [playerElo, setPlayerElo] = useState<number | null>(null);
  const [opponentElo, setOpponentElo] = useState<number | null>(null);

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

  // Store startingSquare for initial reveal after game_start
  const startingSquareRef = useRef<[number, number] | null>(null);
  const opponentNameRef = useRef("");

  // Ref for the send function to avoid stale closures
  const sendRef = useRef<(msg: import("@/app/lib/multiplayer-types").ClientMessage) => void>(() => {});

  // -- WebSocket --
  const { send, connectionState } = useMultiplayerSocket({
    matchId,
    onMessage: useCallback((msg) => {
      switch (msg.type) {
        case "match_found":
          setOpponentName(msg.opponent);
          setOpponentIsBot(msg.opponentIsBot);
          opponentNameRef.current = msg.opponent;
          startingSquareRef.current = msg.startingSquare;
          setStartingSquare(msg.startingSquare);
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
          if (msg.eloChange) {
            setEloChange(msg.eloChange);
            setPlayerElo(msg.eloChange.newRating);
          }
          if (msg.winner === playerName || msg.winner === "You") {
            setPlayerWins(prev => prev + 1);
          } else {
            setOpponentWins(prev => prev + 1);
          }
          // Fetch head-to-head record (will 401 if not Google-authenticated, which is fine)
          fetch(`/api/head-to-head?opponent=${encodeURIComponent(opponentNameRef.current)}`)
            .then(res => res.ok ? res.json() : null)
            .then(data => { if (data && typeof data.wins === "number") setH2hRecord(data); })
            .catch(() => {});
          break;

        case "opponent_disconnected":
          if (matchStateRef.current === "finished") {
            // Post-game disconnect — just mark rematch as declined
            setRematchState("declined");
          } else {
            setDisconnected(true);
            setMatchState("finished");
            setGameResult({
              winner: playerName,
              yourTimeMs: elapsedSecondsRef.current * 1000,
              opponentTimeMs: 0,
            });
            setPlayerWins(prev => prev + 1);
            if (msg.eloChange) {
              setEloChange(msg.eloChange);
              setPlayerElo(msg.eloChange.newRating);
            }
          }
          break;

        case "rematch_requested":
          setRematchState("requested");
          break;

        case "rematch_accepted":
          // Full game state reset for new game
          setBoard(null);
          setMatchState("lobby");
          setOpponentRevealed(new Set());
          setOpponentRevealedCount(0);
          setCountdownSeconds(5);
          setCooldownMs(0);
          setDeathCount(0);
          setElapsedSeconds(0);
          setClickLog([]);
          setGameResult(null);
          setOpponentDeathCount(0);
          setOpponentDeathFlash(false);
          setDisconnected(false);
          startingSquareRef.current = null;
          setStartingSquare(null);
          setRematchState("idle");
          setH2hRecord(null);
          setEloChange(null);
          setOpponentElo(null);
          break;

        case "rematch_declined":
          setRematchState("declined");
          break;
      }
    }, [playerName]),
  });

  // Keep sendRef in sync
  useLayoutEffect(() => {
    sendRef.current = send;
  });

  // -- Fetch player's own Elo on mount --
  useEffect(() => {
    fetch("/api/elo/me")
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (data?.rating != null) setPlayerElo(data.rating); })
      .catch(() => {});
  }, []);

  // -- Fetch opponent Elo when opponent is known --
  useEffect(() => {
    if (!opponentName) return;
    fetch(`/api/elo/player?username=${encodeURIComponent(opponentName)}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (data?.rating != null) setOpponentElo(data.rating); })
      .catch(() => {});
  }, [opponentName]);

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

  // -- Game-action callbacks --

  const handleReveal = useCallback((row: number, col: number) => {
    const currentBoard = boardRef.current;
    if (matchStateRef.current !== "playing" || !currentBoard) return;
    if (cooldownMsRef.current > 0) return;

    const cell = currentBoard[row][col];
    if (cell.isMine) {
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

  const handleFlag = useCallback((row: number, col: number) => {
    if (matchStateRef.current !== "playing") return;
    if (cooldownMsRef.current > 0) return;
    setBoard(prev => (prev ? toggleFlag(prev, row, col, { questionMarks: controls.questionMarks }) : prev));
    setClickLog(prev => [...prev, { type: "flag", row, col, ts: Date.now() }]);
  }, [controls.questionMarks]);

  const handleChord = useCallback((row: number, col: number) => {
    const currentBoard = boardRef.current;
    if (matchStateRef.current !== "playing" || !currentBoard) return;
    if (cooldownMsRef.current > 0) return;

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
  }, []);

  const enabled = matchState === "playing" && cooldownMs <= 0;

  const { boardHandlers, cellHandlers, sunkCells } = useBoardInput({
    controls,
    board,
    enabled,
    onReveal: handleReveal,
    onFlag: handleFlag,
    onChord: handleChord,
  });

  // -- Rematch handlers --
  const handleRematchRequest = useCallback(() => {
    sendRef.current({ type: "rematch_request" });
    setRematchState("waiting");
  }, []);

  const handleRematchDecline = useCallback(() => {
    sendRef.current({ type: "rematch_decline" });
    setRematchState("declined");
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
    <div
      className="flex flex-col items-center gap-4 select-none relative"
      style={{
        "--cell-size": "clamp(0.625rem, calc((100vw - 2rem) / 30), 1.75rem)",
        "--board-width": "calc(30 * var(--cell-size) + 8px)",
      } as CSSProperties}
    >
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

      {/* Main game area: stacks vertically below xl, side-by-side at xl+ */}
      <div className="flex flex-col xl:flex-row items-center xl:items-start gap-6">
        {/* Player board section */}
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
              onCellLeftClick={cellHandlers.onCellLeftClick}
              onCellRightClick={cellHandlers.onCellRightClick}
              onCellMouseEnter={cellHandlers.onCellMouseEnter}
              onCellTouchStart={cellHandlers.onCellTouchStart}
              onCellTouchEnd={cellHandlers.onCellTouchEnd}
              onCellTouchMove={cellHandlers.onCellTouchMove}
              onBoardMouseLeave={boardHandlers.onMouseLeave}
              onBoardMouseDown={boardHandlers.onMouseDown}
              onBoardMouseUp={boardHandlers.onMouseUp}
              onBoardDoubleClick={boardHandlers.onDoubleClick}
            />
          ) : matchState === "countdown" && startingSquare ? (
            <CountdownBoard startingSquare={startingSquare} />
          ) : (
            <div
              className="bg-[#c0c0c0] border-4 border-t-[#a0a0a0] border-l-[#a0a0a0] border-b-[#d8d8d8] border-r-[#d8d8d8] flex items-center justify-center text-ms-dark"
              style={{ width: `calc(${COLS} * var(--cell-size))`, height: `calc(${ROWS} * var(--cell-size))` }}
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

        {/* Opponent section */}
        <div className="flex flex-col items-center gap-0">
          <div
            className="flex items-center justify-center px-2 py-1.5 border-4 bg-rose-200 border-t-rose-100 border-l-rose-100 border-b-rose-300 border-r-rose-300 text-sm font-bold font-mono w-full"
          >
            {opponentName || "Opponent"}
            {opponentIsBot && <span className="text-xs ml-1 font-bold text-orange-600">[BOT]</span>}
            {opponentElo != null && <span className="font-normal text-xs ml-1">({opponentElo})</span>}
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

      {/* Series score (shown after first game) */}
      {(playerWins + opponentWins > 0) && (matchState === "playing" || matchState === "finished") && (
        <div className="font-mono text-xs text-ms-dark text-center">
          Series: <span className="text-blue-500 font-bold">{playerWins}</span>
          {" - "}
          <span className="text-rose-500 font-bold">{opponentWins}</span>
        </div>
      )}

      {/* Progress bars */}
      {(matchState === "playing" || matchState === "finished") && (
        <div className="flex flex-col gap-2 w-full max-w-xl">
          {/* Player progress */}
          <div className="flex items-center gap-2 font-mono text-sm">
            <span className="w-24 text-right truncate font-bold text-blue-500">
              You{playerElo != null && <span className="font-normal text-xs text-ms-dark"> ({playerElo})</span>}
            </span>
            <div className={`flex-1 h-7 bg-[#c0c0c0] ${SUNKEN_INNER} relative`}>
              <div
                className="h-full bg-blue-500 transition-all duration-300"
                style={{ width: `${(playerRevealedCount / TOTAL_SAFE_CELLS) * 100}%` }}
              />
              <span className="absolute inset-0 flex items-center justify-center text-black font-bold text-xs">
                {Math.round((playerRevealedCount / TOTAL_SAFE_CELLS) * 100)}%
              </span>
            </div>
          </div>
          {/* Opponent progress */}
          <div className="flex items-center gap-2 font-mono text-sm">
            <span className="w-24 text-right truncate font-bold text-rose-500">
              {opponentName || "Opponent"}{opponentIsBot && <span className="text-xs font-bold text-orange-600 ml-1">[BOT]</span>}{opponentElo != null && <span className="font-normal text-xs text-ms-dark"> ({opponentElo})</span>}
            </span>
            <div className={`flex-1 h-7 bg-[#c0c0c0] ${SUNKEN_INNER} relative`}>
              <div
                className="h-full bg-rose-500 transition-all duration-300"
                style={{ width: `${(opponentRevealedCount / TOTAL_SAFE_CELLS) * 100}%` }}
              />
              <span className="absolute inset-0 flex items-center justify-center text-black font-bold text-xs">
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
          playerWins={playerWins}
          opponentWins={opponentWins}
          h2hRecord={h2hRecord}
          eloChange={eloChange}
          authLevel={authLevel}
          rematchState={rematchState}
          onRematchRequest={handleRematchRequest}
          onRematchDecline={handleRematchDecline}
        />
      )}
    </div>
  );
}
