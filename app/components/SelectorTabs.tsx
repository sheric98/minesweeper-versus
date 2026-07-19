import { RAISED_INNER, SUNKEN_INNER } from "@/app/lib/win95";

interface SelectorTabsProps<T extends string> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}

export default function SelectorTabs<T extends string>({ options, value, onChange }: SelectorTabsProps<T>) {
  return (
    <div className="flex" style={{ width: "var(--board-width)" }}>
      {options.map(({ value: v, label }) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={`flex-1 px-2 py-1 text-xs font-bold cursor-pointer bg-[#c0c0c0] ${v === value ? SUNKEN_INNER : RAISED_INNER}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
