import type { Rng } from '../rng';

const START = ['Ar', 'Bel', 'Cor', 'Dra', 'El', 'Fen', 'Gal', 'Hal', 'Is', 'Jor', 'Kal', 'Lor', 'Mar', 'Nor', 'Os', 'Pra', 'Quel', 'Ros', 'Sar', 'Tal', 'Ul', 'Val', 'Wes', 'Xan', 'Yr', 'Zen', 'Ath', 'Bor', 'Cas', 'Dun', 'Ery', 'Gor', 'Kes', 'Mir', 'Ost', 'Rav', 'Sel', 'Tor', 'Ves', 'Vor'];
const MID = ['a', 'e', 'i', 'o', 'u', 'an', 'el', 'or', 'is', 'ar', 'en', 'ul', 'ad', 'om', 'yr', 'av', 'et'];
const END = ['ia', 'land', 'mark', 'stan', 'heim', 'ora', 'avia', 'ica', 'onia', 'esh', 'oria', 'gard', 'ovia', 'ara', 'eth', 'is', 'ania', 'mor', 'una', 'aria'];
const CITY_END = ['burg', 'grad', 'ford', 'ton', 'mouth', 'polis', 'ville', 'stad', 'haven', 'wick', 'port', 'dale', 'field', 'vik', 'ovo', 'ec', 'ora', 'amar', 'is', 'ham'];
const FORMS = ['Republic of', 'Kingdom of', 'Federation of', 'Union of', 'Commonwealth of', 'Duchy of', 'Empire of', 'Confederation of', 'Free State of', ''];

export function nationName(rng: Rng, used: Set<string>): { name: string; adjective: string; formal: string } {
  for (let tries = 0; tries < 100; tries++) {
    const core = rng.pick(START) + (rng.chance(0.5) ? rng.pick(MID) : '') + rng.pick(END);
    if (used.has(core)) continue;
    used.add(core);
    const adjective = core.replace(/(ia|land|mark|stan|heim|a|is|esh|eth|mor|gard)$/, '') + 'ian';
    const form = rng.pick(FORMS);
    return { name: core, adjective, formal: form ? `${form} ${core}` : core };
  }
  return { name: 'Nation' + used.size, adjective: 'National', formal: 'Nation' };
}

export function cityName(rng: Rng, used: Set<string>): string {
  for (let tries = 0; tries < 50; tries++) {
    const n = rng.pick(START) + (rng.chance(0.4) ? rng.pick(MID) : '') + rng.pick(CITY_END);
    if (!used.has(n)) {
      used.add(n);
      return n;
    }
  }
  return 'Town ' + used.size;
}

const SEA_A = ['Northern', 'Southern', 'Eastern', 'Western', 'Silver', 'Azure', 'Stormy', 'Quiet', 'Iron', 'Amber', 'Grey', 'Coral', 'Misty', 'Golden'];
const SEA_B = ['Sea', 'Gulf', 'Bay', 'Strait', 'Ocean', 'Deep', 'Sound', 'Waters', 'Bight'];

export function seaName(rng: Rng, used: Set<string>): string {
  for (let tries = 0; tries < 50; tries++) {
    const n = `${rng.pick(SEA_A)} ${rng.pick(SEA_B)}`;
    if (!used.has(n)) {
      used.add(n);
      return n;
    }
  }
  return 'Sea ' + used.size;
}
