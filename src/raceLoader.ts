import { parsePositions } from './parsePositions';
import type { RaceSetup, BoatData, LeaderboardEntry } from './types';
import { DEFAULT_SETTINGS } from './speedUtils';

function showError(msg: string){
  const el = document.getElementById('error-container');
  if(el){
    el.textContent = msg;
    (el as HTMLElement).style.display = 'block';
  }
}

function clearError(){
  const el = document.getElementById('error-container');
  if(el){
    el.textContent = '';
    (el as HTMLElement).style.display = 'none';
  }
}

export const settings = loadSettings();

export async function fetchRaceSetup(raceId: string): Promise<RaceSetup> {
  try {
    const data = await fetchJSON<RaceSetup>(`/${raceId}/RaceSetup.json`);
    clearError();
    return data;
  } catch (err) {
    console.error(err);
    showError('Error: Could not load race data. Please check your connection and try again.');
    throw err;
  }
}

export async function fetchPositions(raceId: string, boatNames: number[]): Promise<Record<number, ReturnType<typeof parsePositions>[number]>> {
  try {
    const all = await fetchJSON<BoatData[]>(`/${raceId}/AllPositions3.json`);
    clearError();
    const filtered = all.filter(b => boatNames.includes(b.id));
    return parsePositions(filtered);
  } catch (err) {
    console.error(err);
    showError('Error: Could not load race data. Please check your connection and try again.');
    throw err;
  }
}

export async function populateRaceSelector(): Promise<{ id: string; name: string }[]> {
  const raceSelect = document.getElementById('raceSelect') as HTMLSelectElement;
  try {
    const races = await fetchJSON<{ id: string; name: string }[]>('/races.json');
    clearError();
    raceSelect.innerHTML = '';
    races.forEach(r => { const opt = document.createElement('option'); opt.value = r.id; opt.textContent = r.name; raceSelect.appendChild(opt); });
    return races;
  } catch (err) {
    console.error('Could not load races.json', err);
    showError('Error: Could not load race data. Please check your connection and try again.');
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

export async function fetchLeaderboard(raceId: string): Promise<LeaderboardEntry[]> {
  try {
    const data = await fetchJSON<any>(`/${raceId}/leaderboard.json`);
    clearError();
    const teams = data?.tags?.[0]?.teams || [];
    return teams.map((t: any) => ({
      id: t.id,
      rank: t.rankR ?? t.rankS,
      status: t.status,
      corrected: t.cElapsedFormatted
    }));
  } catch (err) {
    console.error(err);
    showError('Error: Could not load race data. Please check your connection and try again.');
    return [];
  }
}
