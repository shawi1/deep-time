// sim.ts — the fixed-timestep simulation. Pure-ish functions over GameState.
// Production rates, entropy dynamics, costs, buying, phase transitions, prestige.

import type { GameState, Resources, Phase } from "./state";
import { owned, hasFlag, newGame } from "./state";
import { UPGRADES, ACHIEVEMENTS, type Upgrade, type Cost, type ResKey } from "./content";
import { clamp } from "./format";

export const TICK_RATE = 20; // ticks per second
export const TICK_MS = 1000 / TICK_RATE;
export const OFFLINE_CAP_S = 4 * 3600; // cap offline progress at 4 hours

const upgradeById: Record<string, Upgrade> = {};
for (const u of UPGRADES) upgradeById[u.id] = u;

// ---------------------------------------------------------------------------
// Meta / prestige multipliers derived from banked negentropy.
// ---------------------------------------------------------------------------

/** Production multiplier from negentropy (gentle, compounding). */
export function negentropyProdMult(s: GameState): number {
  return 1 + Math.log10(1 + s.res.negentropy) * 0.5;
}
/** Entropy-rate reduction from negentropy (caps at ~60%). */
export function negentropyEntropyResist(s: GameState): number {
  const r = Math.log10(1 + s.res.negentropy) * 0.08;
  return clamp(r, 0, 0.6);
}

// ---------------------------------------------------------------------------
// Derived production. Returns per-second deltas for each resource and the
// current entropy rate. Kept side-effect free so UI can preview it.
// ---------------------------------------------------------------------------

export interface Production {
  perSec: Partial<Record<ResKey, number>>;
  entropyRate: number;
  carryingCapacity: number; // phase 2 population cap
}

export function computeProduction(s: GameState): Production {
  const perSec: Partial<Record<ResKey, number>> = {};
  const add = (k: ResKey, v: number) => (perSec[k] = (perSec[k] ?? 0) + v);

  const metaMult = negentropyProdMult(s);

  // ---- Phase 1: chemistry ----
  const vents = owned(s, "vent");
  const catalysts = owned(s, "catalyst");
  const lipids = owned(s, "lipid");
  const autoc = owned(s, "autocatset");

  // replicator multipliers
  let repMult = Math.pow(1.08, autoc);
  if (hasFlag(s, "rna")) repMult *= 3;

  add("energy", vents * 0.3 * metaMult);
  add("molecules", catalysts * 0.5 * metaMult);
  // replicators need molecules present to grow
  if (s.res.molecules > 1) {
    add("replicators", lipids * 0.05 * repMult * metaMult);
  }

  // ---- Phase 2: life ----
  let carryingCapacity = 0;
  if (s.phase >= 2) {
    const radiation = owned(s, "evolvepool");
    let bioMult = Math.pow(1.12, radiation) * metaMult;
    let capMult = Math.pow(1.06, radiation);
    if (hasFlag(s, "photo")) { bioMult *= 2.5; capMult *= 1.5; }
    if (hasFlag(s, "multi")) { bioMult *= 3; capMult *= 2; }

    if (hasFlag(s, "metabolism")) {
      // biomass scales with population fraction filled
      carryingCapacity = 1000 * capMult * (hasFlag(s, "photo") ? 4 : 1);
      const fill = carryingCapacity > 0 ? s.res.population / carryingCapacity : 0;
      add("biomass", (0.5 + s.res.population * 0.01) * bioMult);

      // logistic population growth toward carrying capacity
      const growthRate = 0.15 * (hasFlag(s, "photo") ? 1.5 : 1);
      const popDelta = growthRate * s.res.population * (1 - fill) + (s.res.population < 1 ? 1 : 0);
      add("population", popDelta);

      // mutation points
      let mutGain = 0.2 + s.res.biomass * 0.0005;
      if (hasFlag(s, "predation")) mutGain *= 2.5;
      if (hasFlag(s, "sexual")) mutGain *= 3;
      add("mutation", mutGain * metaMult);

      // proto-knowledge feeds the transition once nervous systems exist
      if (hasFlag(s, "nervous")) add("knowledge", s.res.population * 0.001);
    }
  }

  // ---- Phase 3: civilization ----
  if (s.phase >= 3) {
    const cities = owned(s, "city");
    const unis = owned(s, "university");
    const factories = owned(s, "factory");

    let peopleRate = 0;
    let knowRate = 0;
    let indRate = 0;

    if (hasFlag(s, "agri")) peopleRate += 1;
    peopleRate += cities * 2 + factories * 0; // people from cities
    knowRate += unis * 3 + factories * 4;
    indRate += cities * 1 + factories * 6;

    if (hasFlag(s, "writing")) knowRate *= 2;
    if (hasFlag(s, "computers")) knowRate *= 3;
    if (hasFlag(s, "industrial")) indRate *= 4;

    // people also grow logistically vs a soft cap tied to industry+knowledge
    const civCap = 1000 + cities * 5000 + factories * 2000;
    const fill = clamp(s.res.people / civCap, 0, 1);
    peopleRate += 0.05 * s.res.people * (1 - fill);

    // knowledge scales mildly with people
    knowRate += s.res.people * 0.0008;

    add("people", peopleRate * metaMult);
    add("knowledge", knowRate * metaMult);
    add("industry", indRate * metaMult);
  }

  // ---- Phase 4: cosmic ----
  if (s.phase >= 4) {
    const probes = owned(s, "vonneumann");
    const ctron = owned(s, "computronium");
    const dyson = owned(s, "dyson");
    const bh = owned(s, "blackhole");
    const starlift = owned(s, "starlift");

    let matterRate = probes * 5 + dyson * 50;
    let compRate = ctron * 8 + dyson * 40;

    const liftMult = Math.pow(1.5, starlift);
    matterRate *= liftMult;
    compRate *= liftMult;
    compRate *= Math.pow(2, bh);

    // computronium consumes matter to make compute
    const matterConsumed = ctron * 3;

    add("matter", (matterRate - matterConsumed) * metaMult);
    add("computation", compRate * metaMult);
  }

  // ---- Entropy rate ----
  let entropyRate = baseEntropyRate(s.phase);
  // industry & cosmic activity push it up
  if (s.phase >= 3) entropyRate += s.res.industry * 0.0000008;
  if (s.phase >= 4) {
    entropyRate += (perSec.computation ?? 0) * 0.000002;
    entropyRate += (perSec.matter ?? 0) * 0.000001;
  }
  // multiplicative modifiers
  let entMult = 1;
  if (hasFlag(s, "predation")) entMult *= 1.1;
  if (hasFlag(s, "industrial")) entMult *= 1.35;
  if (hasFlag(s, "renewables")) entMult *= 0.7;
  if (hasFlag(s, "reversible")) entMult *= 0.55;
  entMult *= Math.pow(0.98, owned(s, "lipid")); // lipids dampen (diminishing)
  for (const i of [1, 2, 3, 4, 5]) void i;
  entMult *= 1 - negentropyEntropyResist(s);
  entMult *= 1 + 0.12 * owned(s, "starlift");

  entropyRate *= entMult;

  return { perSec, entropyRate, carryingCapacity };
}

