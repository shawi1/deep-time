// ui.ts — builds the DOM shell and renders state each frame. All layout is
// generated from content.ts so the four phases share one instrument panel.

import type { GameState } from "./state";
import { owned } from "./state";
import {
  RESOURCES, UPGRADES, PHASES, ACHIEVEMENTS,
  type Upgrade, type ResKey,
} from "./content";
import {
  computeProduction, nextCost, bulkCost, maxAffordable, canAfford,
  currentUnlock, ENTROPY_MAX, negentropyYield, negentropyProdMult,
  negentropyEntropyResist,
} from "./sim";
import { fmt, fmtRate, fmtPct, fmtTime } from "./format";

export type BuyMode = "x1" | "x10" | "max";

export interface UIHandlers {
  onCatalyze: () => void;
  onBuy: (id: string, count: number) => void;
  onSetBuyMode: (m: BuyMode) => void;
  onPrestige: () => void;
  onToggleMute: () => void;
  onExport: () => string;
  onImport: (str: string) => boolean;
  onHardReset: () => void;
  onEndingChoice: (choice: "burn" | "seed") => void;
}

export class UI {
  buyMode: BuyMode = "x1";
  private root: HTMLElement;
  private h: UIHandlers;

  // cached element refs (filled in build())
  private els!: {
    body: HTMLElement;
    phaseName: HTMLElement; phaseSub: HTMLElement; phaseEra: HTMLElement;
    resList: HTMLElement;
    vizReadout: HTMLElement;
    entropyMeter: HTMLElement;
    unlockMeter: HTMLElement;
    upgrades: HTMLElement;
    stats: HTMLElement;
    achGrid: HTMLElement;
    prestige: HTMLElement;
    timeline: HTMLElement;
    catalyzeBtn: HTMLButtonElement;
    catalyzeHint: HTMLElement;
    muteBtn: HTMLButtonElement;
  };

  constructor(root: HTMLElement, handlers: UIHandlers) {
    this.root = root;
    this.h = handlers;
  }

