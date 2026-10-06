import type { Difficulty } from './state';

export interface DifficultyDef {
  id: Difficulty;
  name: string;
  blurb: string;
  aiAggression: number; // multiplier on AI war appetite
  aiEconomy: number; // AI output modifier (fraction)
  playerClick: number; // player click power modifier (fraction)
  playerStartMoney: number;
  hints: 'full' | 'some' | 'none';
  memory: number; // multiplier on how long betrayal / nuke grudges last
  fog: boolean;
  leaderEnvy: number; // added war desire against a runaway world #1 (AI or player)
  playerEnvy: number; // added war desire against the player while ranked in the top 3
  leaderAllianceYears: number; // a #1 reigning this long draws a grand alliance into its wars (0 = never)
  aiRetaliation: number; // chance an AI nuclear power answers a nuke with a nuke
  playerResearch: number;
}

export const DIFFICULTY: Record<Difficulty, DifficultyDef> = {
  beginner: {
    id: 'beginner',
    name: 'Beginner',
    blurb: 'Gentle neighbours, generous clicks, full hints. Learn the ropes.',
    aiAggression: 0.45,
    aiEconomy: -0.25,
    playerClick: 0.5,
    playerStartMoney: 800,
    hints: 'full',
    memory: 0.6,
    fog: false,
    leaderEnvy: 0,
    playerEnvy: 0,
    leaderAllianceYears: 0,
    aiRetaliation: 0.3,
    playerResearch: 0.2,
  },
  realistic: {
    id: 'realistic',
    name: 'Realistic',
    blurb: 'A fair world. AI nations play hard and envy a runaway #1; grudges fade with time.',
    aiAggression: 1,
    aiEconomy: 0,
    playerClick: 0,
    playerStartMoney: 300,
    hints: 'some',
    memory: 1,
    fog: false,
    leaderEnvy: 0.08,
    playerEnvy: 0,
    leaderAllianceYears: 30,
    aiRetaliation: 0.7,
    playerResearch: 0,
  },
  demonic: {
    id: 'demonic',
    name: 'Demonic',
    blurb: "Ruthless, rich AI that gangs up on the world's #1 (including you) and never forgets. Good luck.",
    aiAggression: 1.6,
    aiEconomy: 0.35,
    playerClick: -0.2,
    playerStartMoney: 0,
    hints: 'none',
    memory: 3,
    fog: true,
    leaderEnvy: 0.35,
    playerEnvy: 0.1,
    leaderAllianceYears: 10,
    aiRetaliation: 1,
    playerResearch: -0.1,
  },
};
