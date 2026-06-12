// state.ts — the single serializable game-state object and resource model.

export const SAVE_VERSION = 1;

export type Phase = 1 | 2 | 3 | 4 | 5; // 5 = ending reached

/** Every resource the game tracks. Not all are visible in every phase. */
export interface Resources {
  // Phase 1 — Primordial Chemistry
  energy: number; // free energy
  molecules: number; // organic molecules
  replicators: number; // self-replicating molecules

  // Phase 2 — Life & Evolution
  biomass: number;
  mutation: number; // mutation points
  population: number; // abstract organism population (carrying-capacity dynamics)

  // Phase 3 — Intelligence & Civilization
  people: number; // civilization population
  knowledge: number;
  industry: number; // stored industrial output

  // Phase 4 — Cosmic
  matter: number; // raw matter harvested
  computation: number; // converted compute
  stars: number; // stars enclosed by Dyson swarms

  // Meta
  negentropy: number; // prestige meta-currency
}

export interface GameState {
  version: number;
  phase: Phase;
  entropy: number; // the universal clock; always rising
  res: Resources;

  // purchased counts keyed by upgrade id
  upgrades: Record<string, number>;
  // boolean flags for one-time tech / traits / milestones
  flags: Record<string, boolean>;
  // achievements unlocked
  achievements: Record<string, boolean>;

  // automation toggles
  autoCatalyze: boolean;

  // run + meta stats
  runStart: number; // wall-clock ms when this run began
  totalClicks: number;
  lastSave: number; // wall-clock ms
  lastTick: number; // wall-clock ms of last processed tick (for offline)

  // meta progression across prestiges
  prestigeCount: number;
  bestEntropyAtEnd: number;

  // settings
  muted: boolean;

  // ending bookkeeping
  endingChoice: "burn" | "seed" | null;
}

function freshResources(): Resources {
  return {
    energy: 0,
    molecules: 0,
    replicators: 0,
    biomass: 0,
    mutation: 0,
    population: 0,
    people: 0,
    knowledge: 0,
    industry: 0,
    matter: 0,
    computation: 0,
    stars: 0,
    negentropy: 0,
  };
}

export function newGame(carryNegentropy = 0, prestigeCount = 0): GameState {
  const now = Date.now();
  const res = freshResources();
  res.negentropy = carryNegentropy;
  return {
    version: SAVE_VERSION,
    phase: 1,
    entropy: 0,
    res,
    upgrades: {},
    flags: {},
    achievements: {},
    autoCatalyze: false,
    runStart: now,
    totalClicks: 0,
    lastSave: now,
    lastTick: now,
    prestigeCount,
    bestEntropyAtEnd: 0,
    muted: false,
    endingChoice: null,
  };
}

/** Number of a given upgrade owned. */
export function owned(s: GameState, id: string): number {
  return s.upgrades[id] ?? 0;
}

export function hasFlag(s: GameState, id: string): boolean {
  return !!s.flags[id];
}