  /** Build the static shell once. */
  build(): { canvas: HTMLCanvasElement } {
    this.root.innerHTML = `
      <div class="shell">
        <section class="col col-left">
          <div class="title-block">
            <p class="eyebrow">Deep Time — Instrument</p>
            <h1 class="phase-name" data-el="phaseName"></h1>
            <p class="phase-sub" data-el="phaseSub"></p>
            <p class="phase-era" data-el="phaseEra"></p>
          </div>
          <p class="eyebrow">Resources</p>
          <div class="res-list" data-el="resList"></div>
          <div class="meter">
            <div class="meter-head"><span>Entropy → Heat Death</span><span class="v" data-el="entVal"></span></div>
            <div class="bar entropy"><span data-el="entBar"></span></div>
          </div>
          <div data-el="entropyMeter"></div>
        </section>

        <section class="col col-center">
          <div class="viz-wrap">
            <canvas id="viz"></canvas>
            <div class="viz-frame"><div class="viz-corner"></div></div>
            <div class="viz-readout" data-el="vizReadout"></div>
            <div class="catalyze-bar">
              <button class="catalyze" data-el="catalyzeBtn"></button>
              <span class="catalyze-hint" data-el="catalyzeHint"></span>
            </div>
          </div>
        </section>

        <section class="col col-right">
          <p class="eyebrow">Progression</p>
          <div data-el="unlockMeter"></div>

          <p class="eyebrow">Construction</p>
          <div class="buymode" data-el="buymode">
            <button data-m="x1" class="active">×1</button>
            <button data-m="x10">×10</button>
            <button data-m="max">MAX</button>
          </div>
          <div class="upgrades" data-el="upgrades"></div>

          <p class="eyebrow">Telemetry</p>
          <div class="stat-grid" data-el="stats"></div>

          <p class="eyebrow">Milestones</p>
          <div class="ach-grid" data-el="achGrid"></div>

          <div data-el="prestige"></div>

          <p class="eyebrow">Settings</p>
          <div class="settings-row">
            <button class="btn" data-el="muteBtn">Sound</button>
            <button class="btn danger" data-el="resetBtn">Hard Reset</button>
          </div>
          <div class="settings-row">
            <button class="btn" data-el="exportBtn">Export Save</button>
            <button class="btn" data-el="importBtn">Import Save</button>
          </div>
          <textarea class="save-str hidden" data-el="saveStr" placeholder="Save string…"></textarea>
        </section>

        <section class="timeline">
          <p class="eyebrow">Cosmic Timeline</p>
          <div data-el="timeline"></div>
        </section>
      </div>
      <div class="toasts" data-el="toasts"></div>
      <div data-el="modalMount"></div>
    `;

    const q = <T extends HTMLElement = HTMLElement>(name: string) =>
      this.root.querySelector(`[data-el="${name}"]`) as T;

    this.els = {
      body: document.body,
      phaseName: q("phaseName"), phaseSub: q("phaseSub"), phaseEra: q("phaseEra"),
      resList: q("resList"),
      vizReadout: q("vizReadout"),
      entropyMeter: q("entropyMeter"),
      unlockMeter: q("unlockMeter"),
      upgrades: q("upgrades"),
      stats: q("stats"),
      achGrid: q("achGrid"),
      prestige: q("prestige"),
      timeline: q("timeline"),
      catalyzeBtn: q<HTMLButtonElement>("catalyzeBtn"),
      catalyzeHint: q("catalyzeHint"),
      muteBtn: q<HTMLButtonElement>("muteBtn"),
    };

    // wire static controls
    this.els.catalyzeBtn.addEventListener("click", () => this.h.onCatalyze());
    q("buymode").addEventListener("click", (e) => {
      const t = (e.target as HTMLElement).closest("button[data-m]") as HTMLElement | null;
      if (!t) return;
      this.buyMode = t.dataset.m as BuyMode;
      q("buymode").querySelectorAll("button").forEach((b) =>
        b.classList.toggle("active", (b as HTMLElement).dataset.m === this.buyMode));
      this.h.onSetBuyMode(this.buyMode);
    });
    this.els.muteBtn.addEventListener("click", () => this.h.onToggleMute());
    q("resetBtn").addEventListener("click", () => this.h.onHardReset());

    const saveStr = q<HTMLTextAreaElement>("saveStr");
    q("exportBtn").addEventListener("click", () => {
      saveStr.classList.remove("hidden");
      saveStr.value = this.h.onExport();
      saveStr.select();
      try { navigator.clipboard?.writeText(saveStr.value); } catch { /* ignore */ }
      this.toast("Save copied to clipboard", "❉");
    });
    q("importBtn").addEventListener("click", () => {
      if (saveStr.classList.contains("hidden") || !saveStr.value.trim()) {
        saveStr.classList.remove("hidden");
        saveStr.value = "";
        saveStr.placeholder = "Paste a save string, then press Import again…";
        saveStr.focus();
        return;
      }
      const ok = this.h.onImport(saveStr.value.trim());
      this.toast(ok ? "Save imported" : "Invalid save string", ok ? "❉" : "✕");
      if (ok) saveStr.classList.add("hidden");
    });

    // keyboard: spacebar = catalyze
    window.addEventListener("keydown", (e) => {
      if (e.code === "Space" && (e.target as HTMLElement).tagName !== "TEXTAREA") {
        e.preventDefault();
        this.h.onCatalyze();
      }
    });

    return { canvas: this.root.querySelector("#viz") as HTMLCanvasElement };
  }

