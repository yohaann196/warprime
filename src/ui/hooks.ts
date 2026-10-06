import { useEffect, useState } from 'preact/hooks';
import { game, type Game } from './game';

/** Re-render whenever the game notifies. */
export function useGame(): Game {
  const [, setV] = useState(0);
  useEffect(() => game.subscribe(() => setV((v) => v + 1)), []);
  return game;
}
