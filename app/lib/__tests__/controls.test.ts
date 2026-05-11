import { describe, it, expect } from "vitest";
import {
  parseControls,
  DEFAULT_CONTROLS,
  CONTROLS_STORAGE_KEY,
  type ControlsPrefs,
} from "../controls";

describe("parseControls", () => {
  it("returns defaults for undefined / null / non-object input", () => {
    expect(parseControls(undefined)).toEqual(DEFAULT_CONTROLS);
    expect(parseControls(null)).toEqual(DEFAULT_CONTROLS);
    expect(parseControls("string")).toEqual(DEFAULT_CONTROLS);
    expect(parseControls(42)).toEqual(DEFAULT_CONTROLS);
  });

  it("returns defaults for empty object", () => {
    expect(parseControls({})).toEqual(DEFAULT_CONTROLS);
  });

  it("passes valid values through unchanged", () => {
    const valid: ControlsPrefs = {
      chordTrigger: "middle-click",
      spacebarAction: "flag-only",
      questionMarks: true,
    };
    expect(parseControls(valid)).toEqual(valid);
  });

  it("falls back to default for invalid enum values", () => {
    expect(
      parseControls({
        chordTrigger: "bogus",
        spacebarAction: 17,
        questionMarks: false,
      }),
    ).toEqual({
      chordTrigger: DEFAULT_CONTROLS.chordTrigger,
      spacebarAction: DEFAULT_CONTROLS.spacebarAction,
      questionMarks: false,
    });
  });

  it("falls back to default for non-boolean questionMarks", () => {
    expect(
      parseControls({
        chordTrigger: "double-click",
        spacebarAction: "off",
        questionMarks: "true",
      }),
    ).toEqual({
      chordTrigger: "double-click",
      spacebarAction: "off",
      questionMarks: DEFAULT_CONTROLS.questionMarks,
    });
  });

  it("fills in missing keys with defaults", () => {
    expect(parseControls({ chordTrigger: "none" })).toEqual({
      chordTrigger: "none",
      spacebarAction: DEFAULT_CONTROLS.spacebarAction,
      questionMarks: DEFAULT_CONTROLS.questionMarks,
    });
  });

  it("drops unknown keys", () => {
    const input: unknown = {
      chordTrigger: "middle-click",
      spacebarAction: "flag-only",
      questionMarks: true,
      extraGarbage: "ignored",
      anotherOne: 99,
    };
    const result = parseControls(input);
    expect(result).toEqual({
      chordTrigger: "middle-click",
      spacebarAction: "flag-only",
      questionMarks: true,
    });
    expect((result as unknown as Record<string, unknown>).extraGarbage).toBeUndefined();
  });

  it("accepts every documented enum value", () => {
    for (const t of ["both-buttons", "middle-click", "double-click", "none"] as const) {
      expect(parseControls({ chordTrigger: t }).chordTrigger).toBe(t);
    }
    for (const a of ["flag-or-chord", "flag-only", "off"] as const) {
      expect(parseControls({ spacebarAction: a }).spacebarAction).toBe(a);
    }
  });
});

describe("CONTROLS_STORAGE_KEY", () => {
  it("includes a version suffix so we can migrate later", () => {
    expect(CONTROLS_STORAGE_KEY).toMatch(/:v\d+$/);
  });
});
