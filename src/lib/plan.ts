import planJson from "../../data/plan.json";
import resourcesJson from "../../data/resources.json";

export type Skill = "vocabulary" | "speaking" | "listening" | "grammar" | "writing" | "reading" | "planning" | "exam";

export interface PlanTask {
  id: string;
  title: string;
  minutes: number;
  skill: Skill;
  resources: string[];
  detail: string;
  template: string;
}

export interface PlanEvent {
  date: string;
  type: "placement" | "progress-check" | "half-mock" | "full-mock" | "booking" | "admin" | "exam";
  title: string;
  minutes: number;
  critical?: boolean;
  replacesDay?: boolean;
}

export interface PlanDay {
  date: string;
  tasks: PlanTask[];
  events: PlanEvent[];
  plannedMinutes: number;
}

export interface PlanWeek {
  week: number;
  start: string;
  phase: string;
  level: string;
  focus: { grammar: string; vocab: string };
  plannedHours: number;
  days: PlanDay[];
}

export interface Phase {
  id: string;
  name: string;
  level: string;
  weeks: [number, number];
  goalHoursCumulative: number;
  exit: string;
}

export interface Plan {
  start: string;
  deadline: string;
  firstSittingWeek: number;
  weeklyHoursTarget: number;
  phases: Phase[];
  milestones: PlanEvent[];
  weeks: PlanWeek[];
}

export interface Resource {
  id: string;
  name: string;
  url: string;
  skills: string[];
  levels: string[];
  paid: boolean;
  type: string;
  status: string;
  use: string;
}

export const plan = planJson as unknown as Plan;
export const resources = (resourcesJson as unknown as { resources: Resource[] }).resources;
export const resourceById = new Map(resources.map((r) => [r.id, r]));

// Plan items that point at parts of this app rather than external sites.
export const appSections: Record<string, { label: string; route: string; ready: boolean }> = {
  "app-srs": { label: "Flashcards", route: "#/", ready: false },
  "app-grammar": { label: "Grammar drills", route: "#/", ready: false },
  "app-writing": { label: "Writing", route: "#/", ready: false },
  "app-speaking": { label: "Speaking", route: "#/", ready: false },
  "app-mistakes": { label: "Mistake bank", route: "#/", ready: false },
  "app-tcf": { label: "TCF practice", route: "#/", ready: false },
  "app-review": { label: "Weekly review", route: "#/log", ready: true },
  "app-plan": { label: "Plan", route: "#/plan", ready: true },
};

/** One checkable line on a day: a plan task or a plan event (placement, booking…). */
export interface Item {
  id: string;
  title: string;
  minutes: number;
  skill: Skill;
  resources: string[];
  detail: string;
  date: string; // the plan date it belongs to
  kind: "task" | "event";
  template?: string; // plan tasks: which daily slot this is (e.g. "srs", "write")
  eventType?: PlanEvent["type"];
  critical?: boolean;
}

const eventSkill = (t: PlanEvent["type"]): Skill => (t === "booking" || t === "admin" ? "planning" : "exam");

export const eventId = (e: PlanEvent) => `${e.date}-ev-${e.type}`;

export function dayItems(p: Plan, date: string): Item[] {
  const day = findDay(p, date);
  if (!day) return [];
  const events: Item[] = day.events.map((e) => ({
    id: eventId(e),
    title: e.title,
    minutes: e.minutes,
    skill: eventSkill(e.type),
    resources: [],
    detail: "",
    date,
    kind: "event",
    eventType: e.type,
    critical: e.critical,
  }));
  const tasks: Item[] = day.tasks.map((t) => ({ ...t, date, kind: "task" }));
  return [...events, ...tasks];
}

const dayIndex = new Map<string, { week: PlanWeek; day: PlanDay }>();
const indexFor = (p: Plan) => {
  if (p === plan && dayIndex.size) return dayIndex;
  const m = p === plan ? dayIndex : new Map<string, { week: PlanWeek; day: PlanDay }>();
  for (const week of p.weeks) for (const day of week.days) m.set(day.date, { week, day });
  return m;
};

export const findDay = (p: Plan, date: string) => indexFor(p).get(date)?.day;
export const findWeek = (p: Plan, date: string) => indexFor(p).get(date)?.week;
export const phaseOf = (p: Plan, week: PlanWeek) => p.phases.find((ph) => ph.id === week.phase)!;
export const planEnd = (p: Plan) => p.weeks.at(-1)!.days.at(-1)!.date;
export const examEvent = (p: Plan) => p.milestones.find((m) => m.type === "exam");
