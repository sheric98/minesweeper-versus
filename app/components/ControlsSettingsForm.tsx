"use client";

import { useControls } from "@/app/components/ControlsProvider";
import {
  type ChordTrigger,
  type SpacebarAction,
  type ControlsPrefs,
  DEFAULT_CONTROLS,
} from "@/app/lib/controls";
import { RAISED_INNER, SUNKEN_INNER, RAISED_OUTER } from "@/app/lib/win95";

const CHORD_OPTIONS: { value: ChordTrigger; label: string; description: string }[] = [
  { value: "both-buttons", label: "Both mouse buttons", description: "Hold left + right and release on a revealed numbered cell. (Default)" },
  { value: "middle-click", label: "Middle-click",      description: "Click the middle mouse button on a revealed numbered cell." },
  { value: "double-click", label: "Double-click",      description: "Double-click a revealed numbered cell." },
  { value: "none",         label: "Disabled",          description: "No mouse chord. Spacebar can still chord." },
];

const SPACEBAR_OPTIONS: { value: SpacebarAction; label: string; description: string }[] = [
  { value: "flag-or-chord", label: "Flag or chord", description: "Flag unrevealed cells; chord revealed numbered cells. (Default)" },
  { value: "flag-only",     label: "Flag only",     description: "Flag unrevealed cells; do nothing on revealed cells." },
  { value: "off",           label: "Disabled",      description: "Spacebar does nothing." },
];

interface Props {
  authLevel?: "anonymous" | "google";
}

export default function ControlsSettingsForm({ authLevel }: Props) {
  const { controls, updateControls, resetControls } = useControls();

  return (
    <div className={`bg-ms-silver ${RAISED_OUTER} p-6 max-w-xl mx-auto mt-6 font-mono text-sm`}>
      <h1 className="text-lg font-bold mb-4">Controls</h1>

      <Section title="Chord trigger" description="How to trigger a chord with the mouse on a revealed numbered cell.">
        {CHORD_OPTIONS.map(opt => (
          <RadioRow
            key={opt.value}
            name="chordTrigger"
            value={opt.value}
            label={opt.label}
            description={opt.description}
            checked={controls.chordTrigger === opt.value}
            onChange={() => updateControls({ chordTrigger: opt.value })}
          />
        ))}
      </Section>

      <Section title="Spacebar action" description="What spacebar does over the hovered cell.">
        {SPACEBAR_OPTIONS.map(opt => (
          <RadioRow
            key={opt.value}
            name="spacebarAction"
            value={opt.value}
            label={opt.label}
            description={opt.description}
            checked={controls.spacebarAction === opt.value}
            onChange={() => updateControls({ spacebarAction: opt.value })}
          />
        ))}
      </Section>

      <Section title="Question marks" description="When on, right-click cycles unrevealed -> flagged -> ? -> unrevealed.">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            className="w-4 h-4"
            checked={controls.questionMarks}
            onChange={e => updateControls({ questionMarks: e.target.checked })}
          />
          <span>Enable question-mark cycle</span>
        </label>
      </Section>

      <div className="flex items-center justify-between mt-6">
        <button
          type="button"
          onClick={resetControls}
          className={`px-4 py-1 cursor-pointer bg-[#c0c0c0] ${RAISED_INNER} active:${SUNKEN_INNER}`}
        >
          Reset to defaults
        </button>
        <DefaultsHint controls={controls} />
      </div>

      <p className="mt-6 text-xs text-[#606060]">
        {authLevel === "google"
          ? "Synced to your account."
          : (
            <>
              Sign in with Google to sync settings across devices.
              {" "}
              <a href="/api/auth/google/init?next=/settings" className="underline">Sign in</a>
            </>
          )}
      </p>
    </div>
  );
}

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <fieldset className={`${SUNKEN_INNER} bg-ms-silver p-3 mt-4`}>
      <legend className="px-2 font-bold">{title}</legend>
      <p className="text-xs text-[#606060] mb-2">{description}</p>
      <div className="flex flex-col gap-2">{children}</div>
    </fieldset>
  );
}

function RadioRow({
  name, value, label, description, checked, onChange,
}: {
  name: string; value: string; label: string; description: string;
  checked: boolean; onChange: () => void;
}) {
  return (
    <label className="flex items-start gap-2 cursor-pointer select-none">
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
        className="mt-0.5"
      />
      <span>
        <span className="font-bold">{label}</span>
        <span className="block text-xs text-[#606060]">{description}</span>
      </span>
    </label>
  );
}

function DefaultsHint({ controls }: { controls: ControlsPrefs }) {
  const isDefault =
    controls.chordTrigger === DEFAULT_CONTROLS.chordTrigger &&
    controls.spacebarAction === DEFAULT_CONTROLS.spacebarAction &&
    controls.questionMarks === DEFAULT_CONTROLS.questionMarks;
  return (
    <span className="text-xs text-[#606060]">
      {isDefault ? "Using defaults." : "Custom settings."}
    </span>
  );
}
