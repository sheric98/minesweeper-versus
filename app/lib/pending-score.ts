const KEY = "minesweeper.pendingScore";
const TTL_MS = 10 * 60 * 1000; // 10 minutes

export type PendingScoreInput = {
  mode: "random" | "no-guess";
  difficulty: "standard" | "beginner" | "intermediate" | "advanced" | "expert";
  result: "win" | "loss";
  time_seconds: number | null;
  client_game_id: string;
};

export type PendingScore = PendingScoreInput & { expiresAt: number };

const VALID_DIFFICULTIES = new Set([
  "standard", "beginner", "intermediate", "advanced", "expert",
]);

function isValid(value: unknown): value is PendingScore {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (v.mode !== "random" && v.mode !== "no-guess") return false;
  if (typeof v.difficulty !== "string" || !VALID_DIFFICULTIES.has(v.difficulty)) return false;
  if (v.result !== "win" && v.result !== "loss") return false;
  if (v.result === "win" && typeof v.time_seconds !== "number") return false;
  if (v.result === "loss" && v.time_seconds !== null) return false;
  if (typeof v.client_game_id !== "string") return false;
  if (typeof v.expiresAt !== "number") return false;
  return true;
}

export function read(): PendingScore | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!isValid(parsed)) {
      window.localStorage.removeItem(KEY);
      return null;
    }
    if (Date.now() > parsed.expiresAt) {
      window.localStorage.removeItem(KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function write(input: PendingScoreInput): void {
  try {
    const entry: PendingScore = { ...input, expiresAt: Date.now() + TTL_MS };
    window.localStorage.setItem(KEY, JSON.stringify(entry));
  } catch {
    // localStorage unavailable (private mode / quota / disabled) — silent.
  }
}

export function clear(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
