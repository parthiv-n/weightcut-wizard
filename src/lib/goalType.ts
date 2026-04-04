export type GoalType = 'cutting' | 'losing';

export const FIGHT_ONLY_PATHS = ['/fight-camps', '/fight-week', '/hydration'];

export function isFighter(goalType?: string): boolean {
  return goalType !== 'losing';
}
