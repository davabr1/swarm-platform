// Flat platform margin applied to every paid call on top of
// (creator commission + measured AI cost). 0.01 = 1%.
//
// The ceiling multiplier is the same rate + 1 — it pre-authorizes the
// settlement amount ahead of the actual AI cost being known.
export const PLATFORM_FEE_RATE = 0.01;
export const PLATFORM_FEE_CEILING_MULTIPLIER = 1 + PLATFORM_FEE_RATE;