  /** Full per-frame render from state. */
  render(s: GameState): void {
    const prod = computeProduction(s);
    this.els.body.setAttribute("data-phase", String(Math.min(s.phase, 5)));

    const ph = PHASES.find((p) => p.id === s.phase) ?? PHASES[0];
    this.setText(this.els.phaseName, ph.name);
    this.setText(this.els.phaseSub, ph.subtitle);
    this.setText(this.els.phaseEra, ph.era);

    this.renderResources(s, prod);
    this.renderEntropy(s, prod);
    this.renderViz(s, prod);
    this.renderCatalyze(s);
    this.renderUnlock(s);
    this.renderUpgrades(s);
    this.renderStats(s, prod);
    this.renderAchievements(s);
    this.renderPrestige(s);
    this.renderTimeline(s);
  }

  private renderResources(s: GameState, prod: ReturnType<typeof computeProduction>): void {
    const visible = RESOURCES.filter(
      (r) => r.phase <= s.phase || s.res[r.key] > 0 || r.key === "negentropy"
    ).filter((r) => !(r.key === "negentropy" && s.res.negentropy <= 0 && s.prestigeCount === 0));

    const html = visible.map((r) => {
      const val = s.res[r.key];
      const rate = prod.perSec[r.key] ?? 0;
      const rateCls = rate > 1e-9 ? "pos" : rate < -1e-9 ? "neg" : "";
      const rateStr = Math.abs(rate) > 1e-9 ? `${rate > 0 ? "+" : ""}${fmtRate(rate)}` : "";
      return `<div class="res-row" title="${r.desc}">
        <span class="glyph">${r.abbr}</span>
        <span class="rname">${r.name}</span>
        <span class="rval num">${fmt(val)}<span class="rrate ${rateCls}">${rateStr}</span></span>
      </div>`;
    }).join("");
    this.setHTML(this.els.resList, html);
  }

  private renderEntropy(s: GameState, prod: ReturnType<typeof computeProduction>): void {
    const pct = s.entropy / ENTROPY_MAX;
    const entVal = this.root.querySelector('[data-el="entVal"]') as HTMLElement;
    const entBar = this.root.querySelector('[data-el="entBar"]') as HTMLElement;
    this.setText(entVal, `${fmt(s.entropy)} / ${ENTROPY_MAX}  (+${prod.entropyRate.toFixed(3)}/s)`);
    entBar.style.width = `${Math.min(100, pct * 100)}%`;

    const resist = negentropyEntropyResist(s);
    const tEnd = prod.entropyRate > 0 ? (ENTROPY_MAX - s.entropy) / prod.entropyRate : Infinity;
    this.setHTML(this.els.entropyMeter,
      `<p class="unlock-label">Entropy is the universal clock. At ${ENTROPY_MAX} the universe reaches heat death.
       ${resist > 0 ? `Negentropy resists it by <b style="color:var(--accent)">${fmtPct(resist)}</b>. ` : ""}
       Projected heat death in <b style="color:var(--entropy)">${fmtTime(tEnd)}</b>.</p>`);
  }

  private renderViz(s: GameState, prod: ReturnType<typeof computeProduction>): void {
    const pct = (s.entropy / ENTROPY_MAX) * 100;
    this.setHTML(this.els.vizReadout,
      `OBS-${String(s.phase).padStart(2, "0")} · ENTROPY <b>${pct.toFixed(1)}%</b> · T+<b>${fmtTime((Date.now() - s.runStart) / 1000)}</b>`);
    void prod;
  }

  private renderCatalyze(s: GameState): void {
    const labels: Record<number, string> = {
      1: "Catalyze", 2: "Mutate", 3: "Research", 4: "Compute", 5: "—",
    };
    const hints: Record<number, string> = {
      1: "Spark a prebiotic reaction · [space]",
      2: "Force a mutation · [space]",
      3: "Drive research · [space]",
      4: "Spend a thought · [space]",
      5: "The clock has stopped",
    };
    this.setText(this.els.catalyzeBtn, labels[s.phase] ?? "Catalyze");
    this.setText(this.els.catalyzeHint, hints[s.phase] ?? "");
    this.els.catalyzeBtn.disabled = s.phase >= 5;
  }

