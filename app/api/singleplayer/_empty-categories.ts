const ALL_CATEGORIES: Array<{ mode: string; difficulty: string }> = [
  { mode: "random", difficulty: "standard" },
  { mode: "no-guess", difficulty: "beginner" },
  { mode: "no-guess", difficulty: "intermediate" },
  { mode: "no-guess", difficulty: "advanced" },
  { mode: "no-guess", difficulty: "expert" },
];

export function emptyCategories() {
  return ALL_CATEGORIES.map((c) => ({
    mode: c.mode,
    difficulty: c.difficulty,
    total_wins: 0,
    fastest_win_seconds: null,
    recent_count: 0,
    recent_wins: 0,
    recent_avg_win_seconds: null,
  }));
}
