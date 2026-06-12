// save.ts — localStorage persistence, export/import, migration.

import type { GameState } from "./state";
import { newGame, SAVE_VERSION } from "./state";

const KEY = "deep-time-save-v1";

export function save(s: GameState): void {
  try {
    s.lastSave = Date.now();
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch (e) {
    console.warn("Deep Time: save failed", e);
  }
}

export function load(): GameState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<GameState>;
    return migrate(parsed);
  } catch (e) {
    console.warn("Deep Time: load failed", e);
    return null;
  }
}

/** Merge a parsed save into a fresh state to tolerate missing/added fields. */
function migrate(parsed: Partial<GameState>): GameState {
  const base = newGame(parsed.res?.negentropy ?? 0, parsed.prestigeCount ?? 0);
  const merged: GameState = {
    ...base,
    ...parsed,
    version: SAVE_VERSION,
    res: { ...base.res, ...(parsed.res ?? {}) },
    upgrades: { ...(parsed.upgrades ?? {}) },
    flags: { ...(parsed.flags ?? {}) },
    achievements: { ...(parsed.achievements ?? {}) },
  };
  // Guard against a corrupt lastTick in the future.
  if (!merged.lastTick || merged.lastTick > Date.now()) merged.lastTick = Date.now();
  return merged;
}

export function clearSave(): void {
  try {
    localStorage.removeItem(KEY);
  } catch (e) {
    console.warn("Deep Time: clear failed", e);
  }
}

/** Export as a base64 string the player can copy. */
export function exportSave(s: GameState): string {
  const json = JSON.stringify(s);
  return btoa(encodeURIComponent(json));
}

/** Import from a base64 string. Returns null on failure. */
export function importSave(str: string): GameState | null {
  try {
    const json = decodeURIComponent(atob(str.trim()));
    const parsed = JSON.parse(json) as Partial<GameState>;
    return migrate(parsed);
  } catch (e) {
    console.warn("Deep Time: import failed", e);
    return null;
  }
}
