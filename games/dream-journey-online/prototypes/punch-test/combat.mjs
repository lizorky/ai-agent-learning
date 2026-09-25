export const FPS = 24;
export const FRAME_COUNT = 14;
export const ACTIVE = new Set([4, 5, 6]);
export function intersects(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
export function createAttack() { return { elapsed: 0, hit: false }; }
export function advanceAttack(attack, dt, box, target, activeFrames = ACTIVE, frameCount = FRAME_COUNT) {
  attack.elapsed += dt;
  const frame = Math.min(frameCount - 1, Math.floor(attack.elapsed * FPS));
  const hit = !attack.hit && activeFrames.has(frame) && box && intersects(box, target);
  if (hit) attack.hit = true;
  return { frame, hit: Boolean(hit), done: attack.elapsed >= frameCount / FPS };
}
