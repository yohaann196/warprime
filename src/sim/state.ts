// Core game-state types. Everything here is plain JSON-serializable data so saves are trivial.

export type Terrain = 'ocean' | 'plains' | 'forest' | 'hills' | 'mountains' | 'desert' | 'tundra' | 'jungle';

export const RESOURCES = ['food', 'wood', 'iron', 'coal', 'oil', 'uranium', 'rare'] as const;
export type Resource = (typeof RESOURCES)[number];

export const GOODS = [
  ...RESOURCES,
  'steel',
  'fuel',
  'munitions',
  'consumer',
  'vehicles',
  'electronics',
] as const;
export type Good = (typeof GOODS)[number];

export type Stock = Record<Good, number>;

export const INSTITUTIONS = ['industry', 'army', 'science', 'trade', 'diplomacy', 'bureaucracy'] as const;
export type Institution = (typeof INSTITUTIONS)[number];

export type EconSystemId = 'free_market' | 'planned' | 'mixed' | 'mercantilism' | 'war_economy' | 'cooperative';
export type Difficulty = 'beginner' | 'realistic' | 'demonic';

export type BuildingId =
  | 'farm'
  | 'sawmill'
  | 'mine'
  | 'oil_well'
  | 'steel_mill'
  | 'refinery'
  | 'munitions_plant'
  | 'consumer_factory'
  | 'vehicle_plant'
  | 'electronics_plant'
  | 'power_plant'
  | 'university'
  | 'market_hall'
  | 'admin_office'
  | 'barracks'
  | 'fort'
  | 'port';

export type UnitType = 'infantry' | 'artillery' | 'armor' | 'air' | 'drone';

export interface Construction {
  building: BuildingId;
  progress: number; // work units done
  total: number;
}

export interface Province {
  id: number;
  name: string;
  terrain: Terrain;
  isSea: boolean;
  coastal: boolean;
  center: [number, number];
  area: number; // number of cells
  neighbors: number[];
  owner: number; // nation id, -1 = none (sea / unclaimed)
  controller: number; // who currently holds it militarily
  pop: number; // thousands
  resource: Resource | null;
  buildings: Partial<Record<BuildingId, number>>;
  construction: Construction | null;
  roads: number; // 0..4
  devastation: number; // 0..1, recovers over time
  fallout: number; // days of nuclear fallout remaining
  siege: number; // 0..100 occupation progress by current besieger
  siegeBy: number; // nation sieging, -1 none
  isCapital: boolean;
  unrest: number; // 0..100
  clickBoost?: number; // battle-click pressure, decays every tick
  clickBoostBy?: number; // nation that clicked
}

export interface TechState {
  researched: string[];
  current: string | null;
  progress: number;
}

export interface Personality {
  aggression: number; // 0..1
  greed: number; // 0..1, how much they value money/land in deals
  loyalty: number; // 0..1, how likely to honour alliances
  focus: 'economy' | 'military' | 'science' | 'trade';
}

export interface ClickState {
  power: number; // base value per work click
  heat: number; // diminishing-returns accumulator, decays every tick
  combo: number; // consecutive quick clicks
  comboTimer: number; // ticks remaining before the combo drops
  totalClicks: number;
  autoRate: number; // passive clicks per day from automation
  upgrades: number; // how many "mobilize the people" upgrades bought
}

export interface Nation {
  id: number;
  name: string;
  adjective: string;
  color: string;
  flag: { colors: string[]; pattern: 'vertical' | 'horizontal' | 'cross' | 'diagonal' | 'circle' };
  isPlayer: boolean;
  alive: boolean;
  capital: number;
  money: number;
  debt: number;
  stock: Stock;
  reserve: Partial<Record<Good, number>>; // keep this much; auto-sell above
  autoTrade: boolean;
  taxRate: number; // 0..0.6
  econSystem: EconSystemId;
  econSwitchCooldown: number; // days until another switch is allowed
  transition: number; // days of instability left after switching systems
  goals: [Institution, Institution];
  institutions: Record<Institution, number>;
  devPoints: number;
  devProgress: number;
  tech: TechState;
  era: number;
  stability: number; // 0..100
  happiness: number; // 0..100
  warExhaustion: number; // 0..100
  trust: number; // 0..100 global trustworthiness
  manpower: number; // thousands available
  clicks: ClickState;
  personality: Personality;
  nukes: number;
  nukeProgress: number; // 0..1 building the next warhead, -1 idle
  aiTimer: number;
  // derived each tick (cached for UI / AI)
  gdp: number;
  income: number;
  expenses: number;
  prosperity: number;
  prosperityParts: Record<string, number>;
  militaryStrength: number;
  tradeVolume: number;
  history: HistoryPoint[]; // sampled every state.historyStep days; spacing doubles as the game goes on
  sabotageCooldown: number;
  tempMods: TempMod[];
  ledger: Record<string, number>; // money flows of the last day by category (+income / -expense)
  netGoods: Partial<Record<Good, number>>; // net production of the last day
  research: number; // research points per day (last day)
  foodShortage: boolean;
  consumerSat: number; // 0..1 share of consumer-goods demand met
  connected: number[]; // provinces linked to the capital by land (logistics)
  // Owned by the climate subsystem (absent until it runs): fossil emissions and abatement per day,
  // and money spent on green programmes per day. Prosperity reads them defensively.
  emissions?: number;
  abated?: number;
  greenSpend?: number;
}

