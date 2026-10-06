// Tiny flag parser shared by the headless scripts: --key value, --flag, and positional args.
export interface Args {
  positional: string[];
  flags: Record<string, string | true>;
}

export function parseArgs(argv: string[] = process.argv.slice(2)): Args {
  const out: Args = { positional: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        out.flags[key] = next;
        i++;
      } else out.flags[key] = true;
    } else out.positional.push(a);
  }
  return out;
}

export function num(args: Args, key: string, fallback: number, pos?: number): number {
  const v = args.flags[key] ?? (pos !== undefined ? args.positional[pos] : undefined);
  const n = typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

export function str(args: Args, key: string, fallback: string, pos?: number): string {
  const v = args.flags[key] ?? (pos !== undefined ? args.positional[pos] : undefined);
  return typeof v === 'string' ? v : fallback;
}
