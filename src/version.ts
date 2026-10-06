// Build metadata injected by Vite (see vite.config.ts). The simulation must not import this.
export const APP_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0';
export const COMMIT: string = typeof __COMMIT__ === 'string' ? __COMMIT__.slice(0, 7) : 'dev';
export const BUILD_TIME: string = typeof __BUILD_TIME__ === 'string' ? __BUILD_TIME__ : '';
export const VERSION_LABEL = COMMIT === 'dev' ? `v${APP_VERSION}-dev` : `v${APP_VERSION} (${COMMIT})`;
