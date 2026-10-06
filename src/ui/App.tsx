import { useEffect, useState } from 'preact/hooks';
import { defaultSettings } from '../sim/setup';
import { Tooltip } from './components';
import { DiplomacyPanel, PeaceDialog } from './Diplomacy';
import type { MapMode, Tab } from './game';
import { useGame } from './hooks';
import { mainRenderer, MapView } from './MapView';
import { EventModal, GameOverModal, Menu, Toasts, Tutorial } from './Modals';
import { EconomyPanel, GovernmentPanel, LogPanel, MilitaryPanel, RankingsPanel, ResearchPanel } from './Panels';
import { ProvincePanel } from './ProvincePanel';
import { MainMenu, SetupScreen } from './Setup';
import { TopBar } from './TopBar';

const TABS: { id: Tab; icon: string; label: string }[] = [
  { id: 'economy', icon: '💰', label: 'Economy' },
  { id: 'government', icon: '🏛️', label: 'Government' },
  { id: 'research', icon: '🔬', label: 'Research' },
  { id: 'military', icon: '🪖', label: 'Military' },
  { id: 'diplomacy', icon: '🤝', label: 'Diplomacy' },
  { id: 'rankings', icon: '⭐', label: 'Rankings' },
  { id: 'log', icon: '📰', label: 'Log' },
];

const MODES: { id: MapMode; label: string }[] = [
  { id: 'political', label: '🗺️ Political' },
  { id: 'diplomacy', label: '🤝 Relations' },
  { id: 'terrain', label: '⛰️ Terrain' },
  { id: 'resources', label: '💎 Resources' },
  { id: 'population', label: '👥 Population' },
];

export function App() {
  const g = useGame();
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (g.screen !== 'playing') return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (e.code === 'Space') {
        e.preventDefault();
        g.togglePause();
      } else if (/^Digit[0-4]$/.test(e.code)) g.setSpeed(Number(e.code.slice(5)));
      else if (e.key === 'Escape') {
        if (g.peaceWar >= 0) g.peaceWar = -1;
        else if (g.selectedDivs.size) g.selectedDivs.clear();
        else g.selectedProvince = -1;
        setMenu(false);
        g.notify();
      } else if (mainRenderer && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code)) {
        const step = 80 / mainRenderer.cam.zoom;
        if (e.code === 'ArrowLeft' || e.code === 'KeyA') mainRenderer.cam.x -= step;
        if (e.code === 'ArrowRight' || e.code === 'KeyD') mainRenderer.cam.x += step;
        if (e.code === 'ArrowUp' || e.code === 'KeyW') mainRenderer.cam.y -= step;
        if (e.code === 'ArrowDown' || e.code === 'KeyS') mainRenderer.cam.y += step;
        mainRenderer.clamp();
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);

  if (g.screen === 'menu') {
    return (
      <>
        <MainMenu g={g} />
        <Tooltip />
      </>
    );
  }
  if (g.screen === 'setup') {
    return (
      <>
        <SetupScreen g={g} />
        <Tooltip />
      </>
    );
  }

  const newGame = () => {
    setMenu(false);
    g.speed = 0;
    g.prepare(defaultSettings(Math.floor(Math.random() * 1_000_000), g.state.settings.difficulty));
  };

  return (
    <div class="app">
      <TopBar g={g} onMenu={() => { g.setSpeed(0); setMenu(true); }} />
      <div class="main">
        <MapView />
        <nav class="map-modes" aria-label="Map mode">
          {MODES.map((m) => (
            <button key={m.id} class={g.mapMode === m.id ? 'on' : ''} onClick={() => { g.mapMode = m.id; g.notify(); }}>
              {m.label}
            </button>
          ))}
        </nav>
        <div class={`side ${g.panelOpen ? 'open' : ''}`}>
          <nav class="tabs" aria-label="Panels">
            {TABS.map((t) => (
              <button
                key={t.id}
                class={g.tab === t.id && g.panelOpen ? 'on' : ''}
                onClick={() => {
                  if (g.tab === t.id) g.panelOpen = !g.panelOpen;
                  else {
                    g.tab = t.id;
                    g.panelOpen = true;
                  }
                  g.notify();
                }}
                data-tip={t.label}
                aria-label={t.label}
              >
                <span>{t.icon}</span>
                <small>{t.label}</small>
              </button>
            ))}
          </nav>
          {g.panelOpen && (
            <div class="panel">
              {g.tab === 'economy' && <EconomyPanel g={g} />}
              {g.tab === 'government' && <GovernmentPanel g={g} />}
              {g.tab === 'research' && <ResearchPanel g={g} />}
              {g.tab === 'military' && <MilitaryPanel g={g} />}
              {g.tab === 'diplomacy' && <DiplomacyPanel g={g} />}
              {g.tab === 'rankings' && <RankingsPanel g={g} />}
              {g.tab === 'log' && <LogPanel g={g} />}
            </div>
          )}
        </div>
        <ProvincePanel g={g} />
        {g.selectedDivs.size > 0 && (
          <div class="selection-bar">
            {g.selectedDivs.size} division{g.selectedDivs.size > 1 ? 's' : ''} selected — click a province to march · Esc to deselect
          </div>
        )}
        <Tutorial g={g} />
        <Toasts g={g} />
      </div>
      <EventModal g={g} />
      {g.peaceWar >= 0 && <PeaceDialog g={g} />}
      <GameOverModal g={g} onNew={newGame} />
      {menu && <Menu g={g} onClose={() => setMenu(false)} onNew={newGame} />}
      <Tooltip />
    </div>
  );
}
