import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { fmt } from '../sim/clicks';
import type { Nation } from '../sim/state';

export { fmt };

export function signed(v: number): string {
  return (v >= 0 ? '+' : '') + fmt(v);
}

export function pct(v: number): string {
  return `${Math.round(v * 100)}%`;
}

export function Flag({ nation, size = 22 }: { nation: Nation; size?: number }) {
  const [a, b, c] = nation.flag.colors;
  const w = size * 1.5;
  const h = size;
  let body;
  switch (nation.flag.pattern) {
    case 'vertical':
      body = (
        <>
          <rect width={w / 3} height={h} fill={a} />
          <rect x={w / 3} width={w / 3} height={h} fill={c} />
          <rect x={(2 * w) / 3} width={w / 3} height={h} fill={b} />
        </>
      );
      break;
    case 'horizontal':
      body = (
        <>
          <rect width={w} height={h / 3} fill={a} />
          <rect y={h / 3} width={w} height={h / 3} fill={c} />
          <rect y={(2 * h) / 3} width={w} height={h / 3} fill={b} />
        </>
      );
      break;
    case 'cross':
      body = (
        <>
          <rect width={w} height={h} fill={a} />
          <rect x={w * 0.3} width={w * 0.14} height={h} fill={c} />
          <rect y={h * 0.43} width={w} height={h * 0.14} fill={c} />
        </>
      );
      break;
    case 'diagonal':
      body = (
        <>
          <rect width={w} height={h} fill={a} />
          <polygon points={`0,${h} ${w},0 ${w},${h}`} fill={b} />
          <line x1={0} y1={h} x2={w} y2={0} stroke={c} stroke-width={h * 0.14} />
        </>
      );
      break;
    default:
      body = (
        <>
          <rect width={w} height={h} fill={a} />
          <circle cx={w / 2} cy={h / 2} r={h * 0.28} fill={c} />
          <circle cx={w / 2} cy={h / 2} r={h * 0.14} fill={b} />
        </>
      );
  }
  return (
    <svg class="flag" width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`Flag of ${nation.name}`}>
      {body}
    </svg>
  );
}

export function Bar({ value, max = 1, color = 'var(--gold)', label }: { value: number; max?: number; color?: string; label?: string }) {
  const p = Math.max(0, Math.min(1, value / (max || 1)));
  return (
    <div class="bar">
      <div class="bar-fill" style={{ width: `${p * 100}%`, background: color }} />
      {label && <span class="bar-label">{label}</span>}
    </div>
  );
}

export function Section({ title, children, right }: { title: string; children: ComponentChildren; right?: ComponentChildren }) {
  return (
    <section class="section">
      <h3>
        <span>{title}</span>
        {right}
      </h3>
      {children}
    </section>
  );
}

/** Global tooltip: any element with data-tip shows it on hover. Lines split on \n. */
export function Tooltip() {
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null);
  useEffect(() => {
    const over = (e: MouseEvent) => {
      const el = (e.target as HTMLElement)?.closest?.('[data-tip]') as HTMLElement | null;
      if (!el) return setTip(null);
      const r = el.getBoundingClientRect();
      setTip({ text: el.dataset.tip ?? '', x: r.left + r.width / 2, y: r.bottom + 6 });
    };
    const out = () => setTip(null);
    document.addEventListener('mouseover', over);
    document.addEventListener('scroll', out, true);
    return () => {
      document.removeEventListener('mouseover', over);
      document.removeEventListener('scroll', out, true);
    };
  }, []);
  if (!tip || !tip.text) return null;
  const left = Math.max(8, Math.min(window.innerWidth - 300, tip.x - 140));
  const top = tip.y + 120 > window.innerHeight ? tip.y - 140 : tip.y;
  return (
    <div class="tooltip" style={{ left: `${left}px`, top: `${top}px` }}>
      {tip.text.split('\n').map((l, i) => (
        <div key={i} class={l.startsWith('—') ? 'tip-head' : ''}>
          {l}
        </div>
      ))}
    </div>
  );
}

export function opinionColor(v: number): string {
  if (v >= 50) return 'var(--good)';
  if (v >= 10) return '#a3d977';
  if (v > -10) return 'var(--muted)';
  if (v > -50) return '#f0a35e';
  return 'var(--bad)';
}
