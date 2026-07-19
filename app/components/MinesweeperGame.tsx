"use client";

import { useState, useEffect, useCallback, useRef, type CSSProperties } from "react";
import { usePathname } from "next/navigation";
import {
  Board,
  BOARD_PRESETS,
  type BoardSizePreset,
  GamePhase,
  type NoGuessDifficulty,
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
import { useBoardInput } from "@/app/lib/useBoardInput";
import { useControls } from "@/app/components/ControlsProvider";
import { SUNKEN_INNER } from "@/app/lib/win95";
import Header from "@/app/components/Header";
import BoardComponent from "@/app/components/Board";
import HowToPlayHint from "@/app/components/HowToPlayHint";
import Leaderboard, { type LeaderboardEntry } from "@/app/components/Leaderboard";
import SelectorTabs from "@/app/components/SelectorTabs";
import PostWinSignInModal from "@/app/components/PostWinSignInModal";
import * as PendingScore from "@/app/lib/pending-score";

type GameMode = "random" | "no-guess";

const SIZE_OPTIONS: { value: BoardSizePreset; label: string }[] = [
  { value: "beginner", label: "Beginner 9×9" },
  { value: "intermediate", label: "Intermediate 16×16" },
  { value: "expert", label: "Expert 30×16" },
];

const NO_GUESS_OPTIONS: { value: NoGuessDifficulty; label: string }[] = [
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
  { value: "expert", label: "Expert" },
];

interface MinesweeperGameProps {
  authLevel?: "anonymous" | "google";
  username?: string;
  mode?: GameMode;
}

export default function MinesweeperGame({ authLevel, username, mode = "random" }: MinesweeperGameProps) {
  const { controls } = useControls();

  const [board, setBoard] = useState<Board>(() => createEmptyBoard());
  const [phase, setPhase] = useState<GamePhase>("idle");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [leaderboardRefreshKey, setLeaderboardRefreshKey] = useState(0);
  const [scores, setScores] = useState<LeaderboardEntry[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [difficulty, setDifficulty] = useState<NoGuessDifficulty>("beginner");
  const [sizePreset, setSizePreset] = useState<BoardSizePreset>("expert");
  const [showSignInModal, setShowSignInModal] = useState(false);
  const pathname = usePathname();
  const clientGameIdRef = useRef<string | null>(null);
  const submittedRef = useRef(false);
  const signInModalDismissedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Random mode plays any preset; no-guess boards are always expert-sized
  // (solver difficulty tabs vary logic depth, not size).
  const boardConfig = mode === "no-guess" ? BOARD_PRESETS.expert : BOARD_PRESETS[sizePreset];

  // Leaderboard times are only comparable on the expert board.
  const showLeaderboard = mode === "no-guess" || sizePreset === "expert";

  // Submit completed game (win OR loss) on terminal phase, for Google-auth users.
  useEffect(() => {
    if (phase !== "won" && phase !== "lost") return;
    if (authLevel !== "google") return;
    if (!showLeaderboard) return;
    if (!clientGameIdRef.current) return;
    if (submittedRef.current) return;
    submittedRef.current = true;

    const result: "win" | "loss" = phase === "won" ? "win" : "loss";
    const submitDifficulty = mode === "no-guess" ? difficulty : "standard";
    fetch("/api/singleplayer/games", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode,
        difficulty: submitDifficulty,
        result,
        time_seconds: result === "win" ? elapsedSeconds : null,
        client_game_id: clientGameIdRef.current,
      }),
    })
      .then(() => {
        if (result === "win") setLeaderboardRefreshKey((k) => k + 1);
      })
      .catch(() => {});
  }, [phase, authLevel, elapsedSeconds, mode, showLeaderboard, difficulty]);

  // Open sign-in prompt when an anonymous user wins with a top-10 time.
  useEffect(() => {
    if (phase !== "won") return;
    if (authLevel === "google") return;
    if (!showLeaderboard) return;
    if (signInModalDismissedRef.current) return;
    const qualifies = scores.length < 10 || elapsedSeconds < scores[9].time_seconds;
    if (qualifies) setShowSignInModal(true);
  }, [phase, authLevel, showLeaderboard, scores, elapsedSeconds]);

  // On mount, finish the score-save started before the OAuth roundtrip.
  useEffect(() => {
    const pending = PendingScore.read();
    if (!pending) return;
    if (authLevel !== "google") {
      PendingScore.clear();
      return;
    }
    fetch("/api/singleplayer/games", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: pending.mode,
        difficulty: pending.difficulty,
        result: pending.result,
        time_seconds: pending.time_seconds,
        client_game_id: pending.client_game_id,
      }),
    })
      .then(() => {
        PendingScore.clear();
        setLeaderboardRefreshKey((k) => k + 1);
      })
      .catch(() => {
        PendingScore.clear();
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Own the leaderboard fetch so we can run a top-10 qualification check on win.
  useEffect(() => {
    if (!showLeaderboard) return;
    let url = `/api/leaderboard?mode=${mode}`;
    if (mode === "no-guess") url += `&difficulty=${encodeURIComponent(difficulty)}`;
    let cancelled = false;
    fetch(url)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data.scores) setScores(data.scores);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [leaderboardRefreshKey, mode, difficulty, showLeaderboard]);

  // Timer
  useEffect(() => {
    if (phase === "playing") {
      timerRef.current = setInterval(() => {
        setElapsedSeconds(s => Math.min(s + 1, 999));
      }, 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [phase]);

  // -- Game-action callbacks (passed into useBoardInput) --

  const handleReveal = useCallback((row: number, col: number) => {
    if (isGenerating) return;
    if (phase === "won" || phase === "lost") return;

    let workingBoard = board;

    if (phase === "idle") {
      if (mode === "no-guess") {
        setIsGenerating(true);
        let resolved = false;
        const applyBoard = (nb: Board) => {
          if (resolved) return;
          resolved = true;
          const revealed = revealCell(nb, row, col);
          setBoard(revealed);
          clientGameIdRef.current = crypto.randomUUID();
          setPhase("playing");
          setIsGenerating(false);
          if (checkWin(revealed)) setPhase("won");
        };

        const worker = new Worker(
          new URL("../lib/board-generator.worker.ts", import.meta.url),
        );
        worker.onmessage = (e) => { worker.terminate(); applyBoard(e.data.board); };
        worker.onerror = () => worker.terminate();
        worker.postMessage({ startRow: row, startCol: col, difficulty });

        setTimeout(() => {
          if (resolved) return;
          fetch(`/api/board?difficulty=${encodeURIComponent(difficulty)}&start_row=${row}&start_col=${col}`)
            .then(res => { if (!res.ok) throw new Error("Server error"); return res.json(); })
            .then(data => { worker.terminate(); applyBoard(decodeBoard(data.board)); })
            .catch(() => {});
        }, 500);
        return;
      }
      workingBoard = generateBoard(row, col, boardConfig);
      clientGameIdRef.current = crypto.randomUUID();
      setPhase("playing");
    }

    if (workingBoard[row][col].isMine) {
      setBoard(revealAllMines(workingBoard, row, col));
      setPhase("lost");
      return;
    }

    const nextBoard = revealCell(workingBoard, row, col);
    setBoard(nextBoard);
    if (checkWin(nextBoard)) setPhase("won");
  }, [board, phase, isGenerating, mode, difficulty, boardConfig]);

  const handleFlag = useCallback((row: number, col: number) => {
    if (phase !== "playing") return;
    setBoard(prev => toggleFlag(prev, row, col, { questionMarks: controls.questionMarks }));
  }, [phase, controls.questionMarks]);

  const handleChord = useCallback((row: number, col: number) => {
    if (phase !== "playing") return;
    const result = chordReveal(board, row, col);
    if (!result) return;
    if (result.hit) {
      setBoard(result.board);
      setPhase("lost");
    } else {
      setBoard(result.board);
      if (checkWin(result.board)) setPhase("won");
    }
  }, [board, phase]);

  const enabled = !isGenerating && phase !== "won" && phase !== "lost";

  const { boardHandlers, cellHandlers, sunkCells } = useBoardInput({
    controls,
    board,
    enabled,
    onReveal: handleReveal,
    onFlag: handleFlag,
    onChord: handleChord,
  });

  const handleReset = useCallback(() => {
    setBoard(createEmptyBoard(boardConfig));
    setPhase("idle");
    setElapsedSeconds(0);
    clientGameIdRef.current = null;
    submittedRef.current = false;
    signInModalDismissedRef.current = false;
    setShowSignInModal(false);
  }, [boardConfig]);

  const handleSizeChange = useCallback((p: BoardSizePreset) => {
    setSizePreset(p);
    setBoard(createEmptyBoard(BOARD_PRESETS[p]));
    setPhase("idle");
    setElapsedSeconds(0);
    clientGameIdRef.current = null;
    submittedRef.current = false;
    signInModalDismissedRef.current = false;
    setShowSignInModal(false);
  }, []);

  // Classic Windows Minesweeper shortcut: F2 starts a new game.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "F2") return;
      e.preventDefault();
      handleReset();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleReset]);

  // Casual touch-device visitors get the small board by default (30 cols is untappable on phones).
  useEffect(() => {
    if (mode !== "random") return;
    if (!window.matchMedia("(pointer: coarse)").matches) return;
    Promise.resolve().then(() => handleSizeChange("beginner"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDifficultyChange = useCallback((d: NoGuessDifficulty) => {
    setDifficulty(d);
    setBoard(createEmptyBoard());
    setPhase("idle");
    setElapsedSeconds(0);
    clientGameIdRef.current = null;
    submittedRef.current = false;
    signInModalDismissedRef.current = false;
    setShowSignInModal(false);
  }, []);

  const flagsRemaining = boardConfig.mines - countFlags(board);

  return (
    <div
      className="flex flex-col xl:flex-row items-center xl:items-start gap-4 select-none"
      style={{
        "--cell-size": `clamp(0.625rem, calc((100vw - 2rem) / ${boardConfig.cols}), 1.75rem)`,
        "--board-width": `calc(${boardConfig.cols} * var(--cell-size) + 8px)`,
      } as CSSProperties}
    >
      <div className="flex flex-col items-center gap-0">
        {mode === "no-guess" && (
          <SelectorTabs options={NO_GUESS_OPTIONS} value={difficulty} onChange={handleDifficultyChange} />
        )}
        {mode === "random" && (
          <SelectorTabs options={SIZE_OPTIONS} value={sizePreset} onChange={handleSizeChange} />
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
            {!isGenerating && phase === "lost" && (
              <span className="text-red-500">Game over — click 🙂 to try again</span>
            )}
          </div>
        )}
        <HowToPlayHint />
      </div>
      {showLeaderboard && (
        <Leaderboard
          username={username}
          refreshKey={leaderboardRefreshKey}
          mode={mode}
          difficulty={mode === "no-guess" ? difficulty : undefined}
          scores={scores}
        />
      )}
      {showSignInModal && (
        <PostWinSignInModal
          onClose={() => {
            signInModalDismissedRef.current = true;
            setShowSignInModal(false);
          }}
          onSignIn={() => {
            if (clientGameIdRef.current) {
              PendingScore.write({
                mode,
                difficulty: mode === "no-guess" ? difficulty : "standard",
                result: "win",
                time_seconds: elapsedSeconds,
                client_game_id: clientGameIdRef.current,
              });
            }
            const next = pathname || "/";
            window.location.assign(`/api/auth/google/init?next=${encodeURIComponent(next)}`);
          }}
        />
      )}
    </div>
  );
}
