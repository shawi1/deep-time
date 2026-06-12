// format.ts — big-number formatting and helpers.
// Supports values into the 1e300+ range: named suffixes first, then scientific.

const SUFFIXES = [
  "", "K", "M", "B", "T", // thousand .. trillion
  "Qa", "Qi", "Sx", "Sp", "Oc", "No", // quadrillion .. nonillion
  "Dc", "UDc", "DDc", "TDc", "QaDc", "QiDc", "SxDc", "SpDc", "OcDc", "NoDc", // decillion ..
  "Vg", "UVg", "DVg", "TVg", "QaVg", "QiVg", "SxVg", "SpVg", "OcVg", "NoVg", // vigintillion ..
  "Tg", "UTg", "DTg", "TTg", "QaTg", "QiTg", "SxTg", "SpTg", "OcTg", "NoTg", // trigintillion ..
];

/**
 * Format a number for display.
 * - < 1000 shows with adaptive decimals.
 * - up to ~1e123 uses named suffixes (1.23 M, 4.56 Qa, ...).
 * - beyond that, falls back to scientific notation (1.23e150).
 */
export function fmt(n: number, decimals = 2): string {
  if (!isFinite(n)) return "∞"; // infinity symbol
  if (n === 0) return "0";
  const neg = n < 0;
  let v = Math.abs(n);

  if (v < 1000) {
    let out: string;
    if (v < 0.01) out = v.toExponential(2);
    else if (v < 1) out = v.toFixed(2);
    else if (Number.isInteger(v)) out = v.toFixed(0);
    else out = v.toFixed(v < 10 ? 2 : v < 100 ? 1 : 0);
    return neg ? "-" + out : out;
  }

  const tier = Math.floor(Math.log10(v) / 3);
  if (tier < SUFFIXES.length) {
    const scaled = v / Math.pow(1000, tier);
    const out =
      scaled.toFixed(scaled < 10 ? decimals : scaled < 100 ? 1 : 0) +
      " " +
      SUFFIXES[tier];
    return neg ? "-" + out : out;
  }

  // Scientific notation for the truly cosmic.
  const exp = Math.floor(Math.log10(v));
  const mantissa = v / Math.pow(10, exp);
  const out = mantissa.toFixed(2) + "e" + exp;
  return neg ? "-" + out : out;
}

/** Format a per-second rate. */
export function fmtRate(n: number): string {
  return fmt(n) + "/s";
}

/** Format a 0..1 value as a percentage. */
export function fmtPct(frac: number, decimals = 1): string {
  return (frac * 100).toFixed(decimals) + "%";
}

/** Format a duration in seconds as a human string. */
export function fmtTime(seconds: number): string {
  if (seconds < 0 || !isFinite(seconds)) return "∞";
  seconds = Math.floor(seconds);
  if (seconds < 60) return seconds + "s";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  if (h < 24) return `${h}h ${mm}m`;
  const d = Math.floor(h / 24);
  const hh = h % 24;
  return `${d}d ${hh}h`;
}

/** Linear interpolation. */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
