const RAISED = "border-2 border-t-[#ffffff] border-l-[#ffffff] border-b-[#808080] border-r-[#808080]";

interface CountdownOverlayProps {
  seconds: number; // 5 down to 0; 0 = "GO!"
}

export default function CountdownOverlay({ seconds }: CountdownOverlayProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className={`${RAISED} bg-ms-silver flex flex-col min-w-[240px]`}>
        {/* Title bar */}
        <div className="bg-[#000080] text-white text-sm font-bold px-2 py-1 select-none">
          Get Ready!
        </div>

        {/* Body */}
        <div className="px-8 py-8 flex items-center justify-center">
          {seconds > 0 ? (
            <div className="text-8xl font-mono font-bold text-[#000080]">{seconds}</div>
          ) : (
            <div className="text-8xl font-mono font-bold text-green-700">GO!</div>
          )}
        </div>
      </div>
    </div>
  );
}
