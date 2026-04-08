// Shared mock state for queue routes (dev mode only).
// Module-level state persists across requests within the same dev server process.

export let queueJoinedAt: number | null = null;

export function setQueueJoinedAt(t: number | null) {
  queueJoinedAt = t;
}