export interface HistoryPoint {
  day: number;
  prosperity: number;
  gdp: number;
}

export interface TempMod {
  key: string;
  value: number;
  until: number;
  reason: string;
}

export interface Division {
  id: number;
  owner: number;
  type: UnitType;
  province: number;
  strength: number; // 0..1 manpower/equipment fill
  org: number; // 0..1 organisation / morale
  xp: number;
  path: number[]; // provinces still to traverse (next first)
  moveProgress: number; // 0..1 toward path[0]
  training: number; // days until ready (0 = active)
  stance: 'move' | 'hold';
}

export type PactType = 'alliance' | 'nap' | 'access' | 'puppet' | 'loan' | 'trade' | 'truce';

export interface Pact {
  id: number;
  type: PactType;
  a: number; // for puppet: overlord; for loan: lender; for trade: seller
  b: number; // for puppet: subject; for loan: borrower; for trade: buyer
  start: number;
  until: number; // day it expires, -1 = indefinite
  liberty?: number; // puppets
  amount?: number; // loans: outstanding; trade: units per day
  good?: Good;
  price?: number; // trade price per unit
  interest?: number;
}

export interface War {
  id: number;
  name: string;
  attackers: number[];
  defenders: number[];
  start: number;
  score: number; // -100..100, positive favours attackers
  battlesA: number;
  battlesD: number;
  casualtiesA: number;
  casualtiesD: number;
}

export interface OpinionMod {
  from: number; // the nation holding the opinion
  to: number; // about whom
  value: number;
  decay: number; // per day toward zero
  reason: string;
}

export interface GameEvent {
  id: string;
  nation: number;
  day: number;
  province?: number;
  war?: number;
  from?: number;
  receiver?: 'attackers' | 'defenders';
  terms?: { cede: number[]; money: number; puppet: boolean; annex: boolean };
  clauses?: unknown[];
}

export interface LogEntry {
  day: number;
  text: string;
  kind: 'info' | 'war' | 'diplo' | 'econ' | 'bad' | 'good';
  nations: number[];
}

export interface Settings {
  seed: number;
  difficulty: Difficulty;
  nationCount: number;
  mapId: string; // 'random' = the seeded procedural world
  startYear: number;
  endYear: number; // the game ends on 1 Jan of this year
}

// ------------------------------------------------------------------ leaderboards and the end of the game

/** Why the game ended. Only checkEnd (src/sim/leaderboard.ts) sets state.gameOver. */
export type EndCause = 'year_limit' | 'climate_collapse' | 'eliminated';

/** Lifetime record of one nation (index = nation id; dead nations keep theirs). */
export interface NationRecord {
  daysAtTop: number; // days ranked #1 in the monthly ranking
  daysTop3: number; // days ranked 1..3
  rankPoints: number; // integral of RANK_POINTS[rank] per year
  bestRank: number; // 1-based; 0 = never ranked
  bestAllTimeRank: number; // 1-based; 0 = never ranked
  peakProsperity: number;
  peakProsperityDay: number;
  reigns: number; // times the crown was taken
  longestReign: number; // days
  firstTopDay: number; // first day holding the crown, -1 = never
  startProvinces: number;
  peakProvinces: number;
  peakGdp: number;
  diedDay: number; // -1 = alive
  eliminatedBy: number; // nation that took the last province, -1 = none
  deaths: number;
  lives: number; // 1 + times the nation was revived
}

/** A period holding the crown. end = -1 while it lasts. */
export interface Reign {
  nation: number;
  start: number;
  end: number;
}

