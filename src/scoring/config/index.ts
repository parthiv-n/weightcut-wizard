import { ScoringConfigV1 } from "./v1";

export const CURRENT_CONFIG = ScoringConfigV1;
export const CONFIG_REGISTRY = {
  "1.0.0": ScoringConfigV1,
} as const;
