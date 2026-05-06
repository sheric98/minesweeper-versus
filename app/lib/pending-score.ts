const KEY = "minesweeper.pendingScore";
const TTL_MS = 10 * 60 * 1000; // 10 minutes

export type PendingScoreInput = {
  time_seconds: number;
  mode: "random" | "no-guess";
  difficulty?: "beginner" | "intermediate" | "expert";
};

export type PendingScore = PendingScoreInput & { expiresAt: number };

function isValid(value: unknown): value is PendingScore {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (typeof v.time_seconds !== "number") return false;
  if (v.mode !== "random" && v.mode !== "no-guess") return false;
  if (
    v.difficulty !== undefined &&
    v.difficulty !== "beginner" &&
    v.difficulty !== "intermediate" &&
    v.difficulty !== "expert"
  ) {
    return false;
  }
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
