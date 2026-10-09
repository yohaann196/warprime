// Timelapse: samples who owns each province every few days and renders the samples to a WebM video.
import type { GeneratedMap } from '../sim/worldgen/geometry';
import { dateString, type GameState } from '../sim/state';

export const SAMPLE_DAYS = 30;
const FRAME_MS = 100;
const OUT_W = 960;

export interface PlaybackFrame {
  day: number;
  date: string;
  owners: Int16Array; // owner nation id per province, -1 none
}

export class PlaybackRecorder {
  frames: PlaybackFrame[] = [];

  reset(): void {
    this.frames = [];
  }

  private snap(s: GameState): PlaybackFrame {
    const owners = new Int16Array(s.provinces.length);
    for (let i = 0; i < owners.length; i++) owners[i] = s.provinces[i].isSea ? -1 : s.provinces[i].owner;
    return { day: s.day, date: dateString(s), owners };
  }

  /** Call after each simulated day; samples on a fixed cadence. */
  tick(s: GameState): void {
    const last = this.frames[this.frames.length - 1];
    if (!last || s.day - last.day >= SAMPLE_DAYS || s.day < last.day) {
      if (last && s.day < last.day) this.frames = this.frames.filter((f) => f.day < s.day);
      this.frames.push(this.snap(s));
    }
  }

  get supported(): boolean {
    return typeof MediaRecorder !== 'undefined' && typeof HTMLCanvasElement !== 'undefined' && 'captureStream' in HTMLCanvasElement.prototype;
  }

  /** Renders every sampled frame plus the current moment into a WebM blob. */
  async render(s: GameState, map: GeneratedMap): Promise<Blob> {
    const frames = [...this.frames];
    const cur = this.snap(s);
    if (!frames.length || frames[frames.length - 1].day !== cur.day) frames.push(cur);
    const geo = map.geo;
    const scale = OUT_W / geo.width;
    const canvas = document.createElement('canvas');
    canvas.width = OUT_W;
    canvas.height = Math.round(geo.height * scale);
    const ctx = canvas.getContext('2d')!;
    const paths = geo.provinceCells.map((cells) => {
      const path = new Path2D();
      for (const c of cells) {
        const poly = geo.cellPolys[c];
        path.moveTo(poly[0] * scale, poly[1] * scale);
        for (let i = 2; i < poly.length; i += 2) path.lineTo(poly[i] * scale, poly[i + 1] * scale);
        path.closePath();
      }
      return path;
    });
    const stream = canvas.captureStream(0) as MediaStream & { requestFrame?: () => void };
    const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m));
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 4_000_000 } : undefined);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const done = new Promise<Blob>((res) => (rec.onstop = () => res(new Blob(chunks, { type: 'video/webm' }))));
    rec.start();
    const draw = (f: PlaybackFrame, idx: number) => {
      ctx.fillStyle = '#12202e';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      for (let p = 0; p < paths.length; p++) {
        if (s.provinces[p].isSea) continue;
        const o = f.owners[p];
        ctx.fillStyle = o >= 0 ? s.nations[o]?.color ?? '#555' : '#4a4a4a';
        ctx.fill(paths[p]);
        ctx.strokeStyle = ctx.fillStyle;
        ctx.stroke(paths[p]);
      }
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 1;
      for (const e of geo.edges) {
        if (f.owners[e.a] === f.owners[e.b]) continue;
        ctx.beginPath();
        ctx.moveTo(e.x1 * scale, e.y1 * scale);
        ctx.lineTo(e.x2 * scale, e.y2 * scale);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(10, 10, 190, 36);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 20px sans-serif';
      ctx.fillText(f.date, 20, 35);
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.fillRect(0, canvas.height - 4, (canvas.width * (idx + 1)) / frames.length, 4);
    };
    for (let i = 0; i < frames.length; i++) {
      draw(frames[i], i);
      stream.requestFrame?.();
      await new Promise((r) => setTimeout(r, FRAME_MS));
    }
    // hold the final frame
    await new Promise((r) => setTimeout(r, 1000));
    rec.stop();
    return done;
  }
}
