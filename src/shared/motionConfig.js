export const THOMAS_EASE_PATH = `M0,0 C0.625,0.05 0,1 1,1`;
export function thomasEase(progress) {
  const x = Math.min(1, Math.max(0, progress));
  if (x === 0 || x === 1) {
    return x;
  }
  let low = 0;
  let high = 1;
  let t = x;
  for (let i = 0; i < 16; i += 1) {
    const inverse = 1 - t;
    const atX = 3 * inverse * inverse * t * 0.625 + t * t * t;
    if (atX < x) {
      low = t;
    } else {
      high = t;
    }
    t = (low + high) * 0.5;
  }
  const inverse = 1 - t;
  return 3 * inverse * inverse * t * 0.05 + 3 * inverse * t * t + t * t * t;
}
export const ease = {
  thomas: `thomas`,
  enter: `thomas`,
  exit: `power2.in`,
  drag: `power3.out`,
  linear: `none`,
  snap: `power1.out`,
  fade: `sine.inOut`,
};
export const duration = {
  snap: 0.22,
  short: 0.36,
  base: 0.55,
  enter: 0.72,
  text: 1.05,
  exit: 1.05,
  wipe: 1.76,
  fly: 0.7,
  lift: 0.4,
  scan: 0.52,
  intro: 2.1,
  parallax: 0.85,
  expand: 1.35,
};
export const stagger = {
  tight: 0.05,
  fly: 0.07,
  item: 0.1,
  slot: 0.12,
  line: 0.36,
};
export const delay = {
  intro: 0.08,
  enter: 0.14,
  wipe: 0.16,
  well: 0.12,
  fly: 0.04,
};
export const reveal = {
  soft: 0.14,
  overshoot: 0.1,
};
export const motion = {
  ease,
  duration,
  stagger,
  delay,
  reveal,
};