  private renderUnlock(s: GameState): void {
    const u = currentUnlock(s);
    if (!u || s.phase >= 5) { this.setHTML(this.els.unlockMeter, ""); return; }
    const p = u.progress(s);
    this.setHTML(this.els.unlockMeter, `
      <div class="meter">
        <div class="meter-head"><span>Next Phase</span><span class="v">${fmtPct(p)}</span></div>
        <div class="bar unlock"><span style="width:${Math.min(100, p * 100)}%"></span></div>
        <p class="unlock-label">${u.label}</p>
      </div>`);
  }

  private renderUpgrades(s: GameState): void {
    const cats: { key: Upgrade["category"]; label: string }[] = [
      { key: "catalyst", label: "Catalysts" },
      { key: "trait", label: "Evolutionary Traits" },
      { key: "tech", label: "Technologies" },
      { key: "cosmic", label: "Megastructures" },
    ];
    let html = "";
    for (const cat of cats) {
      const list = UPGRADES.filter((u) => u.category === cat.key && u.unlock(s));
      if (!list.length) continue;
      html += `<div class="cat-head">${cat.label}</div><div class="upgrades">`;
      for (const u of list) html += this.upgradeHTML(s, u);
      html += `</div>`;
    }
    if (!html) html = `<p class="unlock-label">No constructions available yet. Catalyze to begin.</p>`;
    this.setHTML(this.els.upgrades, html);

    this.els.upgrades.querySelectorAll<HTMLElement>(".upg").forEach((el) => {
      el.onclick = () => {
        const id = el.dataset.id!;
        const u = UPGRADES.find((x) => x.id === id)!;
        const count = this.resolveBuyCount(s, u);
        if (count > 0) this.h.onBuy(id, count);
      };
    });
  }

  private resolveBuyCount(s: GameState, u: Upgrade): number {
    if (!u.repeatable) return 1;
    if (this.buyMode === "x1") return 1;
    if (this.buyMode === "x10") return 10;
    return Math.max(1, maxAffordable(s, u));
  }

  private upgradeHTML(s: GameState, u: Upgrade): string {
    const own = owned(s, u.id);
    const maxOwn = u.max ?? (u.repeatable ? Infinity : 1);
    const maxed = own >= maxOwn;
    const count = maxed ? 0 : this.resolveBuyCount(s, u);
    const cost = maxed ? {} : (count > 1 ? bulkCost(s, u, count) : nextCost(s, u));
    const affordable = !maxed && canAfford(s.res, cost);

    const costStr = Object.entries(cost).map(([k, v]) => {
      const def = RESOURCES.find((r) => r.key === k);
      const short = s.res[k as ResKey] < (v as number) - 1e-9;
      return `<span class="c ${short ? "short" : ""}">${def?.abbr ?? ""} <b>${fmt(v as number)}</b></span>`;
    }).join("");

    const cls = maxed ? "maxed" : affordable ? "affordable" : "";
    const ownLabel = u.repeatable ? (own > 0 ? `×${own}` : "") : (own > 0 ? "✓ built" : "");
    const cntLabel = !maxed && count > 1 ? ` <span style="color:var(--ink-dim)">(buy ${count})</span>` : "";

    return `<button class="upg ${cls}" data-id="${u.id}"
        title="${u.desc} — ${u.effect}">
      <div class="upg-top">
        <span class="upg-name">${u.name}</span>
        <span class="upg-owned">${ownLabel}</span>
      </div>
      <div class="upg-effect">${u.effect}</div>
      ${maxed ? `<div class="upg-cost"><span class="c">Complete.</span></div>`
              : `<div class="upg-cost">${costStr}${cntLabel}</div>`}
    </button>`;
  }

