import { render } from 'preact';
import { App } from './ui/App';
import { installDebugHandle } from './ui/debug';
import { game } from './ui/game';
import { migrateLegacyStore } from './save';
import './ui/styles.css';

void migrateLegacyStore();
installDebugHandle(game);
render(<App />, document.getElementById('app')!);
