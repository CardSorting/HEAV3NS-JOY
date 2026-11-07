/** [LAYER: PLUMBING] */
/**
 * Stateless currency rounding and percentage calculation primitives.
 * Leaf layer: zero project imports, zero mutable state.
 */

export function roundCurrency(cents) {
  if (!Number.isFinite(cents)) {
    return 0;
  }
  return Math.round(cents);
}

export function applyBasisPointsDiscount(amountCents, basisPoints) {
  if (amountCents <= 0 || basisPoints <= 0) {
    return roundCurrency(amountCents);
  }
  const cappedBps = Math.min(10000, Math.max(0, basisPoints));
  const discount = Math.floor((amountCents * cappedBps) / 10000);
  return roundCurrency(amountCents - discount);
}

