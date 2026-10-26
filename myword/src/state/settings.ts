// Application settings (theme, zoom, default font/size, paper, units, user name, AutoCorrect),
// persisted by the FileAdapter: settings.json on desktop, localStorage on the web.
import { AppSettings, DEFAULT_SETTINGS, fileAdapter } from '../io/FileAdapter';
import { setAutocorrectSettings } from './settingsStore';
import { bump, setState } from './store';

let current: AppSettings = { ...DEFAULT_SETTINGS };

export function settings(): AppSettings {
  return current;
}

export async function loadSettings(): Promise<AppSettings> {
  current = { ...DEFAULT_SETTINGS, ...(await fileAdapter().loadSettings()) };
  current.defaultZoom = Math.max(10, Math.min(500, Number(current.defaultZoom) || 100));
  if (current.autocorrect) setAutocorrectSettings(current.autocorrect);
  return current;
}

export async function updateSettings(patch: Partial<AppSettings>): Promise<void> {
  // recent files are owned by the adapter; re-read so we don't clobber them
  const latest = await fileAdapter().loadSettings();
  current = { ...DEFAULT_SETTINGS, ...latest, ...patch };
  await fileAdapter().saveSettings(current);
}

export function applyTheme(t: 'light' | 'dark'): void {
  document.documentElement.dataset.theme = t;
  setState({ theme: t });
  bump();
}

export async function setThemeSetting(t: 'light' | 'dark'): Promise<void> {
  applyTheme(t);
  await updateSettings({ theme: t });
}
