// main.ts — entry point. Wires state ⇄ sim ⇄ ui ⇄ viz ⇄ audio, runs the
// fixed-timestep loop, handles save/load, offline progress, and prestige.

import "./styles.css";
import { type GameState } from "./state";
import { newGame } from "./state";
import {
  tick, doClick, buyUpgrade, applyOffline, prestige, maybeAdvancePhase,
  TICK_MS,
} from "./sim";
import { ACHIEVEMENTS } from "./content";
import { save, load, clearSave, exportSave, importSave } from "./save";
import { UI, type BuyMode } from "./ui";
import { Viz } from "./viz";
import {
  startAudio, setMuted, isMuted, setEra,
  sfxClick, sfxBuy, sfxAchieve, sfxPhase, sfxEnding,
} from "./audio";

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

let state: GameState = load() ?? newGame();
setMuted(state.muted);

const ACH_NAME: Record<string, string> = {};
for (const a of ACHIEVEMENTS) ACH_NAME[a.id] = a.name;

const appEl = document.getElementById("app")!;
const ui = new UI(appEl, {
  onCatalyze: catalyze,
  onBuy: buy,
  onSetBuyMode: (_m: BuyMode) => { /* UI tracks its own buy mode */ },
  onPrestige: confirmPrestige,
  onToggleMute: toggleMute,
  onExport: () => exportSave(state),
  onImport: doImport,
  onHardReset: confirmReset,
  onEndingChoice: chooseEnding,
});
const { canvas } = ui.build();
ui.setMuteLabel(state.muted);

const viz = new Viz(canvas);

let endingShown = false;

// unlock audio on first interaction
const unlock = () => { startAudio(); setEra(state.phase); window.removeEventListener("pointerdown", unlock); };
window.addEventListener("pointerdown", unlock, { once: true });

// offline progress (on load)
const offline = applyOffline(state, Date.now());
if (offline) ui.showOffline(offline);

// ---------------------------------------------------------------------------
// Interaction handlers
// ---------------------------------------------------------------------------

function catalyze(): void {
  if (state.phase >= 5) return;
  doClick(state);
  const colors = ["#4fe6c2", "#7fe65f", "#56c8ff", "#b58bff"];
  viz.centerBurst(colors[Math.min(state.phase, 4) - 1] ?? "#4fe6c2");
  sfxClick();
  flushEvents();
}

function buy(id: string, count: number): void {
  const bought = buyUpgrade(state, id, count);
  if (bought > 0) {
    sfxBuy();
    viz.centerBurst("#ffffff");
    // a purchase can immediately satisfy a phase gate (e.g. RNA → Life)
    flushEvents();
  }
}

function confirmPrestige(): void {
  ui.confirm(
    "Seed a New Universe",
    "This ends the current universe. All resources and constructions reset, but you keep your Negentropy and milestones — and gain more. Continue?",
    () => doPrestige()
  );
}

function doPrestige(): void {
  state = prestige(state);
  endingShown = false;
  save(state);
  setEra(state.phase);
  ui.toast("A new universe begins.", "❉", "Prestige");
}

function chooseEnding(choice: "burn" | "seed"): void {
  state.endingChoice = choice;
  if (choice === "seed") {
    doPrestige();
  } else {
    // burn: stay in the dark ending, but allow a fresh start later via reset.
    save(state);
  }
}

function toggleMute(): void {
  const m = !isMuted();
  setMuted(m);
  state.muted = m;
  ui.setMuteLabel(m);
  save(state);
}

function doImport(str: string): boolean {
  const s = importSave(str);
  if (!s) return false;
  state = s;
  endingShown = false;
  save(state);
  setMuted(state.muted);
  ui.setMuteLabel(state.muted);
  setEra(state.phase);
  return true;
}

function confirmReset(): void {
  ui.confirm(
    "Hard Reset",
    "This permanently erases EVERYTHING — your run, your Negentropy, and all milestones. There is no undo. Are you sure?",
    () => {
      clearSave();
      state = newGame();
      endingShown = false;
      setMuted(state.muted);
      ui.setMuteLabel(state.muted);
      setEra(state.phase);
      ui.toast("Universe reset to the first molecule.", "↻", "Reset");
    }
  );
}

// ---------------------------------------------------------------------------
// Event handling shared by tick + interactions
// ---------------------------------------------------------------------------

let lastPhase = state.phase;

function flushEvents(): void {
  // Catch phase changes triggered directly by a purchase (not just the tick).
  const changed = maybeAdvancePhase(state);
  if (changed) onPhaseChange(changed);
  checkAchievements();
}

function onPhaseChange(p: number): void {
  setEra(state.phase);
  if (p >= 5) {
    sfxEnding();
  } else {
    sfxPhase();
    const names = ["", "Primordial Chemistry", "Life & Evolution", "Intelligence & Civilization", "Post-biological Cosmos"];
    ui.toast(names[p] ?? "New Era", "✦", "New Era");
  }
  lastPhase = state.phase;
}

const seenAch = new Set<string>(Object.keys(state.achievements));
function checkAchievements(): void {
  for (const a of ACHIEVEMENTS) {
    if (state.achievements[a.id] && !seenAch.has(a.id)) {
      seenAch.add(a.id);
      sfxAchieve();
      ui.toast(a.name, "★", "Milestone");
    }
  }
}

// ---------------------------------------------------------------------------
// Main loop — fixed-timestep sim, rAF render.
// ---------------------------------------------------------------------------

let acc = 0;
let last = performance.now();
let saveAcc = 0;

function loop(now: number): void {
  let frameDt = (now - last) / 1000;
  last = now;
  if (frameDt > 0.5) frameDt = 0.5; // tab was backgrounded; offline handles the rest
  acc += frameDt * 1000;

  const step = TICK_MS;
  let guard = 0;
  while (acc >= step && guard < 1000) {
    const ev = tick(state, step / 1000);
    if (ev.phaseChanged) onPhaseChange(ev.phaseChanged);
    if (ev.newAchievements.length) checkAchievements();
    if (ev.reachedEnding && !endingShown && state.endingChoice === null) {
      endingShown = true;
      ui.showEnding(state, () => {});
    }
    state.lastTick = Date.now();
    acc -= step;
    guard++;
  }
  if (lastPhase !== state.phase) { onPhaseChange(state.phase); }

  ui.render(state);
  viz.render(state);

  saveAcc += frameDt;
  if (saveAcc >= 10) { save(state); saveAcc = 0; }

  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);

// save on exit
window.addEventListener("beforeunload", () => save(state));
document.addEventListener("visibilitychange", () => { if (document.hidden) save(state); });
