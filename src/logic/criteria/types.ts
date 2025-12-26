export type DoCode = string; // e.g. "STEM2", "CCL3", "CD1"

export interface Criterion {
  /** Deterministic ID like "CN.5.1.1" */
  id: string;
  course: 5 | 6;
  area: string;
  text: string;
  descriptorCodes: DoCode[];
}

export interface ParsedCriteriaCsv {
  criteria: Criterion[];
  errors: string[];
}
