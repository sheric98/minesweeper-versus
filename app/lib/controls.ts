export type ChordTrigger = "both-buttons" | "middle-click" | "double-click" | "none";
export type SpacebarAction = "flag-or-chord" | "flag-only" | "off";

export interface ControlsPrefs {
  chordTrigger: ChordTrigger;
  spacebarAction: SpacebarAction;
  questionMarks: boolean;
}

export const DEFAULT_CONTROLS: ControlsPrefs = {
  chordTrigger: "both-buttons",
  spacebarAction: "flag-or-chord",
  questionMarks: false,
};

export const CONTROLS_STORAGE_KEY = "minesweeper:controls:v1";

const CHORD_TRIGGERS: readonly ChordTrigger[] = [
  "both-buttons",
  "middle-click",
  "double-click",
  "none",
];
const SPACEBAR_ACTIONS: readonly SpacebarAction[] = [
  "flag-or-chord",
  "flag-only",
  "off",
];

function isChordTrigger(v: unknown): v is ChordTrigger {
  return typeof v === "string" && (CHORD_TRIGGERS as readonly string[]).includes(v);
}

function isSpacebarAction(v: unknown): v is SpacebarAction {
  return typeof v === "string" && (SPACEBAR_ACTIONS as readonly string[]).includes(v);
}

export function parseControls(input: unknown): ControlsPrefs {
  if (!input || typeof input !== "object") return { ...DEFAULT_CONTROLS };
  const o = input as Record<string, unknown>;
  return {
    chordTrigger: isChordTrigger(o.chordTrigger) ? o.chordTrigger : DEFAULT_CONTROLS.chordTrigger,
    spacebarAction: isSpacebarAction(o.spacebarAction) ? o.spacebarAction : DEFAULT_CONTROLS.spacebarAction,
    questionMarks: typeof o.questionMarks === "boolean" ? o.questionMarks : DEFAULT_CONTROLS.questionMarks,
  };
}