  private renderStats(s: GameState, prod: ReturnType<typeof computeProduction>): void {
    const runTime = fmtTime((Date.now() - s.runStart) / 1000);
    const stats: [string, string][] = [
      ["Phase", `${s.phase} / 4`],
      ["Run Time", runTime],
      ["Total Catalyses", fmt(s.totalClicks)],
      ["Universes Seeded", fmt(s.prestigeCount)],
      ["Negentropy", fmt(s.res.negentropy)],
      ["Prod. Multiplier", `×${negentropyProdMult(s).toFixed(2)}`],
    ];
    this.setHTML(this.els.stats, stats.map(([k, v]) =>
      `<div class="stat"><div class="k">${k}</div><div class="v num">${v}</div></div>`).join(""));
    void prod;
  }

  private renderAchievements(s: GameState): void {
    this.setHTML(this.els.achGrid, ACHIEVEMENTS.map((a) => {
      const got = !!s.achievements[a.id];
      return `<div class="ach ${got ? "got" : ""}" title="${a.name} — ${got ? a.desc : "Locked"}">
        ${got ? "★" : "·"}</div>`;
    }).join(""));
  }

  private renderPrestige(s: GameState): void {
    // Prestige available from phase 3 onward (you've built a civilization worth seeding).
    if (s.phase < 3) { this.setHTML(this.els.prestige, ""); return; }
    const gain = negentropyYield(s);
    this.setHTML(this.els.prestige, `
      <p class="eyebrow">Seed a New Universe</p>
      <div class="prestige-box">
        <h3>Collapse &amp; Reseed</h3>
        <p>End this universe and salvage its order as Negentropy — a permanent boost to every future run.</p>
        <p>You would bank <span class="yield num">+${fmt(gain)} ❉</span></p>
        <button class="btn full primary" data-el="prestigeBtn">Seed New Universe</button>
      </div>`);
    const btn = this.root.querySelector('[data-el="prestigeBtn"]') as HTMLButtonElement;
    if (btn) btn.onclick = () => this.h.onPrestige();
  }

  private renderTimeline(s: GameState): void {
    const nodes = PHASES.map((p, i) => {
      const cls = s.phase > p.id ? "done" : s.phase === p.id ? "current" : "";
      const left = (i / (PHASES.length - 1)) * 100;
      return `<div class="tl-node ${cls}" style="left:${left}%">
        <div class="tl-dot"></div><div class="tl-label">${p.name.split(" ")[0]}</div></div>`;
    }).join("");
    const fillPct = ((s.phase - 1) / (PHASES.length - 1)) * 100;
    const entFrac = s.entropy / ENTROPY_MAX;
    this.setHTML(this.els.timeline, `
      <div class="timeline-track">
        <div class="timeline-fill" style="width:${fillPct}%"></div>
        <div class="tl-now" style="left:${Math.min(100, entFrac * 100)}%">entropy ${fmtPct(entFrac)}</div>
        ${nodes}
      </div>`);
  }

  // ---- transient UI ----
  setMuteLabel(muted: boolean): void {
    this.setText(this.els.muteBtn, muted ? "Sound: Off" : "Sound: On");
  }

  toast(text: string, icon = "✦", label = ""): void {
    const mount = this.root.querySelector('[data-el="toasts"]') as HTMLElement;
    const el = document.createElement("div");
    el.className = "toast";
    el.innerHTML = `<span class="ti">${icon}</span><span>${label ? `<span class="tlabel">${label}</span> ` : ""}${text}</span>`;
    mount.appendChild(el);
    setTimeout(() => el.remove(), 4200);
  }

