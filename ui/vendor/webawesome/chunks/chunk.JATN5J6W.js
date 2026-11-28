/*! Copyright 2026 Fonticons, Inc. - https://webawesome.com/license */

// src/internal/animate.ts
async function animate(el, keyframes, options) {
  return el.animate(keyframes, options).finished.catch(() => {
  });
}
async function animateWithClass(el, className) {
  el.getAnimations();
  el.classList.add(className);
  await new Promise((resolve) => requestAnimationFrame(() => resolve()));
  const animationPromises = [];
  for (const animation of el.getAnimations()) {
    if (animation instanceof CSSAnimation && animation.effect?.getComputedTiming().endTime !== Infinity) {
      animationPromises.push(animation.finished);
    }
  }
  await Promise.allSettled(animationPromises);
  el.classList.remove(className);
}
function parseDuration(duration) {
  duration = duration.toString().toLowerCase();
  if (duration.indexOf("ms") > -1) {
    return parseFloat(duration) || 0;
  }
  if (duration.indexOf("s") > -1) {
    return (parseFloat(duration) || 0) * 1e3;
  }
  return parseFloat(duration) || 0;
}
function prefersReducedMotion() {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  return query.matches;
}

export {
  animate,
  animateWithClass,
  parseDuration,
  prefersReducedMotion
};
