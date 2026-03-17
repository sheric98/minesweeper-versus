import { RAISED_OUTER } from "@/app/lib/win95";

const RAISED = RAISED_OUTER;

interface CountdownOverlayProps {
  seconds: number; // 5 down to 0; 0 = "GO!"
}

export default function CountdownOverlay({ seconds }: CountdownOverlayProps) {
  return (
    <div className={`${RAISED} bg-ms-silver flex items-center justify-center gap-4 px-4 py-2 w-full`}>
      {seconds > 0 ? (
        <>
          <span className="text-3xl font-mono font-bold text-[#000080]">{seconds}</span>
          <span className="text-sm font-bold text-[#000080] select-none">Get Ready!</span>
        </>
      ) : (
        <span className="text-3xl font-mono font-bold text-green-700">GO!</span>
      )}
    </div>
  );
}