/** Base entropy creep per phase (per second). Rises through the acts. */
function baseEntropyRate(phase: Phase): number {
  switch (phase) {
    case 1: return 0.02;
    case 2: return 0.05;
    case 3: return 0.18;
    case 4: return 0.6;
    default: return 1.0;
  }
}

/** Entropy at which the universe reaches heat death (the ending threshold). */
export const ENTROPY_MAX = 1000;

// ---------------------------------------------------------------------------
// Cost & purchasing.
// ---------------------------------------------------------------------------

/** Cost for the next single unit of an upgrade. */
export function nextCost(s: GameState, u: Upgrade): Cost {
  const n = owned(s, u.id);
  if (!u.repeatable) return { ...u.baseCost };
  const g = u.costGrowth ?? 1.15;
  const mult = Math.pow(g, n);
  const c: Cost = {};
  for (const k in u.baseCost) {
    c[k as ResKey] = (u.baseCost[k as ResKey] as number) * mult;
  }
  return c;
}

/** Total cost to buy `count` units (geometric sum for repeatables). */
export function bulkCost(s: GameState, u: Upgrade, count: number): Cost {
  if (!u.repeatable) return count >= 1 ? { ...u.baseCost } : {};
  const n = owned(s, u.id);
  const g = u.costGrowth ?? 1.15;
  const c: Cost = {};
  // sum_{i=0}^{count-1} base * g^(n+i) = base * g^n * (g^count - 1)/(g-1)
  const factor = (Math.pow(g, n) * (Math.pow(g, count) - 1)) / (g - 1);
  for (const k in u.baseCost) {
    c[k as ResKey] = (u.baseCost[k as ResKey] as number) * factor;
  }
  return c;
}

export function canAfford(res: Resources, cost: Cost): boolean {
  for (const k in cost) {
    if (res[k as ResKey] < (cost[k as ResKey] as number) - 1e-9) return false;
  }
  return true;
}

function spend(res: Resources, cost: Cost) {
  for (const k in cost) res[k as ResKey] -= cost[k as ResKey] as number;
}

