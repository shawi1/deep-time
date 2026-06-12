// content.ts — all data-driven game content: resources, upgrades, traits,
// achievements, and phase definitions. UI is generated from these arrays.

import type { GameState, Resources, Phase } from "./state";
import { owned, hasFlag } from "./state";

export type ResKey = keyof Resources;

/** Visual + label metadata for each resource. */
export interface ResourceDef {
  key: ResKey;
  name: string;
  abbr: string;
  phase: Phase; // first phase it becomes visible
  desc: string;
}

export const RESOURCES: ResourceDef[] = [
  { key: "energy", name: "Free Energy", abbr: "⚡", phase: 1, desc: "Usable chemical energy from the environment." },
  { key: "molecules", name: "Organic Molecules", abbr: "❍", phase: 1, desc: "Carbon compounds — the feedstock of life." },
  { key: "replicators", name: "Replicators", abbr: "↻", phase: 1, desc: "Self-copying molecules. The first living thing." },
  { key: "biomass", name: "Biomass", abbr: "🌱", phase: 2, desc: "Living tissue across the population." },
  { key: "mutation", name: "Mutation Points", abbr: "✶", phase: 2, desc: "Raw variation to spend on new traits." },
  { key: "population", name: "Population", abbr: "▦", phase: 2, desc: "Number of organisms, bounded by carrying capacity." },
  { key: "people", name: "People", abbr: "☗", phase: 3, desc: "Thinking minds that build civilization." },
  { key: "knowledge", name: "Knowledge", abbr: "✦", phase: 3, desc: "Accumulated science and culture." },
  { key: "industry", name: "Industry", abbr: "⚙", phase: 3, desc: "Industrial output. Raises entropy fast." },
  { key: "matter", name: "Matter", abbr: "◉", phase: 4, desc: "Raw matter disassembled for cosmic engineering." },
  { key: "computation", name: "Computation", abbr: "⌬", phase: 4, desc: "Pure computation — post-biological thought." },
  { key: "stars", name: "Enclosed Stars", abbr: "✸", phase: 4, desc: "Stars wrapped in Dyson swarms." },
  { key: "negentropy", name: "Negentropy", abbr: "❉", phase: 1, desc: "Order salvaged across universes. Boosts new runs." },
];

export interface PhaseDef {
  id: Phase;
  name: string;
  subtitle: string;
  era: string; // timeline label
}

export const PHASES: PhaseDef[] = [
  { id: 1, name: "Primordial Chemistry", subtitle: "The first self-replicating molecule", era: "~3.8 Gya" },
  { id: 2, name: "Life & Evolution", subtitle: "Mutation, selection, and the rise of mind", era: "~3.5 Gya – 1 Mya" },
  { id: 3, name: "Intelligence & Civilization", subtitle: "Knowledge, industry, and acceleration", era: "~10 Kya – now" },
  { id: 4, name: "Post-biological Cosmos", subtitle: "Computation and megastructures among the stars", era: "Deep future" },
  { id: 5, name: "Heat Death", subtitle: "The last usable joule", era: "End of time" },
];

// ---------------------------------------------------------------------------
// Upgrades / tech / traits. Everything is an "Upgrade" with a category that
// controls which panel it appears in and how it is purchased.
// ---------------------------------------------------------------------------

export type Cost = Partial<Record<ResKey, number>>;

export interface Upgrade {
  id: string;
  name: string;
  desc: string;
  phase: Phase;
  category: "catalyst" | "trait" | "tech" | "cosmic" | "meta";
  /** repeatable upgrades scale cost by growth^owned; one-time = max 1. */
  repeatable: boolean;
  max?: number; // cap on owned (default Infinity for repeatable, 1 otherwise)
  baseCost: Cost;
  costGrowth?: number; // multiplier per purchase (repeatable only)
  /** unlock predicate — when visible to the player. */
  unlock: (s: GameState) => boolean;
  /** short human description of the effect, for tooltips. */
  effect: string;
  /** optional one-time side effect on purchase (e.g. set a flag). */
  onBuy?: (s: GameState) => void;
}

// helper: visible after reaching a phase, or after a flag/owned threshold
const after = (p: Phase) => (s: GameState) => s.phase >= p;

