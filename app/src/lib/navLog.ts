import { info, warn, error, debug } from '@tauri-apps/plugin-log';

const inTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

const swallow = (_e: unknown) => {};

export function logNav(source: string, data: Record<string, unknown> = {}): void {
  if (!inTauri) return;
  info(`[NAV] ${source} ${JSON.stringify(data)}`).catch(swallow);
}

let consoleInstalled = false;

export function installConsoleForwarding(): void {
  if (consoleInstalled || !inTauri) return;
  consoleInstalled = true;

  const origLog = console.log;
  const origInfo = console.info;
  const origWarn = console.warn;
  const origError = console.error;
  const origDebug = console.debug;

  const stringify = (args: unknown[]): string =>
    args
      .map(a => {
        if (typeof a === 'string') return a;
        try {
          return JSON.stringify(a);
        } catch {
          return String(a);
        }
      })
      .join(' ');

  console.log = (...args: unknown[]) => {
    origLog(...args);
    info(stringify(args)).catch(swallow);
  };
  console.info = (...args: unknown[]) => {
    origInfo(...args);
    info(stringify(args)).catch(swallow);
  };
  console.warn = (...args: unknown[]) => {
    origWarn(...args);
    warn(stringify(args)).catch(swallow);
  };
  console.error = (...args: unknown[]) => {
    origError(...args);
    error(stringify(args)).catch(swallow);
  };
  console.debug = (...args: unknown[]) => {
    origDebug(...args);
    debug(stringify(args)).catch(swallow);
  };
}
