const SPINNER_FRAMES: ReadonlyArray<string> = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const WORKING_DOTS_FRAMES: ReadonlyArray<string> = [".   ", "..  ", "... ", "...."];

export const ANIMATION_FRAME_MS = 80;
const WORKING_DOTS_FRAME_MS = 400;

function frameAt(frames: ReadonlyArray<string>, intervalMs: number): string {
  const idx = Math.floor(Date.now() / intervalMs) % frames.length;
  return frames[idx] ?? frames[0] ?? "";
}

export function spinnerFrame() {
  return frameAt(SPINNER_FRAMES, ANIMATION_FRAME_MS);
}

export function workingDots() {
  return frameAt(WORKING_DOTS_FRAMES, WORKING_DOTS_FRAME_MS);
}