/** Who led a calendar decade: [nation, days at #1] sorted by days. */
export interface DecadeLead {
  start: number; // calendar year, e.g. 1920
  holders: [number, number][];
  partial?: boolean; // the game did not cover the whole decade
}

export interface LeaderboardState {
  lastSampleDay: number;
  order: number[]; // alive nations, monthly ranking at the last sample
  allTimeOrder: number[]; // every nation (dead ones too), all-time ranking at the last sample
  yearStartOrder: number[]; // ranking at the first sample of the calendar year (rank-change arrows)
  crown: number; // official #1 (with hysteresis), -1 = none
  challenger: number; // raw #1 that has not taken the crown yet, -1 = none
  records: NationRecord[];
  reigns: Reign[];
  decade: { start: number; days: number[] }; // running decade: days at #1 per nation
  decades: DecadeLead[]; // finished decades
  nextYearsMilestone: number; // index into YEARS_AT_TOP_MILESTONES for the player
}

export type NoticeTone = 'good' | 'bad' | 'info' | 'gold';

/** A headline for the player. The UI turns new ones into toasts. */
export interface Notice {
  id: number;
  day: number;
  text: string;
  tone: NoticeTone;
  nations: number[];
}

export interface StandingRow {
  nation: number;
  rank: number;
  prosperity: number;
}

export interface AllTimeRow {
  nation: number;
  rank: number;
  daysAtTop: number;
  daysTop3: number;
  rankPoints: number;
  diedDay: number;
}

/** The player's final numbers, frozen when the game ends. */
export interface PlayerFinal {
  nation: number;
  survived: boolean;
  diedDay: number;
  eliminatedBy: number;
  currentRank: number; // 0 if dead
  aliveCount: number;
  allTimeRank: number;
  nationCount: number;
  prosperity: number;
  peakProsperity: number;
  peakProsperityDay: number;
  daysAtTop: number;
  daysTop3: number;
  rankPoints: number;
  bestRank: number;
  longestReign: number;
  reigns: number;
  firstTopDay: number;
  provinces: number;
  startProvinces: number;
  peakProvinces: number;
  gdp: number;
  peakGdp: number;
  population: number;
  techs: number;
  clicks: number;
  yearsAlive: number;
  legacy: number; // Hall of Fame score
}

export interface GameOver {
  cause: EndCause;
  day: number;
  year: number;
  crown: number;
  climateDamage: number | null;
  current: StandingRow[];
  allTime: AllTimeRow[];
  player: PlayerFinal | null;
  worldEnd?: { cause: Exclude<EndCause, 'eliminated'>; day: number }; // reached while spectating
}

export interface GameState {
  version: number;
  settings: Settings;
  day: number; // days since start
  rngState: number;
  provinces: Province[];
  nations: Nation[];
  divisions: Division[];
  pacts: Pact[];
  wars: War[];
  relations: number[][]; // base relations, symmetric-ish, -100..100
  opinion: OpinionMod[];
  prices: Record<Good, number>;
  priceHistory: Record<Good, number[]>;
  pendingEvents: GameEvent[]; // events awaiting the player's choice
  log: LogEntry[];
  nextId: number;
  player: number;
  gameOver: GameOver | null;
  tutorialStep: number;
  leaderboard: LeaderboardState;
  notices: Notice[]; // the last 40 headlines
  nextNoticeId: number;
  noticeCooldowns: Record<string, number>; // notice key -> first day it may fire again
  historyStep: number; // days between Nation.history points (doubles to keep histories short)
  climate?: { damage: number }; // Earth damage 0..100, filled by the climate subsystem
  spectating?: boolean; // the eliminated player keeps watching; the sim runs on, commands stay closed
  runId?: string; // set by the UI to identify the run in the Hall of Fame; the sim never reads it
}

export function emptyStock(): Stock {
  const s = {} as Stock;
  for (const g of [
    'food',
    'wood',
    'iron',
    'coal',
    'oil',
    'uranium',
    'rare',
    'steel',
    'fuel',
    'munitions',
    'consumer',
    'vehicles',
    'electronics',
  ] as Good[])
    s[g] = 0;
  return s;
}

export const DAYS_PER_YEAR = 365;

export function yearOf(state: GameState): number {
  return state.settings.startYear + Math.floor(state.day / DAYS_PER_YEAR);
}

export function dateString(state: GameState): string {
  const dayOfYear = state.day % DAYS_PER_YEAR;
  const months = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  let d = dayOfYear;
  let m = 0;
  while (d >= months[m]) {
    d -= months[m];
    m++;
  }
  return `${d + 1} ${names[m]} ${yearOf(state)}`;
}