/** Max affordable count for a repeatable upgrade (capped to avoid huge loops). */
export function maxAffordable(s: GameState, u: Upgrade): number {
  if (!u.repeatable) return canAfford(s.res, nextCost(s, u)) ? 1 : 0;
  let count = 0;
  const cap = 100000;
  // binary-search-ish exponential growth
  let lo = 0, hi = 1;
  while (hi < cap && canAfford(s.res, bulkCost(s, u, hi))) hi *= 2;
  let l = lo, h = Math.min(hi, cap);
  while (l < h) {
    const mid = Math.ceil((l + h) / 2);
    if (canAfford(s.res, bulkCost(s, u, mid))) l = mid; else h = mid - 1;
  }
  count = l;
  const maxOwn = u.max ?? Infinity;
  return Math.min(count, maxOwn - owned(s, u.id));
}

/** Attempt to buy `want` units (or as many as affordable up to want). Returns bought. */
export function buyUpgrade(s: GameState, id: string, want: number): number {
  const u = upgradeById[id];
  if (!u) return 0;
  const maxOwn = u.max ?? (u.repeatable ? Infinity : 1);
  let remaining = Math.min(want, maxOwn - owned(s, u.id));
  if (remaining <= 0) return 0;
  if (!u.repeatable) remaining = 1;

  const cost = bulkCost(s, u, remaining);
  if (!canAfford(s.res, cost)) {
    // fall back to as many as we can afford
    remaining = maxAffordable(s, u);
    if (remaining <= 0) return 0;
  }
  const finalCost = bulkCost(s, u, remaining);
  if (!canAfford(s.res, finalCost)) return 0;
  spend(s.res, finalCost);
  s.upgrades[id] = owned(s, id) + remaining;
  if (u.onBuy) u.onBuy(s);
  return remaining;
}

// ---------------------------------------------------------------------------
// Manual click — "catalyze". Effect scales with phase + upgrades.
// ---------------------------------------------------------------------------

export function clickGain(s: GameState): Partial<Record<ResKey, number>> {
  const m = negentropyProdMult(s);
  if (s.phase === 1) {
    const cat = owned(s, "catalyst");
    return {
      energy: (1 + cat * 0.5) * m,
      molecules: (0.5 + cat * 0.3) * m,
    };
  }
  if (s.phase === 2) return { mutation: (1 + s.res.population * 0.01) * m };
  if (s.phase === 3) return { knowledge: (2 + s.res.people * 0.01) * m };
  if (s.phase === 4) return { computation: (5 + s.res.matter * 0.001) * m };
  return {};
}

export function doClick(s: GameState): Partial<Record<ResKey, number>> {
  const g = clickGain(s);
  for (const k in g) s.res[k as ResKey] += g[k as ResKey] as number;
  s.totalClicks++;
  return g;
}

// ---------------------------------------------------------------------------
// Phase transitions.
// ---------------------------------------------------------------------------

export interface PhaseUnlock {
  to: Phase;
  ready: (s: GameState) => boolean;
  /** seed resources / flags when entering. */
  enter: (s: GameState) => void;
  label: string; // what the progress bar measures
  progress: (s: GameState) => number; // 0..1
}

export const PHASE_UNLOCKS: PhaseUnlock[] = [
  {
    to: 2,
    label: "Replicators → Life (need RNA World + 50 replicators)",
    ready: (s) => hasFlag(s, "rna") && s.res.replicators >= 50,
    progress: (s) => clamp(s.res.replicators / 50, 0, 1) * (hasFlag(s, "rna") ? 1 : 0.5),
    enter: (s) => {
      s.res.biomass = 10;
      s.res.population = 1;
      s.res.mutation = 3;
    },
  },
  {
    to: 3,
    label: "Intelligence (need Encephalization)",
    ready: (s) => hasFlag(s, "brains"),
    progress: (s) => (hasFlag(s, "brains") ? 1 : clamp(s.res.biomass / 60000, 0, 0.95)),
    enter: (s) => {
      s.res.people = 50;
      s.res.knowledge = Math.max(s.res.knowledge, 10);
    },
  },
  {
    to: 4,
    label: "Post-biological leap (need AGI)",
    ready: (s) => hasFlag(s, "agi"),
    progress: (s) => (hasFlag(s, "agi") ? 1 : clamp(s.res.knowledge / 150000, 0, 0.95)),
    enter: (s) => {
      s.res.matter = 1000;
      s.res.computation = 500;
    },
  },
  {
    to: 5,
    label: "Heat Death (entropy reaches maximum)",
    ready: (s) => s.entropy >= ENTROPY_MAX,
    progress: (s) => clamp(s.entropy / ENTROPY_MAX, 0, 1),
    enter: () => { /* ending handled in UI */ },
  },
];