export const UPGRADES: Upgrade[] = [
  // ===================== PHASE 1 — CHEMISTRY (catalysts) =====================
  {
    id: "vent",
    name: "Hydrothermal Vent",
    desc: "A mineral chimney on the ocean floor. Passively concentrates free energy.",
    phase: 1,
    category: "catalyst",
    repeatable: true,
    baseCost: { energy: 10 },
    costGrowth: 1.15,
    unlock: () => true,
    effect: "+0.3 energy/s each.",
  },
  {
    id: "catalyst",
    name: "Mineral Catalyst",
    desc: "Iron-sulfur clusters that accelerate prebiotic reactions.",
    phase: 1,
    category: "catalyst",
    repeatable: true,
    baseCost: { energy: 30, molecules: 5 },
    costGrowth: 1.18,
    unlock: (s) => owned(s, "vent") >= 1,
    effect: "+0.5 molecules/s each. Stronger click catalysis.",
  },
  {
    id: "lipid",
    name: "Lipid Membrane",
    desc: "Fatty vesicles that shelter reactions from dilution.",
    phase: 1,
    category: "catalyst",
    repeatable: true,
    baseCost: { molecules: 60, energy: 40 },
    costGrowth: 1.2,
    unlock: (s) => owned(s, "catalyst") >= 3,
    effect: "+0.05 replicators/s each. -2% entropy rate each (diminishing).",
  },
  {
    id: "autocatset",
    name: "Autocatalytic Set",
    desc: "A network of molecules that collectively catalyze their own production.",
    phase: 1,
    category: "catalyst",
    repeatable: true,
    baseCost: { molecules: 250, replicators: 5 },
    costGrowth: 1.25,
    unlock: (s) => s.res.replicators >= 1,
    effect: "x1.08 replicator production each (compounds).",
  },
  {
    id: "rna",
    name: "RNA World",
    desc: "RNA that is both gene and enzyme. Replication truly takes off.",
    phase: 1,
    category: "tech",
    repeatable: false,
    baseCost: { replicators: 25, molecules: 500 },
    costGrowth: 1,
    unlock: (s) => s.res.replicators >= 8,
    effect: "Triples all replicator production. Unlocks the path to Life.",
    onBuy: (s) => { s.flags.rna = true; },
  },

  // ===================== PHASE 2 — LIFE (traits / tech) =====================
  {
    id: "metabolism",
    name: "Metabolism",
    desc: "Cells that turn energy and molecules into biomass.",
    phase: 2,
    category: "trait",
    repeatable: false,
    baseCost: { biomass: 20, mutation: 2 },
    unlock: after(2),
    effect: "+0.5 biomass/s base. Enables population growth.",
    onBuy: (s) => { s.flags.metabolism = true; },
  },
  {
    id: "photosynthesis",
    name: "Photosynthesis",
    desc: "Capture sunlight directly. A vast new energy source.",
    phase: 2,
    category: "trait",
    repeatable: false,
    baseCost: { biomass: 120, mutation: 6 },
    unlock: (s) => hasFlag(s, "metabolism"),
    effect: "x2.5 biomass production. +carrying capacity.",
    onBuy: (s) => { s.flags.photo = true; },
  },
  {
    id: "predation",
    name: "Predation",
    desc: "Eat other organisms. Faster mutation, faster churn.",
    phase: 2,
    category: "trait",
    repeatable: false,
    baseCost: { biomass: 400, mutation: 15 },
    unlock: (s) => hasFlag(s, "photo"),
    effect: "+150% mutation point gain. +10% entropy rate.",
    onBuy: (s) => { s.flags.predation = true; },
  },
  {
    id: "multicellular",
    name: "Multicellularity",
    desc: "Cells cooperate into bodies. Specialization begins.",
    phase: 2,
    category: "trait",
    repeatable: false,
    baseCost: { biomass: 1500, mutation: 40 },
    unlock: (s) => hasFlag(s, "predation"),
    effect: "x3 biomass and x2 carrying capacity.",
    onBuy: (s) => { s.flags.multi = true; },
  },
  {
    id: "sexual",
    name: "Sexual Reproduction",
    desc: "Recombination supercharges variation.",
    phase: 2,
    category: "trait",
    repeatable: false,
    baseCost: { biomass: 4000, mutation: 90 },
    unlock: (s) => hasFlag(s, "multi"),
    effect: "x3 mutation point gain.",
    onBuy: (s) => { s.flags.sexual = true; },
  },
  {
    id: "nervous",
    name: "Nervous System",
    desc: "Signal networks. The first flicker of behavior.",
    phase: 2,
    category: "trait",
    repeatable: false,
    baseCost: { biomass: 15000, mutation: 200 },
    unlock: (s) => hasFlag(s, "sexual"),
    effect: "Population begins generating proto-knowledge.",
    onBuy: (s) => { s.flags.nervous = true; },
  },
  {
    id: "brains",
    name: "Encephalization",
    desc: "Big brains. The threshold of true intelligence.",
    phase: 2,
    category: "tech",
    repeatable: false,
    baseCost: { biomass: 60000, mutation: 600 },
    unlock: (s) => hasFlag(s, "nervous"),
    effect: "Reaches intelligence. Unlocks Civilization.",
    onBuy: (s) => { s.flags.brains = true; },
  },
  {
    id: "evolvepool",
    name: "Adaptive Radiation",
    desc: "Repeatedly diversify into open niches.",
    phase: 2,
    category: "trait",
    repeatable: true,
    baseCost: { mutation: 25 },
    costGrowth: 1.3,
    unlock: (s) => hasFlag(s, "metabolism"),
    effect: "+12% biomass and +6% carrying capacity each.",
  },

  // ================ PHASE 3 — CIVILIZATION (tech / economy) ================
  {
    id: "agriculture",
    name: "Agriculture",
    desc: "Settle, farm, and feed a growing population.",
    phase: 3,
    category: "tech",
    repeatable: false,
    baseCost: { people: 50, knowledge: 20 },
    unlock: after(3),
    effect: "+1 person/s base. Raises population cap.",
    onBuy: (s) => { s.flags.agri = true; },
  },
  {
    id: "writing",
    name: "Writing",
    desc: "Record knowledge across generations.",
    phase: 3,
    category: "tech",
    repeatable: false,
    baseCost: { people: 200, knowledge: 100 },
    unlock: (s) => hasFlag(s, "agri"),
    effect: "x2 knowledge production.",
    onBuy: (s) => { s.flags.writing = true; },
  },
  {
    id: "city",
    name: "City",
    desc: "Dense settlements concentrate minds and industry.",
    phase: 3,
    category: "tech",
    repeatable: true,
    baseCost: { people: 500, knowledge: 250 },
    costGrowth: 1.22,
    unlock: (s) => hasFlag(s, "writing"),
    effect: "+2 people/s and +1 industry/s each.",
  },
  {
    id: "university",
    name: "University",
    desc: "Institutions that manufacture knowledge.",
    phase: 3,
    category: "tech",
    repeatable: true,
    baseCost: { knowledge: 800, people: 300 },
    costGrowth: 1.25,
    unlock: (s) => owned(s, "city") >= 2,
    effect: "+3 knowledge/s each.",
  },
  {
    id: "industrial",
    name: "Industrial Revolution",
    desc: "Machines multiply output — and entropy.",
    phase: 3,
    category: "tech",
    repeatable: false,
    baseCost: { industry: 500, knowledge: 2000 },
    unlock: (s) => owned(s, "city") >= 4,
    effect: "x4 industry. +35% entropy rate. Unlocks automation.",
    onBuy: (s) => { s.flags.industrial = true; },
  },
  {
    id: "factory",
    name: "Automated Factory",
    desc: "Self-running production lines.",
    phase: 3,
    category: "tech",
    repeatable: true,
    baseCost: { industry: 1200, people: 800 },
    costGrowth: 1.27,
    unlock: (s) => hasFlag(s, "industrial"),
    effect: "+6 industry/s each. +4 knowledge/s each.",
  },
  {
    id: "renewables",
    name: "Clean Energy Grid",
    desc: "Decarbonize. Tame the entropy you produce.",
    phase: 3,
    category: "tech",
    repeatable: false,
    baseCost: { industry: 8000, knowledge: 12000 },
    unlock: (s) => owned(s, "factory") >= 3,
    effect: "-30% entropy rate. Stabilizes growth.",
    onBuy: (s) => { s.flags.renewables = true; },
  },
  {
    id: "computers",
    name: "Computing",
    desc: "Mechanize thought itself.",
    phase: 3,
    category: "tech",
    repeatable: false,
    baseCost: { knowledge: 25000, industry: 15000 },
    unlock: (s) => hasFlag(s, "industrial"),
    effect: "x3 knowledge. Foundation for the post-biological leap.",
    onBuy: (s) => { s.flags.computers = true; },
  },
  {
    id: "agi",
    name: "Artificial General Intelligence",
    desc: "Minds without bodies. Recursive self-improvement.",
    phase: 3,
    category: "tech",
    repeatable: false,
    baseCost: { knowledge: 150000, industry: 80000 },
    unlock: (s) => hasFlag(s, "computers") && hasFlag(s, "renewables"),
    effect: "The Singularity. Unlocks the Cosmic phase.",
    onBuy: (s) => { s.flags.agi = true; },
  },

  // ===================== PHASE 4 — COSMIC =====================
  {
    id: "vonneumann",
    name: "Von Neumann Probe",
    desc: "Self-replicating machines that mine the solar system.",
    phase: 4,
    category: "cosmic",
    repeatable: true,
    baseCost: { computation: 1000, matter: 500 },
    costGrowth: 1.2,
    unlock: after(4),
    effect: "+5 matter/s each.",
  },
  {
    id: "computronium",
    name: "Computronium",
    desc: "Matter optimized into pure computational substrate.",
    phase: 4,
    category: "cosmic",
    repeatable: true,
    baseCost: { matter: 5000, computation: 2000 },
    costGrowth: 1.23,
    unlock: (s) => owned(s, "vonneumann") >= 3,
    effect: "+8 computation/s each (consumes matter).",
  },
  {
    id: "dyson",
    name: "Dyson Swarm",
    desc: "Enclose a star; harvest its entire output.",
    phase: 4,
    category: "cosmic",
    repeatable: true,
    baseCost: { matter: 50000, computation: 40000 },
    costGrowth: 1.35,
    unlock: (s) => owned(s, "computronium") >= 5,
    effect: "+1 star, +50 matter/s, +40 computation/s each.",
    onBuy: (s) => { s.flags.dyson = true; },
  },
  {
    id: "starlift",
    name: "Star Lifting",
    desc: "Strip-mine stars for fuel and raw mass.",
    phase: 4,
    category: "cosmic",
    repeatable: true,
    baseCost: { stars: 5, computation: 200000 },
    costGrowth: 1.4,
    unlock: (s) => owned(s, "dyson") >= 3,
    effect: "x1.5 matter & computation each. +12% entropy rate.",
  },
  {
    id: "reversible",
    name: "Reversible Computing",
    desc: "Compute near the Landauer limit — almost no waste heat.",
    phase: 4,
    category: "cosmic",
    repeatable: false,
    baseCost: { computation: 500000, stars: 8 },
    unlock: (s) => owned(s, "dyson") >= 5,
    effect: "-45% entropy rate. The only way to reach the very end.",
    onBuy: (s) => { s.flags.reversible = true; },
  },
  {
    id: "blackhole",
    name: "Black Hole Computer",
    desc: "The densest possible computer. The Singularity's cathedral.",
    phase: 4,
    category: "cosmic",
    repeatable: true,
    baseCost: { stars: 30, computation: 2000000 },
    costGrowth: 1.5,
    unlock: (s) => hasFlag(s, "reversible"),
    effect: "x2 computation each. Brings the ending within reach.",
  },
];

