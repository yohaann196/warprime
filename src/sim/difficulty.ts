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
  gangUpOnLeader: boolean;
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
    gangUpOnLeader: false,
    aiRetaliation: 0.3,
    playerResearch: 0.2,
  },
  realistic: {
    id: 'realistic',
    name: 'Realistic',
    blurb: 'A fair world. AI nations play to win; grudges fade with time.',
    aiAggression: 1,
    aiEconomy: 0,
    playerClick: 0,
    playerStartMoney: 300,
    hints: 'some',
    memory: 1,
    fog: false,
    gangUpOnLeader: false,
    aiRetaliation: 0.7,
    playerResearch: 0,
  },
  demonic: {
    id: 'demonic',
    name: 'Demonic',
    blurb: 'Ruthless, rich AI that gangs up on the leader and never forgets. Good luck.',
    aiAggression: 1.6,
    aiEconomy: 0.35,
    playerClick: -0.2,
    playerStartMoney: 0,
    hints: 'none',
    memory: 3,
    fog: true,
    gangUpOnLeader: true,
    aiRetaliation: 1,
    playerResearch: -0.1,
  },
};
