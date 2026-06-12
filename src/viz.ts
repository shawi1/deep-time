// viz.ts — the central evolving visualization canvas plus the background
// starfield. Morphs through the phases:
//   1 molecular diagrams → 2 dividing cells → 3 civilization globe
//   → 4 starfield + Dyson swarm → 5 cold dimming embers.

import type { GameState } from "./state";
import { ENTROPY_MAX } from "./sim";

interface Particle {
  x: number; y: number; vx: number; vy: number; life: number; max: number;
  color: string; size: number;
}

export class Viz {
  private ctx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private t = 0;
  private particles: Particle[] = [];
  private stars: { x: number; y: number; r: number; tw: number }[] = [];

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d")!;
    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  resize(): void {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = this.canvas.getBoundingClientRect();
    this.w = rect.width;
    this.h = rect.height;
    this.canvas.width = Math.floor(this.w * this.dpr);
    this.canvas.height = Math.floor(this.h * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    // regen starfield
    this.stars = [];
    const n = Math.floor((this.w * this.h) / 6000);
    for (let i = 0; i < n; i++) {
      this.stars.push({
        x: Math.random() * this.w,
        y: Math.random() * this.h,
        r: Math.random() * 1.3 + 0.2,
        tw: Math.random() * Math.PI * 2,
      });
    }
  }

  burst(cx: number, cy: number, color: string, count = 14): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 0.5 + Math.random() * 2.5;
      this.particles.push({
        x: cx, y: cy,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 0, max: 30 + Math.random() * 30,
        color, size: 1 + Math.random() * 2.5,
      });
    }
  }

  /** Burst at the visualization center (used on click). */
  centerBurst(color: string): void {
    this.burst(this.w / 2, this.h / 2, color, 18);
  }

  render(s: GameState): void {
    this.t += 1 / 60;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.w, this.h);

    // background starfield (faint, intensifies in cosmic phases)
    const starAlpha = s.phase >= 4 ? 0.9 : s.phase >= 3 ? 0.5 : 0.25;
    for (const st of this.stars) {
      const tw = 0.5 + 0.5 * Math.sin(this.t * 1.5 + st.tw);
      ctx.globalAlpha = starAlpha * tw * (s.phase >= 5 ? 0.3 : 1);
      ctx.fillStyle = s.phase >= 4 ? "#dfe6ff" : "#9fc6c0";
      ctx.beginPath();
      ctx.arc(st.x, st.y, st.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    const cx = this.w / 2;
    const cy = this.h / 2;
    const R = Math.min(this.w, this.h) * 0.34;

    switch (s.phase) {
      case 1: this.drawChemistry(cx, cy, R, s); break;
      case 2: this.drawLife(cx, cy, R, s); break;
      case 3: this.drawCivilization(cx, cy, R, s); break;
      case 4: this.drawCosmic(cx, cy, R, s); break;
      default: this.drawHeatDeath(cx, cy, R, s); break;
    }

    this.drawParticles();
  }

  private drawParticles(): void {
    const ctx = this.ctx;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life++;
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.96;
      p.vy *= 0.96;
      const a = 1 - p.life / p.max;
      if (a <= 0) { this.particles.splice(i, 1); continue; }
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // --- Phase 1: molecular diagram (rotating ring of atoms + bonds) ---
  private drawChemistry(cx: number, cy: number, R: number, s: GameState): void {
    const ctx = this.ctx;
    const reps = Math.min(12, 3 + Math.floor(s.res.replicators));
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = "rgba(120, 220, 200, 0.5)";
    // central node
    const pulse = 1 + 0.05 * Math.sin(this.t * 2);
    for (let ring = 0; ring < 3; ring++) {
      const rr = R * (0.4 + ring * 0.3) * pulse;
      const nodes = 5 + ring * 2;
      const rot = this.t * (0.2 + ring * 0.05) * (ring % 2 ? -1 : 1);
      const pts: [number, number][] = [];
      for (let i = 0; i < nodes; i++) {
        const a = rot + (i / nodes) * Math.PI * 2;
        pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
      }
      ctx.beginPath();
      for (let i = 0; i < pts.length; i++) {
        const [x, y] = pts[i];
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
      for (const [x, y] of pts) {
        ctx.fillStyle = "rgba(160, 240, 210, 0.85)";
        ctx.beginPath();
        ctx.arc(x, y, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // orbiting replicators
    for (let i = 0; i < reps; i++) {
      const a = this.t * 0.8 + (i / reps) * Math.PI * 2;
      const rr = R * 1.15;
      const x = cx + Math.cos(a) * rr;
      const y = cy + Math.sin(a) * rr * 0.6;
      ctx.fillStyle = "rgba(90, 255, 200, 0.9)";
      ctx.beginPath();
      ctx.arc(x, y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // --- Phase 2: dividing cells ---
  private drawLife(cx: number, cy: number, R: number, s: GameState): void {
    const ctx = this.ctx;
    const count = Math.min(40, 4 + Math.floor(Math.log2(1 + s.res.population) * 4));
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + this.t * 0.1;
      const dist = R * (0.2 + 0.8 * ((i * 37) % 100) / 100);
      const x = cx + Math.cos(a) * dist;
      const y = cy + Math.sin(a) * dist;
      const div = 0.5 + 0.5 * Math.sin(this.t * 1.5 + i);
      const r = 6 + div * 5;
      const grad = ctx.createRadialGradient(x, y, 1, x, y, r);
      grad.addColorStop(0, "rgba(150, 240, 140, 0.9)");
      grad.addColorStop(1, "rgba(40, 140, 90, 0.05)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      // nucleus
      ctx.fillStyle = "rgba(20, 90, 60, 0.9)";
      ctx.beginPath();
      ctx.arc(x + Math.sin(this.t + i) * 2, y, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // --- Phase 3: glowing civilization globe ---
  private drawCivilization(cx: number, cy: number, R: number, s: GameState): void {
    const ctx = this.ctx;
    const grad = ctx.createRadialGradient(cx, cy, R * 0.2, cx, cy, R);
    grad.addColorStop(0, "rgba(40, 90, 130, 0.9)");
    grad.addColorStop(1, "rgba(10, 30, 50, 0.95)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fill();

    // city lights — density grows with people/industry
    const lights = Math.min(220, 10 + Math.floor(Math.log10(1 + s.res.people) * 30 + s.res.industry * 0.0002));
    ctx.fillStyle = "rgba(120, 230, 255, 0.9)";
    for (let i = 0; i < lights; i++) {
      const a = (i * 137.5) % 360 * (Math.PI / 180);
      const ph = ((i * 53) % 100) / 100;
      const lat = (ph - 0.5) * Math.PI;
      const lon = a + this.t * 0.15;
      const rx = Math.cos(lat) * Math.sin(lon);
      const ry = Math.sin(lat);
      const rz = Math.cos(lat) * Math.cos(lon);
      if (rz < 0) continue;
      const x = cx + rx * R * 0.92;
      const y = cy + ry * R * 0.92;
      const tw = 0.4 + 0.6 * Math.sin(this.t * 3 + i);
      ctx.globalAlpha = tw * (0.4 + rz * 0.6);
      ctx.beginPath();
      ctx.arc(x, y, 1.3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    // atmosphere ring
    ctx.strokeStyle = "rgba(120, 230, 255, 0.25)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 1.04, 0, Math.PI * 2);
    ctx.stroke();
  }

  // --- Phase 4: star with Dyson swarm ---
  private drawCosmic(cx: number, cy: number, R: number, s: GameState): void {
    const ctx = this.ctx;
    // central star
    const sr = R * 0.45;
    const heat = 1 - s.entropy / ENTROPY_MAX; // dims as entropy rises
    const grad = ctx.createRadialGradient(cx, cy, 1, cx, cy, sr);
    grad.addColorStop(0, `rgba(255, 250, ${Math.floor(200 + heat * 55)}, ${0.7 + heat * 0.3})`);
    grad.addColorStop(0.6, `rgba(${200 + heat * 55}, 200, 255, 0.5)`);
    grad.addColorStop(1, "rgba(120, 100, 200, 0.02)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, sr, 0, Math.PI * 2);
    ctx.fill();

    // Dyson swarm panels orbiting
    const dyson = (s.upgrades["dyson"] ?? 0);
    const panels = Math.min(160, 12 + dyson * 18);
    for (let i = 0; i < panels; i++) {
      const a = this.t * 0.4 + (i / panels) * Math.PI * 2;
      const tilt = 0.5 + 0.3 * Math.sin(i * 1.3);
      const orx = R * (0.7 + (i % 3) * 0.12);
      const x = cx + Math.cos(a) * orx;
      const y = cy + Math.sin(a) * orx * tilt;
      ctx.fillStyle = "rgba(190, 200, 255, 0.8)";
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a);
      ctx.fillRect(-2.5, -1, 5, 2);
      ctx.restore();
    }
    // enclosed-star count rings
    const stars = Math.floor(s.res.stars);
    for (let i = 0; i < Math.min(stars, 6); i++) {
      ctx.strokeStyle = `rgba(200, 210, 255, ${0.15 - i * 0.02})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, R * (1.1 + i * 0.08), 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // --- Phase 5: cold dimming embers ---
  private drawHeatDeath(cx: number, cy: number, R: number, _s: GameState): void {
    const ctx = this.ctx;
    const embers = 30;
    for (let i = 0; i < embers; i++) {
      const a = (i / embers) * Math.PI * 2 + this.t * 0.02;
      const d = R * (0.3 + ((i * 41) % 100) / 100);
      const x = cx + Math.cos(a) * d;
      const y = cy + Math.sin(a) * d;
      const flick = 0.05 + 0.1 * Math.max(0, Math.sin(this.t * 0.5 + i));
      ctx.globalAlpha = flick;
      ctx.fillStyle = "rgba(120, 80, 120, 1)";
      ctx.beginPath();
      ctx.arc(x, y, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}