// ---------------------------------------------------------------------------
// Achievements / milestones.
// ---------------------------------------------------------------------------

export interface Achievement {
  id: string;
  name: string;
  desc: string;
  check: (s: GameState) => boolean;
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: "firstclick", name: "Spark", desc: "Catalyze your first reaction.", check: (s) => s.totalClicks >= 1 },
  { id: "firstrep", name: "It Lives", desc: "Create your first replicator.", check: (s) => s.res.replicators >= 1 },
  { id: "rnaworld", name: "RNA World", desc: "Achieve the RNA world.", check: (s) => hasFlag(s, "rna") },
  { id: "phase2", name: "Genesis", desc: "Cross into Life & Evolution.", check: (s) => s.phase >= 2 },
  { id: "photo", name: "Sun Eater", desc: "Evolve photosynthesis.", check: (s) => hasFlag(s, "photo") },
  { id: "brain", name: "Mind", desc: "Evolve big brains.", check: (s) => hasFlag(s, "brains") },
  { id: "phase3", name: "Civilization", desc: "Reach Intelligence & Civilization.", check: (s) => s.phase >= 3 },
  { id: "industry", name: "Smokestacks", desc: "Trigger the Industrial Revolution.", check: (s) => hasFlag(s, "industrial") },
  { id: "agi", name: "Singularity", desc: "Build AGI.", check: (s) => hasFlag(s, "agi") },
  { id: "phase4", name: "Starfarer", desc: "Reach the Post-biological Cosmos.", check: (s) => s.phase >= 4 },
  { id: "dyson", name: "Stellar Engineer", desc: "Build a Dyson Swarm.", check: (s) => hasFlag(s, "dyson") },
  { id: "reversible", name: "Maxwell's Heir", desc: "Master reversible computing.", check: (s) => hasFlag(s, "reversible") },
  { id: "ending", name: "End of Time", desc: "Witness the heat death of the universe.", check: (s) => s.phase >= 5 },
  { id: "prestige", name: "New Universe", desc: "Seed a new universe via prestige.", check: (s) => s.prestigeCount >= 1 },
  { id: "millclicks", name: "Persistent", desc: "Click 1,000 times.", check: (s) => s.totalClicks >= 1000 },
  { id: "negen", name: "Order from Chaos", desc: "Bank 100 Negentropy.", check: (s) => s.res.negentropy >= 100 },
];