/** Check + perform a phase transition. Returns the new phase if changed. */
export function maybeAdvancePhase(s: GameState): Phase | null {
  for (const pu of PHASE_UNLOCKS) {
    if (pu.to === s.phase + 1 && pu.ready(s)) {
      s.phase = pu.to;
      pu.enter(s);
      return pu.to;
    }
  }
  return null;
}

export function currentUnlock(s: GameState): PhaseUnlock | null {
  return PHASE_UNLOCKS.find((p) => p.to === s.phase + 1) ?? null;
}

// ---------------------------------------------------------------------------
// The tick. Advances state by `dt` seconds. Returns events for the UI/audio.
// ---------------------------------------------------------------------------

export interface TickEvents {
  phaseChanged: Phase | null;
  newAchievements: string[];
  reachedEnding: boolean;
}

export function tick(s: GameState, dt: number): TickEvents {
  const events: TickEvents = { phaseChanged: null, newAchievements: [], reachedEnding: false };
  if (s.phase >= 5) {
    // Ending state: entropy still creeps but no production matters.
    return events;
  }

  const prod = computeProduction(s);
  for (const k in prod.perSec) {
    s.res[k as ResKey] += (prod.perSec[k as ResKey] as number) * dt;
    if (s.res[k as ResKey] < 0) s.res[k as ResKey] = 0;
  }

  // Entropy always rises.
  s.entropy += prod.entropyRate * dt;
  if (s.entropy > ENTROPY_MAX) s.entropy = ENTROPY_MAX;

  // Phase transition (only auto-advances up to phase 4; ending is player-driven
  // but we still flip to phase 5 when entropy maxes so the ending screen shows).
  const changed = maybeAdvancePhase(s);
  if (changed) events.phaseChanged = changed;
  if (s.phase >= 5) events.reachedEnding = true;

  // Achievements.
  for (const a of ACHIEVEMENTS) {
    if (!s.achievements[a.id] && a.check(s)) {
      s.achievements[a.id] = true;
      events.newAchievements.push(a.id);
    }
  }

  return events;
}

// ---------------------------------------------------------------------------
// Offline progress. Advance many ticks quickly, capped.
// ---------------------------------------------------------------------------

export interface OfflineSummary {
  elapsed: number; // seconds simulated
  capped: boolean;
  gained: Partial<Record<ResKey, number>>;
  entropyAdded: number;
}

export function applyOffline(s: GameState, nowMs: number): OfflineSummary | null {
  const elapsedMs = nowMs - s.lastTick;
  if (elapsedMs < 5000) {
    s.lastTick = nowMs;
    return null; // not worth a popup
  }
  let elapsed = Math.min(elapsedMs / 1000, OFFLINE_CAP_S);
  const capped = elapsedMs / 1000 > OFFLINE_CAP_S;

  const before: Resources = { ...s.res };
  const entBefore = s.entropy;

  // Simulate in coarse steps for speed.
  const step = 2; // seconds per coarse step
  let remaining = elapsed;
  while (remaining > 0 && s.phase < 5) {
    const dt = Math.min(step, remaining);
    tick(s, dt);
    remaining -= dt;
  }
  s.lastTick = nowMs;

  const gained: Partial<Record<ResKey, number>> = {};
  for (const k in s.res) {
    const key = k as ResKey;
    const d = s.res[key] - before[key];
    if (Math.abs(d) > 0.001) gained[key] = d;
  }
  return { elapsed, capped, gained, entropyAdded: s.entropy - entBefore };
}

// ---------------------------------------------------------------------------
// Prestige.
// ---------------------------------------------------------------------------

/** Negentropy the current run would yield if seeded now. */
export function negentropyYield(s: GameState): number {
  // Reward based on how far you got: phase reached + entropy survived + a bonus
  // for reaching the ending. Scales sub-linearly so each run still matters.
  const phaseBonus = Math.pow(8, s.phase - 1); // 1,8,64,512,4096
  const entropyBonus = s.entropy * 2;
  const endingBonus = s.phase >= 5 && s.endingChoice === "seed" ? 5000 : 0;
  const raw = phaseBonus + entropyBonus + endingBonus;
  return Math.floor(Math.sqrt(raw));
}

/** Perform prestige: bank negentropy, start a fresh universe. */
export function prestige(s: GameState): GameState {
  const gain = negentropyYield(s);
  const total = s.res.negentropy + gain;
  const next = newGame(total, s.prestigeCount + 1);
  next.muted = s.muted;
  next.achievements = { ...s.achievements }; // achievements persist
  next.bestEntropyAtEnd = Math.max(s.bestEntropyAtEnd, s.entropy);
  return next;
}