  showOffline(summary: {
    elapsed: number; capped: boolean;
    gained: Partial<Record<ResKey, number>>; entropyAdded: number;
  }): void {
    const rows = Object.entries(summary.gained)
      .filter(([, v]) => Math.abs(v as number) > 0.01)
      .map(([k, v]) => {
        const def = RESOURCES.find((r) => r.key === k);
        return `<div class="r"><span>${def?.abbr ?? ""} ${def?.name ?? k}</span><b>+${fmt(v as number)}</b></div>`;
      }).join("");
    this.modal(`
      <h2>While You Were Away</h2>
      <p class="sub">${fmtTime(summary.elapsed)} of deep time elapsed${summary.capped ? " (capped at 4h)" : ""}</p>
      <div class="offline-list">${rows || '<div class="r"><span>The universe drifted quietly.</span></div>'}</div>
      <p style="color:var(--entropy)">Entropy advanced by ${fmt(summary.entropyAdded)}.</p>
      <div class="modal-actions"><button class="btn primary" data-el="okBtn">Continue</button></div>
    `, () => {});
  }

  showEnding(s: GameState, onClose: () => void): void {
    const gain = negentropyYield({ ...s, endingChoice: "seed" });
    this.modal(`
      <div class="ending">
        <h2>Heat Death</h2>
        <p class="sub">The last usable joule has been spent.</p>
        <p>Every star has cooled. Every computer has halted. The universe has reached
        maximum entropy — a uniform, lightless equilibrium from which no work can ever
        be drawn again. You carried a thread of order from the first replicating molecule
        all the way to the end of time.</p>
        <p>You reached <b>entropy ${fmt(s.entropy)}</b> across <b>${fmt(s.prestigeCount + 1)}</b>
        ${s.prestigeCount === 0 ? "universe" : "universes"}.</p>
        <p>One choice remains. Let this universe go dark forever — or salvage its hard-won
        order to seed a new cosmos, carrying <b style="color:var(--accent)">+${fmt(gain)} ❉ Negentropy</b>
        into the next beginning.</p>
        <div class="modal-actions">
          <button class="btn warn" data-el="burnBtn">Let it go dark</button>
          <button class="btn primary" data-el="seedBtn">Seed a new universe</button>
        </div>
      </div>
    `, () => {}, (mount) => {
      (mount.querySelector('[data-el="burnBtn"]') as HTMLButtonElement).onclick = () => {
        this.h.onEndingChoice("burn"); mount.remove(); onClose();
      };
      (mount.querySelector('[data-el="seedBtn"]') as HTMLButtonElement).onclick = () => {
        this.h.onEndingChoice("seed"); mount.remove(); onClose();
      };
    });
  }

  confirm(title: string, body: string, onYes: () => void): void {
    this.modal(`
      <h2>${title}</h2>
      <p>${body}</p>
      <div class="modal-actions">
        <button class="btn" data-el="noBtn">Cancel</button>
        <button class="btn danger" data-el="yesBtn">Confirm</button>
      </div>
    `, () => {}, (mount) => {
      (mount.querySelector('[data-el="yesBtn"]') as HTMLButtonElement).onclick = () => { mount.remove(); onYes(); };
      (mount.querySelector('[data-el="noBtn"]') as HTMLButtonElement).onclick = () => mount.remove();
    });
  }

  private modal(inner: string, _onClose: () => void, wire?: (mount: HTMLElement) => void): void {
    const mountRoot = this.root.querySelector('[data-el="modalMount"]') as HTMLElement;
    const overlay = document.createElement("div");
    overlay.className = "overlay";
    overlay.innerHTML = `<div class="modal">${inner}</div>`;
    mountRoot.appendChild(overlay);
    const ok = overlay.querySelector('[data-el="okBtn"]') as HTMLButtonElement | null;
    if (ok) ok.onclick = () => overlay.remove();
    if (wire) wire(overlay);
  }

  // ---- tiny DOM helpers (avoid layout thrash by only writing on change) ----
  private setText(el: HTMLElement, v: string): void {
    if (el.textContent !== v) el.textContent = v;
  }
  private setHTML(el: HTMLElement, v: string): void {
    if (el.innerHTML !== v) el.innerHTML = v;
  }
}
