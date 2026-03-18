export type TechniqueLevel = 'seen' | 'drilled' | 'landed' | 'mastered';

export interface Technique {
  id: string;
  name: string;
  name_normalized: string;
  sport: string;
  position: string | null;
  category: string | null;
  created_at: string;
}

export interface TechniqueEdge {
  id: string;
  from_technique_id: string;
  to_technique_id: string;
  relation_type: string;
  created_at: string;
}

export interface UserTechniqueProgress {
  id: string;
  user_id: string;
  technique_id: string;
  level: TechniqueLevel;
  times_logged: number;
  first_logged_at: string;
  last_logged_at: string;
}

export interface TrainingTechniqueLog {
  id: string;
  user_id: string;
  technique_id: string;
  session_id: string | null;
  notes: string | null;
  date: string;
  created_at: string;
}

export interface TechniqueChainResponse {
  chains: string[][];
  technique_metadata: {
    position: string | null;
    category: string | null;
  };
}

export interface GraphNode {
  id: string;
  label: string;
  x: number;
  y: number;
  level: TechniqueLevel;
  timesLogged: number;
  sport: string;
  category?: string;
}

export interface GraphEdge {
  source: string;
  target: string;
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
}
