// Win95-style bevel border constants
// Two color schemes: "outer" (white/dark gray) for windows & dialogs,
// "inner" (light gray/medium gray) for controls within panels.

// Outer window bevels — white highlights, #808080 shadows
export const RAISED_OUTER =
  "border-2 border-t-[#ffffff] border-l-[#ffffff] border-b-[#808080] border-r-[#808080]";
export const SUNKEN_OUTER =
  "border-2 border-t-[#808080] border-l-[#808080] border-b-[#ffffff] border-r-[#ffffff]";
export const PRESSED = SUNKEN_OUTER;

// Inner control bevels — #d8d8d8 highlights, #a0a0a0 shadows
export const RAISED_INNER =
  "border-2 border-t-[#d8d8d8] border-l-[#d8d8d8] border-b-[#a0a0a0] border-r-[#a0a0a0]";
export const SUNKEN_INNER =
  "border-2 border-t-[#a0a0a0] border-l-[#a0a0a0] border-b-[#d8d8d8] border-r-[#d8d8d8]";
