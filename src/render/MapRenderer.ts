// Canvas renderer for the world map. Fills are cached in an offscreen layer; borders, units and
// effects are drawn as vectors every frame so they stay crisp at any zoom.
import { UNITS } from '../data/units';
import { GOOD_ICONS } from '../data/buildings';
import { DIFFICULTY } from '../sim/difficulty';
import { opinion } from '../sim/diplomacy/relations';
import { alliesOf, atWar, isFriendly, puppetsOf } from '../sim/query';
import type { GameState, Terrain } from '../sim/state';
import type { WorldGeometry } from '../sim/worldgen/geometry';
import type { Game, MapMode } from '../ui/game';

const TERRAIN_COLORS: Record<Terrain, [number, number, number]> = {
  plains: [157, 180, 108],
  forest: [86, 128, 70],
  hills: [165, 152, 104],
  mountains: [140, 134, 128],
  desert: [218, 196, 138],
  tundra: [206, 214, 216],
  jungle: [58, 118, 66],
  ocean: [40, 80, 125],
};

const BASE_SCALE = 2;

export interface PlateHit {
  x: number;
  y: number;
  w: number;
  h: number;
  province: number;
  owner: number;
  divs: number[];
}

function hexToRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function rgb(c: [number, number, number], a = 1): string {
  return a >= 1 ? `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})` : `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
}

function mix(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export class MapRenderer {
  ctx: CanvasRenderingContext2D;
  cam = { x: 800, y: 500, zoom: 1 };
  plates: PlateHit[] = [];
  hover = -1;
  private terrain: HTMLCanvasElement | null = null;
  private base: HTMLCanvasElement;
  private provPaths: Path2D[] = [];
  private builtFor: WorldGeometry | null = null;
  private baseKey = '';
  private provBorders = new Path2D();
  private nationBorders = new Path2D();
  private coast = new Path2D();
  private labels: { x: number; y: number; text: string; size: number; nation: number }[] = [];
  private dpr = 1;
  private hatch: CanvasPattern | null = null;

  constructor(
    public canvas: HTMLCanvasElement,
    public game: Game,
    public opts: { preview?: boolean } = {},
  ) {
    this.ctx = canvas.getContext('2d')!;
    this.base = document.createElement('canvas');
  }

  get geo(): WorldGeometry {
    return this.game.map.geo;
  }

  get state(): GameState {
    return this.game.state;
  }

  resize(): void {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.max(1, Math.round(r.width * this.dpr));
    this.canvas.height = Math.max(1, Math.round(r.height * this.dpr));
  }

  get viewW(): number {
    return this.canvas.width / this.dpr;
  }

  get viewH(): number {
    return this.canvas.height / this.dpr;
  }

  minZoom(): number {
    return Math.min(this.viewW / this.geo.width, this.viewH / this.geo.height);
  }

  fit(): void {
    this.cam.zoom = this.minZoom();
    this.cam.x = this.geo.width / 2;
    this.cam.y = this.geo.height / 2;
  }

  centerOn(x: number, y: number, zoom?: number): void {
    this.cam.x = x;
    this.cam.y = y;
    if (zoom) this.cam.zoom = Math.max(this.minZoom(), Math.min(10, zoom));
    this.clamp();
  }

  clamp(): void {
    const z = this.cam.zoom;
    const halfW = this.viewW / 2 / z;
    const halfH = this.viewH / 2 / z;
    const W = this.geo.width;
    const H = this.geo.height;
    this.cam.x = halfW * 2 >= W ? W / 2 : Math.max(halfW, Math.min(W - halfW, this.cam.x));
    this.cam.y = halfH * 2 >= H ? H / 2 : Math.max(halfH, Math.min(H - halfH, this.cam.y));
  }

  screenToWorld(sx: number, sy: number): [number, number] {
    return [(sx - this.viewW / 2) / this.cam.zoom + this.cam.x, (sy - this.viewH / 2) / this.cam.zoom + this.cam.y];
  }

  worldToScreen(wx: number, wy: number): [number, number] {
    return [(wx - this.cam.x) * this.cam.zoom + this.viewW / 2, (wy - this.cam.y) * this.cam.zoom + this.viewH / 2];
  }

  zoomAt(sx: number, sy: number, factor: number): void {
    const [wx, wy] = this.screenToWorld(sx, sy);
    this.cam.zoom = Math.max(this.minZoom(), Math.min(10, this.cam.zoom * factor));
    const [nx, ny] = this.screenToWorld(sx, sy);
    this.cam.x += wx - nx;
    this.cam.y += wy - ny;
    this.clamp();
  }

  // ------------------------------------------------------------------ static layers

  private buildStatic(): void {
    const geo = this.geo;
    this.builtFor = geo;
    this.provPaths = geo.provinceCells.map((cells) => {
      const p = new Path2D();
      for (const c of cells) {
        const poly = geo.cellPolys[c];
        if (poly.length < 6) continue;
        p.moveTo(poly[0], poly[1]);
        for (let i = 2; i < poly.length; i += 2) p.lineTo(poly[i], poly[i + 1]);
        p.closePath();
      }
      return p;
    });

    const t = document.createElement('canvas');
    t.width = geo.width * BASE_SCALE;
    t.height = geo.height * BASE_SCALE;
    const g = t.getContext('2d')!;
    g.scale(BASE_SCALE, BASE_SCALE);
    let minE = Infinity;
    let seaMax = -Infinity;
    for (let i = 0; i < geo.cellElevation.length; i++) {
      const e = geo.cellElevation[i];
      if (geo.cellTerrain[i] === 'ocean') {
        minE = Math.min(minE, e);
        seaMax = Math.max(seaMax, e);
      }
    }
    for (let i = 0; i < geo.cellPolys.length; i++) {
      const poly = geo.cellPolys[i];
      if (poly.length < 6) continue;
      const ter = geo.cellTerrain[i];
      let col: [number, number, number];
      if (ter === 'ocean') {
        const depth = (geo.cellElevation[i] - minE) / Math.max(1e-6, seaMax - minE);
        col = mix([22, 48, 86], [62, 118, 160], Math.pow(depth, 1.6));
      } else {
        const base = TERRAIN_COLORS[ter];
        const e = geo.cellElevation[i];
        const shade = 0.92 + Math.sin(i * 12.9898) * 0.04 + Math.min(0.12, e * 0.08);
        col = [base[0] * shade, base[1] * shade, base[2] * shade];
      }
      g.fillStyle = rgb(col);
      g.strokeStyle = rgb(col);
      g.lineWidth = 0.6;
      g.beginPath();
      g.moveTo(poly[0], poly[1]);
      for (let k = 2; k < poly.length; k += 2) g.lineTo(poly[k], poly[k + 1]);
      g.closePath();
      g.fill();
      g.stroke();
    }
    this.terrain = t;
    this.base.width = t.width;
    this.base.height = t.height;

    // diagonal hatch for occupied land
    const hc = document.createElement('canvas');
    hc.width = hc.height = 8;
    const hg = hc.getContext('2d')!;
    hg.strokeStyle = 'rgba(0,0,0,0.55)';
    hg.lineWidth = 2;
    hg.beginPath();
    hg.moveTo(0, 8);
    hg.lineTo(8, 0);
    hg.stroke();
    this.hatch = g.createPattern(hc, 'repeat');
  }

  private provinceColor(pid: number, mode: MapMode): string | null {
    const s = this.state;
    const p = s.provinces[pid];
    if (p.isSea) return null;
    if (p.owner < 0) return 'rgba(80,80,80,0.5)';
    const owner = s.nations[p.owner];
    switch (mode) {
      case 'political':
        return rgb(hexToRgb(owner.color), 0.78);
      case 'terrain':
        return null;
      case 'resources':
        return 'rgba(18,22,30,0.45)';
      case 'population': {
        const dens = p.pop / Math.max(1, p.area);
        const t = Math.min(1, Math.sqrt(dens / 220));
        return rgb(mix([40, 50, 70], [255, 196, 70], t), 0.82);
      }
      case 'diplomacy': {
        const me = s.player >= 0 ? s.player : this.game.diploTarget;
        if (me < 0) return rgb(hexToRgb(owner.color), 0.78);
        if (p.owner === me) return 'rgba(236,190,72,0.9)';
        if (atWar(s, me, p.owner)) return 'rgba(210,50,50,0.85)';
        if (puppetsOf(s, me).includes(p.owner)) return 'rgba(140,190,255,0.85)';
        if (alliesOf(s, me).includes(p.owner)) return 'rgba(60,120,240,0.85)';
        const o = opinion(s, p.owner, me);
        const t = (o + 100) / 200;
        return rgb(mix([170, 60, 50], [70, 170, 90], t), 0.8);
      }
    }
  }

  private renderBase(): void {
    const s = this.state;
    const g = this.base.getContext('2d')!;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.base.width, this.base.height);
    g.drawImage(this.terrain!, 0, 0);
    g.scale(BASE_SCALE, BASE_SCALE);
    const mode = this.game.mapMode;
    for (const p of s.provinces) {
      const col = this.provinceColor(p.id, mode);
      if (!col) continue;
      g.fillStyle = col;
      g.strokeStyle = col;
      g.lineWidth = 0.5;
      g.fill(this.provPaths[p.id]);
      g.stroke(this.provPaths[p.id]);
      if (p.controller !== p.owner && p.controller >= 0 && (mode === 'political' || mode === 'diplomacy')) {
        g.save();
        g.clip(this.provPaths[p.id]);
        g.fillStyle = rgb(hexToRgb(s.nations[p.controller].color), 0.85);
        g.globalAlpha = 0.55;
        g.fill(this.provPaths[p.id]);
        g.globalAlpha = 1;
        if (this.hatch) {
          g.fillStyle = this.hatch;
          g.fill(this.provPaths[p.id]);
        }
        g.restore();
      }
      if (p.fallout > 0) {
        g.fillStyle = 'rgba(160,255,60,0.25)';
        g.fill(this.provPaths[p.id]);
      }
    }

    // vector borders
    this.provBorders = new Path2D();
    this.nationBorders = new Path2D();
    this.coast = new Path2D();
    for (const e of this.geo.edges) {
      const a = s.provinces[e.a];
      const b = s.provinces[e.b];
      if (a.isSea && b.isSea) continue;
      let target = this.provBorders;
      if (a.isSea !== b.isSea) target = this.coast;
      else if (a.owner !== b.owner) target = this.nationBorders;
      target.moveTo(e.x1, e.y1);
      target.lineTo(e.x2, e.y2);
    }

    // nation labels: area-weighted centre of each nation's largest cluster
    this.labels = [];
    for (const n of s.nations) {
      if (!n.alive) continue;
      const owned = s.provinces.filter((p) => p.owner === n.id);
      if (!owned.length) continue;
      const cap = s.provinces[n.capital];
      // cluster: provinces within reach of the capital
      const near = owned.filter((p) => Math.hypot(p.center[0] - cap.center[0], p.center[1] - cap.center[1]) < 320);
      const use = near.length ? near : owned;
      let x = 0;
      let y = 0;
      let a = 0;
      for (const p of use) {
        x += p.center[0] * p.area;
        y += p.center[1] * p.area;
        a += p.area;
      }
      const size = Math.max(9, Math.min(34, Math.sqrt(a) * 2.1));
      this.labels.push({ x: x / a, y: y / a, text: n.name.toUpperCase(), size, nation: n.id });
    }
  }

  // ------------------------------------------------------------------ frame

  render(now: number): void {
    if (!this.game.map) return;
    if (this.builtFor !== this.geo) {
      this.buildStatic();
      this.baseKey = '';
    }
    const s = this.state;
    const key = `${this.game.mapVersion}|${this.game.mapMode}|${s.player}|${this.game.mapMode === 'diplomacy' || this.game.mapMode === 'population' ? Math.floor(s.day / 30) : 0}`;
    if (key !== this.baseKey) {
      this.renderBase();
      this.baseKey = key;
    }
    const ctx = this.ctx;
    const z = this.cam.zoom;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = '#16304f';
    ctx.fillRect(0, 0, this.viewW, this.viewH);
    ctx.save();
    ctx.translate(this.viewW / 2, this.viewH / 2);
    ctx.scale(z, z);
    ctx.translate(-this.cam.x, -this.cam.y);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.base, 0, 0, this.geo.width, this.geo.height);

    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(15,20,28,0.22)';
    ctx.lineWidth = 0.7 / z;
    ctx.stroke(this.provBorders);
    ctx.strokeStyle = 'rgba(16,26,40,0.75)';
    ctx.lineWidth = 1.3 / z;
    ctx.stroke(this.coast);
    ctx.strokeStyle = 'rgba(12,12,18,0.9)';
    ctx.lineWidth = Math.max(1.6 / z, 0.9);
    ctx.stroke(this.nationBorders);

    // hover & selection
    if (this.hover >= 0 && !this.opts.preview) {
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fill(this.provPaths[this.hover]);
    }
    const sel = this.game.selectedProvince;
    if (sel >= 0) {
      ctx.fillStyle = 'rgba(255,240,180,0.18)';
      ctx.fill(this.provPaths[sel]);
      ctx.strokeStyle = '#ffd34d';
      ctx.lineWidth = 2.4 / z;
      ctx.stroke(this.provPaths[sel]);
    }
    if (this.opts.preview && this.game.diploTarget >= 0) {
      ctx.strokeStyle = '#ffd34d';
      ctx.lineWidth = 2 / z;
      for (const p of s.provinces) if (p.owner === this.game.diploTarget) ctx.stroke(this.provPaths[p.id]);
    }

    if (!this.opts.preview) {
      if (this.game.mapMode === 'diplomacy') this.drawTradeRoutes(ctx, z, now);
      this.drawMarkers(ctx, z, now);
      this.drawArrows(ctx, z, now);
    }
    this.drawLabels(ctx, z);
    if (!this.opts.preview) {
      this.drawPlates(ctx, z);
      this.drawFloaters(ctx, z, now);
    }
    ctx.restore();
  }

  private visible(): Set<number> | null {
    const s = this.state;
    if (s.player < 0 || !DIFFICULTY[s.settings.difficulty].fog) return null;
    const vis = new Set<number>();
    for (const p of s.provinces) {
      if (p.isSea) continue;
      if (isFriendly(s, s.player, p.controller) || p.controller === s.player) {
        vis.add(p.id);
        for (const nb of p.neighbors) vis.add(nb);
      }
    }
    for (const d of s.divisions) if (d.owner === s.player) vis.add(d.province);
    return vis;
  }

  private drawMarkers(ctx: CanvasRenderingContext2D, z: number, now: number): void {
    const s = this.state;
    const mode = this.game.mapMode;
    const iconSize = Math.max(7, Math.min(16, 11 / Math.sqrt(z)));
    const crown = s.leaderboard.crown;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const p of s.provinces) {
      if (p.isSea) continue;
      const [x, y] = p.center;
      if (p.isCapital && p.owner >= 0) {
        // the world's #1 wears a crown instead of the capital star
        const mark = p.owner === crown ? '👑' : '★';
        ctx.font = `${(iconSize * (mark === '★' ? 1.1 : 1.25)) / z}px sans-serif`;
        ctx.fillStyle = '#fff6c8';
        ctx.strokeStyle = 'rgba(0,0,0,0.7)';
        ctx.lineWidth = 2 / z;
        if (mark === '★') ctx.strokeText(mark, x, y - 9 / z);
        ctx.fillText(mark, x, y - 9 / z);
      }
      if (mode === 'resources' && p.resource) {
        ctx.font = `${(iconSize * 1.3) / z}px sans-serif`;
        ctx.fillText(GOOD_ICONS[p.resource], x, y);
      }
      if (p.construction && p.owner === s.player) {
        ctx.font = `${iconSize / z}px sans-serif`;
        ctx.fillText('🏗️', x + 10 / z, y - 9 / z);
      }
      if (p.siege > 0) {
        const r = 11 / z;
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.lineWidth = 4 / z;
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.strokeStyle = '#ff7043';
        ctx.lineWidth = 3 / z;
        ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * Math.min(100, p.siege)) / 100);
        ctx.stroke();
      }
      if ((p.clickBoost ?? 0) > 0.02) {
        const pulse = 0.5 + 0.5 * Math.sin(now / 90);
        ctx.beginPath();
        ctx.fillStyle = `rgba(255,120,40,${0.15 + 0.25 * pulse * Math.min(1, p.clickBoost!)})`;
        ctx.arc(x, y, (18 + 6 * pulse) / z, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  private drawArrows(ctx: CanvasRenderingContext2D, z: number, now: number): void {
    const s = this.state;
    const seen = new Set<string>();
    for (const d of s.divisions) {
      if (d.owner !== s.player || !d.path.length) continue;
      const key = d.province + ':' + d.path.join(',');
      if (seen.has(key)) continue;
      seen.add(key);
      const pts: [number, number][] = [s.provinces[d.province].center, ...d.path.map((pid) => s.provinces[pid].center)];
      const selected = this.game.selectedDivs.has(d.id);
      ctx.strokeStyle = selected ? 'rgba(255,215,80,0.95)' : 'rgba(255,90,60,0.85)';
      ctx.lineWidth = (selected ? 3.2 : 2.4) / z;
      ctx.setLineDash([7 / z, 5 / z]);
      ctx.lineDashOffset = -now / 60 / z;
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.stroke();
      ctx.setLineDash([]);
      // arrowhead
      const a = pts[pts.length - 2];
      const b = pts[pts.length - 1];
      const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
      const h = 9 / z;
      ctx.fillStyle = ctx.strokeStyle;
      ctx.beginPath();
      ctx.moveTo(b[0], b[1]);
      ctx.lineTo(b[0] - h * Math.cos(ang - 0.45), b[1] - h * Math.sin(ang - 0.45));
      ctx.lineTo(b[0] - h * Math.cos(ang + 0.45), b[1] - h * Math.sin(ang + 0.45));
      ctx.closePath();
      ctx.fill();
    }
  }

  /** Your trade contracts as curved routes between capitals, with cargo tokens (frozen at war). */
  private drawTradeRoutes(ctx: CanvasRenderingContext2D, z: number, now: number): void {
    const s = this.state;
    const me = s.player;
    for (const p of s.pacts) {
      if (p.type !== 'trade' || (p.a !== me && p.b !== me)) continue;
      const a = s.provinces[s.nations[p.a].capital].center;
      const b = s.provinces[s.nations[p.b].capital].center;
      const mx = (a[0] + b[0]) / 2 - (b[1] - a[1]) * 0.15;
      const my = (a[1] + b[1]) / 2 + (b[0] - a[0]) * 0.15;
      const frozen = atWar(s, p.a, p.b);
      ctx.strokeStyle = frozen ? 'rgba(150,150,150,0.6)' : 'rgba(255,214,90,0.85)';
      ctx.lineWidth = 2 / z;
      ctx.setLineDash([4 / z, 4 / z]);
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.quadraticCurveTo(mx, my, b[0], b[1]);
      ctx.stroke();
      ctx.setLineDash([]);
      for (let k = 0; k < 3; k++) {
        const t = frozen ? (k + 1) / 4 : ((now / 4000 + k / 3) % 1);
        const x = (1 - t) * (1 - t) * a[0] + 2 * (1 - t) * t * mx + t * t * b[0];
        const y = (1 - t) * (1 - t) * a[1] + 2 * (1 - t) * t * my + t * t * b[1];
        ctx.fillStyle = frozen ? '#999' : '#ffd65a';
        ctx.beginPath();
        ctx.arc(x, y, 3 / z, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  private drawLabels(ctx: CanvasRenderingContext2D, z: number): void {
    const s = this.state;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (z < 2.6 || this.opts.preview) {
      for (const l of this.labels) {
        // scale with the map, but keep labels readable and never huge on screen
        const px = Math.max(8, Math.min(30, l.size * z * 0.95));
        ctx.font = `700 ${px / z}px "Cinzel", Georgia, serif`;
        ctx.lineWidth = 3 / z;
        ctx.strokeStyle = 'rgba(10,10,14,0.75)';
        ctx.fillStyle = l.nation === s.player ? '#ffe7a3' : 'rgba(248,244,232,0.95)';
        ctx.strokeText(l.text, l.x, l.y);
        ctx.fillText(l.text, l.x, l.y);
      }
    }
    if (z >= 2.2 && !this.opts.preview) {
      ctx.font = `600 ${10.5 / z}px Inter, sans-serif`;
      ctx.lineWidth = 2.5 / z;
      for (const p of s.provinces) {
        const [sx, sy] = this.worldToScreen(p.center[0], p.center[1]);
        if (sx < -50 || sy < -50 || sx > this.viewW + 50 || sy > this.viewH + 50) continue;
        ctx.strokeStyle = 'rgba(0,0,0,0.65)';
        ctx.fillStyle = p.isSea ? 'rgba(190,215,240,0.7)' : 'rgba(255,255,255,0.92)';
        ctx.strokeText(p.name, p.center[0], p.center[1] + 13 / z);
        ctx.fillText(p.name, p.center[0], p.center[1] + 13 / z);
      }
    }
  }

  private drawPlates(ctx: CanvasRenderingContext2D, z: number): void {
    const s = this.state;
    const vis = this.visible();
    this.plates = [];
    const groups = new Map<string, { province: number; owner: number; divs: typeof s.divisions }>();
    for (const d of s.divisions) {
      if (vis && d.owner !== s.player && !isFriendly(s, s.player, d.owner) && !vis.has(d.province)) continue;
      const k = `${d.province}:${d.owner}`;
      let g = groups.get(k);
      if (!g) groups.set(k, (g = { province: d.province, owner: d.owner, divs: [] }));
      g.divs.push(d);
    }
    // stack plates of different owners in the same province side by side
    const perProvince = new Map<number, number>();
    const w = 30 / z;
    const h = 15 / z;
    for (const g of groups.values()) {
      const idx = perProvince.get(g.province) ?? 0;
      perProvince.set(g.province, idx + 1);
      const p = s.provinces[g.province];
      let [x, y] = p.center;
      // interpolate moving stacks toward their next province
      const lead = g.divs[0];
      if (lead.path.length && lead.moveProgress > 0) {
        const q = s.provinces[lead.path[0]].center;
        x += (q[0] - x) * lead.moveProgress;
        y += (q[1] - y) * lead.moveProgress;
      }
      x += (idx % 2 === 0 ? -1 : 1) * (idx ? w * 0.55 : 0);
      y += Math.floor(idx / 2) * h * 1.1 - 4 / z;
      const n = s.nations[g.owner];
      const selected = g.divs.some((d) => this.game.selectedDivs.has(d.id));
      const training = g.divs.every((d) => d.training > 0);
      const hostile = s.player >= 0 && atWar(s, s.player, g.owner);
      ctx.fillStyle = 'rgba(10,12,18,0.85)';
      ctx.strokeStyle = selected ? '#ffd34d' : hostile ? '#ff4b4b' : 'rgba(255,255,255,0.65)';
      ctx.lineWidth = (selected ? 2.4 : 1.2) / z;
      const rx = x - w / 2;
      const ry = y - h / 2;
      ctx.beginPath();
      ctx.roundRect(rx, ry, w, h, 3 / z);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = n.color;
      ctx.fillRect(rx + 1.5 / z, ry + 1.5 / z, 5 / z, h - 3 / z);
      const counts = new Map<string, number>();
      for (const d of g.divs) counts.set(d.type, (counts.get(d.type) ?? 0) + 1);
      const main = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0] as keyof typeof UNITS;
      ctx.font = `${9 / z}px sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = training ? 'rgba(255,255,255,0.45)' : '#fff';
      ctx.fillText(UNITS[main].icon, rx + 7.5 / z, y + 0.5 / z);
      ctx.font = `700 ${9.5 / z}px Inter, sans-serif`;
      ctx.fillText(String(g.divs.length), rx + 19 / z, y + 0.5 / z);
      // strength / org bar
      const str = g.divs.reduce((t, d) => t + d.strength, 0) / g.divs.length;
      const org = g.divs.reduce((t, d) => t + d.org, 0) / g.divs.length;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(rx, ry + h + 1 / z, w, 3 / z);
      ctx.fillStyle = '#5bd36b';
      ctx.fillRect(rx, ry + h + 1 / z, w * str, 1.5 / z);
      ctx.fillStyle = '#5bb8ff';
      ctx.fillRect(rx, ry + h + 2.5 / z, w * org, 1.5 / z);
      const [sx, sy] = this.worldToScreen(rx, ry);
      this.plates.push({ x: sx, y: sy, w: w * z, h: h * z + 4, province: g.province, owner: g.owner, divs: g.divs.map((d) => d.id) });
    }
    // battles
    for (const [pid, count] of perProvince) {
      if (count < 2) continue;
      const owners = [...groups.values()].filter((g) => g.province === pid).map((g) => g.owner);
      const fighting = owners.some((a) => owners.some((b) => atWar(s, a, b)));
      if (!fighting) continue;
      const [x, y] = s.provinces[pid].center;
      ctx.font = `${16 / z}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('⚔️', x, y - 22 / z);
    }
  }

  private drawFloaters(ctx: CanvasRenderingContext2D, z: number, now: number): void {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const f of this.game.floaters) {
      const t = (now - f.born) / 1400;
      if (t > 1) continue;
      ctx.globalAlpha = 1 - t * t;
      ctx.font = `800 ${13 / z}px Inter, sans-serif`;
      ctx.lineWidth = 3 / z;
      ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      ctx.fillStyle = f.color;
      const y = f.y - (t * 34) / z;
      ctx.strokeText(f.text, f.x, y);
      ctx.fillText(f.text, f.x, y);
    }
    ctx.globalAlpha = 1;
  }

  plateAt(sx: number, sy: number): PlateHit | null {
    for (let i = this.plates.length - 1; i >= 0; i--) {
      const p = this.plates[i];
      if (sx >= p.x && sx <= p.x + p.w && sy >= p.y && sy <= p.y + p.h) return p;
    }
    return null;
  }
}

