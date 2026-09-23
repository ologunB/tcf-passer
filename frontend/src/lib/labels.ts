import type { Skill } from "./plan";

export const skillLabel: Record<Skill, string> = {
  listening: "Listening",
  reading: "Reading",
  writing: "Writing",
  speaking: "Speaking",
  vocabulary: "Vocab",
  grammar: "Grammar",
  exam: "TCF practice",
  planning: "Admin",
};

export const skillOptions = Object.keys(skillLabel) as Skill[];

export const eventLabel: Record<string, string> = {
  placement: "Placement test",
  "progress-check": "Progress check",
  "half-mock": "Half mock",
  "full-mock": "Full mock",
  booking: "Booking",
  admin: "Admin",
  exam: "Exam",
};

/** IRCC TCF Canada → NCLC table. Listening/reading 0–699, writing/speaking 0–20. */
export const NCLC_TABLE = {
  listening: [[549, 10], [523, 9], [503, 8], [458, 7], [398, 6], [369, 5], [331, 4]],
  reading: [[549, 10], [524, 9], [499, 8], [453, 7], [406, 6], [375, 5], [342, 4]],
  writing: [[16, 10], [14, 9], [12, 8], [10, 7], [7, 6], [6, 5], [4, 4]],
  speaking: [[16, 10], [14, 9], [12, 8], [10, 7], [7, 6], [6, 5], [4, 4]],
} as const;

export const CORE_SKILLS = ["listening", "reading", "writing", "speaking"] as const;
export type CoreSkill = (typeof CORE_SKILLS)[number];
