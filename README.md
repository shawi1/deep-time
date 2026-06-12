# Deep Time

**An incremental game from the first self-replicating molecule to the heat death of the universe.**

You begin as chemistry in a hydrothermal vent and end as a post-biological intelligence
fighting the last few joules of usable energy out of a cooling cosmos. Every era you cross,
one number keeps rising and never stops: **entropy** — the universal clock counting down to
heat death. Your job is to carry a thread of order all the way to the end of time, and then
decide whether to let the universe go dark or seed a new one.

The interface is built as a **scientific instrument / observatory panel**: a central evolving
canvas that morphs molecule → dividing cells → city-lit globe → Dyson swarm → dimming embers,
a cosmic timeline along the bottom, hairline measurement ticks, an era-shifting palette, and
generative WebAudio drones that change with each phase.

## Run it

```bash
npm install
npm run dev      # local dev server (Vite)
npm run build    # type-check + production build to dist/
npm run preview  # preview the production build
```

Then open the printed local URL. The game autosaves to `localStorage` every ~10 seconds and
on exit, and applies **offline progress** (capped at 4 hours) the next time you load.

## The four phases

Each phase changes the core loop, the visible resources, and the visualization:

1. **Primordial Chemistry** — Concentrate free energy at hydrothermal vents, build organic
   molecules, and coax the first self-replicating molecules into existence. Reach the **RNA World**
   and 50 replicators to cross into Life. *Catalyze* manually to spark reactions.
2. **Life & Evolution** — A mutation tech-tree. Spend mutation points on traits
   (metabolism → photosynthesis → predation → multicellularity → sexual reproduction →
   nervous systems → big brains). Population grows logistically toward a carrying capacity.
   **Encephalization** unlocks intelligence.
3. **Intelligence & Civilization** — A Paperclips-style economy of people, knowledge, and
   industry. Cities, universities, and factories compound output — and the **Industrial
   Revolution** sends entropy soaring. Decarbonize with a clean grid, then build **AGI** to
   trigger the Singularity.
4. **Post-biological Cosmos** — Von Neumann probes, computronium, Dyson swarms, and star
   lifting. Convert matter into pure computation. **Reversible computing** is the only way to
   slow entropy enough to actually witness the end.

When entropy reaches its maximum, the universe reaches **Heat Death** — a real ending screen.

## Entropy & prestige

- **Entropy** is a single universal counter that always rises. Its rate climbs each phase and
  with high-output technologies; certain upgrades (lipid membranes, clean energy, reversible
  computing) dampen it. At `ENTROPY_MAX` the universe ends.
- **Prestige** = *Seed a New Universe*. Available from the civilization phase onward, and offered
  as a choice at the ending. Collapsing a universe banks **Negentropy** — order salvaged across
  cosmoses — which permanently boosts production and resists entropy in every future run.
  Milestones and achievements persist across prestiges.

## Features

- 25+ data-driven upgrades across four phases, with buy ×1 / ×10 / MAX.
- Big-number formatting into the cosmic range, count-up rates, tooltips with cost/effect.
- Achievements/milestones, offline-progress summary, export/import save string, mute, hard reset.
- Generative per-era WebAudio; particle bursts and an evolving central canvas; no asset files.

## Tech

TypeScript + Vite, no framework. The simulation (`src/sim.ts`) is a fixed-timestep
(20 ticks/s) engine over a single serializable `GameState`; all content lives in
`src/content.ts`; the UI (`src/ui.ts`) and visualization (`src/viz.ts`) are generated from
that data.

---

*Built with [Claude Code](https://claude.com/claude-code).*
