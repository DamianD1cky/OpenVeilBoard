import gsap from "../../vendor/gsap/index.js";
import { CustomEase } from "../../vendor/gsap/CustomEase.js";
import { THOMAS_EASE_PATH, duration, ease } from "./motionConfig.js";
export * from "./motionConfig.js";
export { gsap };
gsap.registerPlugin(CustomEase);
CustomEase.create(`thomas`, THOMAS_EASE_PATH);
gsap.defaults({
  ease: ease.thomas,
  duration: duration.enter,
});
export function prefersReducedMotion() {
  return (
    typeof window !== `undefined` && window.matchMedia(`(prefers-reduced-motion: reduce)`).matches
  );
}
export function whenMotion(seconds, fallback = 0) {
  return prefersReducedMotion() ? fallback : seconds;
}
export function afterExits(promises, overlap = duration.enter) {
  const waits = (Array.isArray(promises) ? promises : [promises]).map(
    (promise) => promise ?? Promise.resolve(),
  );
  const all = Promise.all(waits);
  const lead = whenMotion(overlap);
  if (!lead) {
    return all;
  }
  const early = Math.max(whenMotion(duration.exit) - lead, 0);
  return new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) {
        return;
      }
      settled = true;
      resolve();
    };
    all.then(done, done);
    gsap.delayedCall(early, done);
  });
}
export function tweenVars(vars = {}) {
  return {
    ease: ease.thomas,
    ...vars,
    duration: whenMotion(vars.duration ?? duration.enter),
    delay: whenMotion(vars.delay ?? 0),
  };
}
