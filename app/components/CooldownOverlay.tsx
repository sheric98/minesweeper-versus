interface CooldownOverlayProps {
  remainingMs: number;
}

export default function CooldownOverlay({ remainingMs }: CooldownOverlayProps) {
  const seconds = (remainingMs / 1000).toFixed(1);

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-red-900/40 z-10">
      <div className="bg-ms-silver border-2 border-t-[#d8d8d8] border-l-[#d8d8d8] border-b-[#a0a0a0] border-r-[#a0a0a0] px-6 py-4 text-center">
        <div className="text-4xl font-bold font-mono text-red-700">{seconds}s</div>
        <div className="text-sm text-ms-dark mt-1">Cooldown</div>
      </div>
    </div>
  );
}
