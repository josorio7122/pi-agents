export const SPINNER_FRAMES: ReadonlyArray<string> = [
  "\u280B",
  "\u2819",
  "\u2839",
  "\u2838",
  "\u283C",
  "\u2834",
  "\u2826",
  "\u2827",
  "\u2807",
  "\u280F",
];

const WORKING_DOTS_FRAMES: ReadonlyArray<string> = [".", "..", "...", "...."];

export const ANIMATION_FRAME_MS = 80;

export function spinnerFrame() {
  return SPINNER_FRAMES[Math.floor(Date.now() / ANIMATION_FRAME_MS) % SPINNER_FRAMES.length] ?? "\u280B";
}

export function workingDots() {
  return WORKING_DOTS_FRAMES[Math.floor(Date.now() / ANIMATION_FRAME_MS) % WORKING_DOTS_FRAMES.length] ?? ".";
}
