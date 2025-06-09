import { parsePositions } from './parsePositions';
import type { RaceSetup, BoatData } from './types';
import { DEFAULT_SETTINGS } from './speedUtils';

export const settings = loadSettings();

export async function fetchRaceSetup(raceId: string): Promise<RaceSetup> {
  return fetchJSON<RaceSetup>(`/${raceId}/RaceSetup.json`);
}

export async function fetchPositions(raceId: string, boatNames: number[]): Promise<Record<number, ReturnType<typeof parsePositions>[number]>> {
  const all = await fetchJSON<BoatData[]>(`/${raceId}/AllPositions3.json`);
  const filtered = all.filter(b => boatNames.includes(b.id));
  return parsePositions(filtered);
}

export async function populateRaceSelector(): Promise<{ id: string; name: string }[]> {
  const raceSelect = document.getElementById('raceSelect') as HTMLSelectElement;
  try {
    const races = await fetchJSON<{ id: string; name: string }[]>('/races.json');
    raceSelect.innerHTML = '';
    races.forEach(r => { const opt = document.createElement('option'); opt.value = r.id; opt.textContent = r.name; raceSelect.appendChild(opt); });
    return races;
  } catch (err) {
    console.error('Could not load races.json', err);
    raceSelect.innerHTML = '<option value="">Could not load races</option>';
    raceSelect.disabled = true;
    return [];
  }
}

export function loadSettings() {
  try { const data = JSON.parse(localStorage.getItem('settings') || '{}'); return { ...DEFAULT_SETTINGS, ...data }; }
  catch { return { ...DEFAULT_SETTINGS }; }
}

export function saveSettings(){
  localStorage.setItem('settings', JSON.stringify({ distNm: settings.distNm, percentile: settings.percentile, smoothLen: settings.smoothLen }));
}

export async function fetchJSON<T>(url: string): Promise<T> {
  const r = await fetch(url).catch(err => { throw new Error(`${url}: ${err}`); });
  if(!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json() as Promise<T>;
}
