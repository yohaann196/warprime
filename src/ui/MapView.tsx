import { useEffect, useRef } from 'preact/hooks';
import { MapRenderer } from '../render/MapRenderer';
import { provinceAt } from '../sim/worldgen/geometry';
import { atWar, divisionsAt, isFriendly } from '../sim/query';
import { game } from './game';

export let mainRenderer: MapRenderer | null = null;

/** Is clicking this province a battle click (your forces fighting or besieging there)? */
function contested(pid: number): boolean {
  const s = game.state;
  const me = s.player;
  const p = s.provinces[pid];
  const here = divisionsAt(s, pid);
  const mine = here.some((d) => d.owner === me || isFriendly(s, me, d.owner));
  const enemy = here.some((d) => atWar(s, me, d.owner));
  if (mine && (enemy || atWar(s, me, p.controller))) return true;
  // defending your own land under siege
  return p.controller === me && enemy;
}

export function handleProvinceClick(pid: number, wx: number, wy: number, shift: boolean): void {
  const s = game.state;
  const me = s.player;
  const p = s.provinces[pid];
  if (game.selectedDivs.size) {
    const divs = s.divisions.filter((d) => game.selectedDivs.has(d.id));
    if (divs.length && divs.every((d) => d.province === pid)) {
      if (contested(pid)) {
        const r = game.cmd({ type: 'battleClick', province: pid }, true);
        if (r.click) game.floater(wx, wy, r.click.text, '#ff9a5a');
        return;
      }
      if (!shift) game.selectedDivs.clear();
      game.selectedProvince = pid;
      game.notify();
      return;
    }
    const r = game.cmd({ type: 'move', divisions: [...game.selectedDivs], target: pid }, true);
    if (r.ok) game.floater(wx, wy, '➜', '#ffd34d');
    else game.toast(r.msg ?? 'Cannot move there', 'err');
    return;
  }
  game.selectedProvince = pid;
  if (contested(pid)) {
    const r = game.cmd({ type: 'battleClick', province: pid }, true);
    if (r.click) game.floater(wx, wy, r.click.text, '#ff9a5a');
    return;
  }
  if (p.owner === me && p.controller === me) {
    const r = p.construction ? game.cmd({ type: 'buildClick', province: pid }, true) : game.cmd({ type: 'workClick', province: pid }, true);
    if (r.click) game.floater(wx, wy, r.click.text, r.click.crit ? '#ff6bd5' : p.construction ? '#9fd8ff' : '#ffe28a');
    return;
  }
  game.notify();
}

export function MapView() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current!;
    const r = new MapRenderer(canvas, game);
    mainRenderer = r;
    r.resize();
    r.fit();
    const cap = game.state.player >= 0 ? game.state.provinces[game.state.nations[game.state.player].capital] : null;
    if (cap) r.centerOn(cap.center[0], cap.center[1], r.minZoom() * 2.2);
    const ro = new ResizeObserver(() => {
      r.resize();
      r.clamp();
    });
    ro.observe(canvas);

    let raf = 0;
    const loop = (now: number) => {
      r.render(now);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    const pointers = new Map<number, { x: number; y: number }>();
    let downAt: { x: number; y: number; cx: number; cy: number } | null = null;
    let dragged = false;
    let pinch = 0;
    const local = (e: PointerEvent | WheelEvent | MouseEvent) => {
      const b = canvas.getBoundingClientRect();
      return { x: e.clientX - b.left, y: e.clientY - b.top };
    };

    const onDown = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId);
      const pt = local(e);
      pointers.set(e.pointerId, pt);
      if (pointers.size === 1) {
        downAt = { x: pt.x, y: pt.y, cx: r.cam.x, cy: r.cam.y };
        dragged = false;
      } else if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = Math.hypot(a.x - b.x, a.y - b.y);
        dragged = true;
      }
    };
    const onMove = (e: PointerEvent) => {
      const pt = local(e);
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, pt);
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch > 0) r.zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, d / pinch);
        pinch = d;
        return;
      }
      if (downAt && pointers.size === 1) {
        const dx = pt.x - downAt.x;
        const dy = pt.y - downAt.y;
        if (!dragged && Math.hypot(dx, dy) > 5) dragged = true;
        if (dragged) {
          r.cam.x = downAt.cx - dx / r.cam.zoom;
          r.cam.y = downAt.cy - dy / r.cam.zoom;
          r.clamp();
          canvas.style.cursor = 'grabbing';
        }
      }
      if (!downAt) {
        const [wx, wy] = r.screenToWorld(pt.x, pt.y);
        const pid = provinceAt(game.map.geo, wx, wy);
        r.hover = pid;
        canvas.style.cursor = r.plateAt(pt.x, pt.y) ? 'pointer' : game.selectedDivs.size ? 'crosshair' : 'default';
      }
    };
    const onUp = (e: PointerEvent) => {
      const pt = local(e);
      pointers.delete(e.pointerId);
      if (pointers.size > 0) return;
      canvas.style.cursor = 'default';
      const wasDrag = dragged;
      downAt = null;
      pinch = 0;
      if (wasDrag || e.button !== 0) return;
      const plate = r.plateAt(pt.x, pt.y);
      const s = game.state;
      if (plate && plate.owner === s.player) {
        if (!e.shiftKey) game.selectedDivs.clear();
        for (const id of plate.divs) game.selectedDivs.add(id);
        game.selectedProvince = plate.province;
        game.notify();
        return;
      }
      const [wx, wy] = r.screenToWorld(pt.x, pt.y);
      const pid = provinceAt(game.map.geo, wx, wy);
      if (pid < 0) return;
      handleProvinceClick(pid, wx, wy, e.shiftKey);
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const pt = local(e);
      r.zoomAt(pt.x, pt.y, Math.exp(-e.deltaY * 0.0015));
    };
    const onContext = (e: MouseEvent) => {
      e.preventDefault();
      const pt = local(e);
      if (!game.selectedDivs.size) {
        game.selectedProvince = -1;
        game.notify();
        return;
      }
      const [wx, wy] = r.screenToWorld(pt.x, pt.y);
      const pid = provinceAt(game.map.geo, wx, wy);
      if (pid < 0) return;
      const res = game.cmd({ type: 'move', divisions: [...game.selectedDivs], target: pid }, true);
      if (res.ok) game.floater(wx, wy, '➜', '#ffd34d');
      else game.toast(res.msg ?? 'Cannot move there', 'err');
    };
    const onLeave = () => {
      r.hover = -1;
    };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('contextmenu', onContext);
    canvas.addEventListener('pointerleave', onLeave);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('contextmenu', onContext);
      canvas.removeEventListener('pointerleave', onLeave);
      mainRenderer = null;
    };
  }, []);
  return <canvas ref={ref} class="map-canvas" aria-label="World map" />;
}
