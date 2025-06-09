export interface Moment {
  at: number;
  lat: number;
  lon: number;
}

export interface BoatData {
  id: number;
  moments: Moment[];
}

export interface CourseNode {
  lat: number;
  lon: number;
  name?: string;
}

export interface RaceSetup {
  course?: { nodes: CourseNode[] };
  tags?: { id: number; name: string }[];
  teams: { id: number; name: string; tags?: number[] }[];
}

export interface LeaderboardEntry {
  id: number;
  rank: number | undefined;
  status: string;
  corrected: string;
}

export interface SectorStat {
  timeTaken: number;
  distance: number;
  avgSpeed: number;
}
