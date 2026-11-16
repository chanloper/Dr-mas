// Existing setting is session state, reset on logout; no new storage/API contract.
export function normalizeSosDelay(value: number): number {
  return Number.isFinite(value) ? Math.max(10, Math.min(60, Math.round(value))) : 10;
}
export function sosDelayAtPosition(x: number, width: number): number {
  return normalizeSosDelay(10 + 50 * Math.max(0, Math.min(1, x / Math.max(1, width))));
}
