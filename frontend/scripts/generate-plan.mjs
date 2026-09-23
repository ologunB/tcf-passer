// Generates data/plan.json: the A0 → NCLC 7 (B2) study plan for TCF Canada.
// Run: node scripts/generate-plan.mjs
// Edit the phases, topics or day templates below, then re-run. The app reads plan.json.

import { writeFileSync } from "node:fs";

const START = "2026-09-28"; // Monday of week 1
const DEADLINE = "2027-07-23";
const EXAM_WEEK = 37; // first sitting: week of 7 June 2027

const phases = [
  { id: "foundations", name: "Foundations", level: "A1", weeks: [1, 5], goalHoursCumulative: 140,
    exit: "Can introduce yourself, ask simple questions, understand slow clear speech on familiar topics. Placement/progress checks at A1 in all skills." },
  { id: "survival", name: "Survival", level: "A2", weeks: [6, 12], goalHoursCumulative: 340,
    exit: "Can talk about past events and daily life, write a 60–120 word message (TCF writing task 1). TCF-format practice starts in week 9." },
  { id: "independent", name: "Independent", level: "B1", weeks: [13, 22], goalHoursCumulative: 620,
    exit: "Can follow RFI Journal en français facile, handle speaking task 2 role-plays, write 120–150 words (task 2). Mock scores ≈ NCLC 5–6." },
  { id: "exam-ready", name: "Exam-ready", level: "B2", weeks: [23, 31], goalHoursCumulative: 870,
    exit: "Can argue a point of view for 4½ minutes and in 120–180 words (task 3). Mock scores ≥ NCLC 7 in all four skills." },
  { id: "sprint", name: "Exam simulation sprint", level: "B2+", weeks: [32, 37], goalHoursCumulative: 1030,
    exit: "Two full timed mocks a week; every skill ≥ NCLC 8 in practice (safety margin over the NCLC 7 requirement)." },
];

// One entry per week: grammar focus + vocabulary theme.
const topics = [
  ["Sounds of French, être, subject pronouns, numbers 0–20", "Greetings, introductions, countries"],
  ["Articles & gender (le/la/un/une), avoir, plural", "Family, age, jobs"],
  ["Regular -er verbs present, negation ne…pas", "Daily routine, days, time"],
  ["Questions (est-ce que, inversion, question words), aller/faire", "Home, city, transport"],
  ["Adjective agreement & position, possessives", "Food, shopping, prices, numbers to 1000"],
  ["-ir/-re verbs, pouvoir/vouloir/devoir, futur proche", "Weather, leisure, invitations"],
  ["Passé composé with avoir", "Weekend, holidays, past events"],
  ["Passé composé with être, agreement", "Travel, moving, life events"],
  ["Reflexive verbs, imperative", "Health, body, doctor"],
  ["Direct object pronouns (le/la/les), partitive articles", "Work, office, email"],
  ["Imparfait (formation, descriptions)", "Childhood, memories, Nigeria vs Canada"],
  ["Comparatives & superlatives, futur simple", "Housing, renting, services"],
  ["Imparfait vs passé composé", "Stories, news events"],
  ["Indirect object pronouns (lui/leur), y and en", "Administration, appointments"],
  ["Relative pronouns qui/que/où", "Education, studies, training"],
  ["Conditional present, polite requests", "Customer service, complaints (task 2 role-plays)"],
  ["Hypothesis: si + present / si + imparfait", "Environment, cities"],
  ["Subjunctive intro (il faut que, vouloir que)", "Technology, internet, social media"],
  ["Plus-que-parfait, time markers", "Immigration, integration, Canada"],
  ["Connectors: cause, consequence (parce que, donc, c'est pourquoi)", "Work-life balance, employment"],
  ["Expressing opinion (je pense que, à mon avis), agreeing/disagreeing", "Media, news, advertising"],
  ["Relative pronoun dont, ce qui/ce que", "Health, sport, lifestyle"],
  ["Subjunctive after emotions/doubt, opinion + subjunctive", "Education debates"],
  ["Concession/opposition: bien que, pourtant, alors que, cependant", "Consumerism, economy"],
  ["Passive voice, impersonal structures", "Environment & climate policy"],
  ["Gerund (en + -ant), present participle", "Transport, urbanisation"],
  ["Reported speech, tense agreement", "Science, innovation, AI"],
  ["Conditional past, si + plus-que-parfait", "Tourism, culture, heritage"],
  ["Nominalisation, formal register", "Family & society changes"],
  ["Argument structure: thèse / antithèse / synthèse", "Work, remote work, careers"],
  ["Nuance & hedging vocabulary, pronoun order review", "Mixed TCF task-3 themes"],
  ["Error review: top 20 personal mistakes", "TCF recent topics (tcfca / reussir lists)"],
  ["Error review: agreements & tenses", "TCF recent topics"],
  ["Error review: connectors & register", "TCF recent topics"],
  ["Error review: weakest-skill focus", "TCF recent topics"],
  ["Light review only", "TCF recent topics"],
  ["Taper: sleep, light review, logistics", "—"],
];

// Task templates. minutes are targets; skill drives per-skill hour tracking.
const T = (id, title, minutes, skill, resources, detail = "") => ({ id, title, minutes, skill, resources, detail });

const weekday = {
  foundations: [
    T("srs", "Flashcards: reviews + 20 new cards", 30, "vocabulary", ["app-srs"]),
    T("core", "Language Transfer: next 3–4 tracks (speak out loud)", 45, "speaking", ["lt"]),
    T("course", "TV5Monde A1 lesson + exercises", 40, "listening", ["tv5"]),
    T("grammar", "Grammar of the week: learn + app drill", 40, "grammar", ["kwiziq", "lawless", "app-grammar"]),
    T("listen", "Coffee Break French episode (listen twice)", 30, "listening", ["cbf"]),
    T("pron", "Pronunciation & shadowing (10 sentences)", 20, "speaking", ["forvo"]),
    T("write", "Write 8–10 sentences on the week's theme", 20, "writing", ["app-writing"]),
    T("speak", "Record 1-min talk on the week's theme", 15, "speaking", ["app-speaking"]),
  ],
  survival: [
    T("srs", "Flashcards: reviews + 20 new cards", 30, "vocabulary", ["app-srs"]),
    T("course", "TV5Monde A2 lesson + exercises", 45, "listening", ["tv5"]),
    T("grammar", "Grammar of the week: learn + app drill", 40, "grammar", ["kwiziq", "fap", "app-grammar"]),
    T("listen", "Podcast Français Facile / Easy French (transcript after 1st listen)", 30, "listening", ["pff", "easyfr"]),
    T("read", "Graded reading + comprehension questions", 25, "reading", ["bdf", "pff"]),
    T("tcf", "TCF practice: 10 listening or reading items (A1–A2) — from week 9", 25, "exam", ["app-tcf", "tv5-tcf"]),
    T("write", "Writing: TCF task 1 style message (60–120 words)", 25, "writing", ["app-writing"]),
    T("speak", "Speaking: task 1 self-presentation drill (2:00 timer)", 20, "speaking", ["app-speaking"]),
  ],
  independent: [
    T("srs", "Flashcards: reviews + 15 new cards", 30, "vocabulary", ["app-srs"]),
    T("news", "RFI Journal en français facile (listen, then read transcript)", 30, "listening", ["rfi-jff"]),
    T("course", "TV5Monde B1 lesson", 35, "listening", ["tv5"]),
    T("grammar", "Grammar of the week: learn + app drill", 35, "grammar", ["kwiziq", "fap", "app-grammar"]),
    T("read", "Reading: 1jour1actu article + summarise in 3 sentences", 25, "reading", ["1j1a"]),
    T("tcf", "TCF practice: 15 listening + 15 reading items (A2–B1)", 40, "exam", ["app-tcf", "tv5-tcf", "tcfca"]),
    T("write", "Writing: TCF task 2 (120–150 words, 20-min timer)", 25, "writing", ["app-writing", "tcfenligne"]),
    T("speak", "Speaking: task 2 role-play (2:00 prep + 3:30) or tutor/exchange session", 20, "speaking", ["app-speaking", "italki", "tandem"]),
  ],
  "exam-ready": [
    T("srs", "Flashcards: reviews + 15 new cards (opinion & abstract vocab)", 25, "vocabulary", ["app-srs"]),
    T("listen", "InnerFrench / France Culture segment (B2 listening)", 30, "listening", ["innerfrench", "franceculture"]),
    T("grammar", "Grammar of the week + mistake-bank review", 30, "grammar", ["app-grammar", "app-mistakes"]),
    T("read", "Reading: opinion article, note the arguments", 25, "reading", ["1j1a", "rfi-ff"]),
    T("tcf", "TCF practice: timed set, 20 listening + 20 reading (B1–C1)", 55, "exam", ["app-tcf", "tv5-tcf", "tcfca"]),
    T("write", "Writing: TCF task 3 (120–180 words, 25-min timer)", 35, "writing", ["app-writing", "tcfca"]),
    T("speak", "Speaking: task 3 point of view (4:30) ×2 or tutor session", 40, "speaking", ["app-speaking", "italki"]),
  ],
  sprint: [
    T("srs", "Flashcards: reviews only (+5 new from mistakes)", 20, "vocabulary", ["app-srs"]),
    T("weak", "Weak-skill drill (app picks lowest NCLC skill)", 60, "exam", ["app-tcf", "app-mistakes"]),
    T("tcf", "Timed half-section: listening or reading", 40, "exam", ["app-tcf", "reussir"]),
    T("write", "Writing: one full task under timer (rotate 1→2→3)", 35, "writing", ["app-writing"]),
    T("speak", "Speaking: full 3-task set with timers, or tutor mock", 40, "speaking", ["app-speaking", "italki"]),
    T("listen", "RFI news, no transcript first", 25, "listening", ["rfi-jff"]),
    T("mistakes", "Mistake bank: clear today's due items", 20, "grammar", ["app-mistakes"]),
  ],
};

const saturday = (phase) => [
  T("srs", "Flashcards: reviews + new cards", 30, "vocabulary", ["app-srs"]),
  phase === "foundations"
    ? T("immersion", "Easy French / Coffee Break French binge (with subtitles)", 60, "listening", ["easyfr", "cbf"])
    : T("immersion", "Long listening: 2–3 episodes/videos at your level", 60, "listening", ["innerfrench", "easyfr", "rfi-jff"]),
  T("tutor", phase === "foundations" ? "Speaking: repeat all Language Transfer tracks of the week aloud" : "Speaking: tutor or language-exchange session", 60, "speaking", phase === "foundations" ? ["lt"] : ["italki", "tandem", "hellotalk"]),
  T("write", "Writing: longer piece on the week's theme; self-correct, then LanguageTool", 45, "writing", ["app-writing", "languagetool"]),
  T("grammar", "Grammar catch-up: redo week's drills", 45, "grammar", ["app-grammar"]),
];

const sunday = () => [
  T("srs", "Flashcards: reviews only", 25, "vocabulary", ["app-srs"]),
  T("review", "Weekly review: mistakes bank + what worked", 30, "grammar", ["app-mistakes", "app-review"]),
  T("listen", "Relaxed listening (a film/series episode in French)", 60, "listening", ["arte", "easyfr"]),
  T("read", "Reading for pleasure at your level", 45, "reading", ["1j1a", "pff"]),
  T("prep", "Plan next week: read upcoming grammar topic", 20, "planning", ["app-plan"]),
];

// Special events (added on top of / replacing the normal day).
const events = [];
const addWeeks = (iso, n, extraDays = 0) => {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n * 7 + extraDays);
  return d.toISOString().slice(0, 10);
};

events.push({ date: addWeeks(START, 0), type: "placement", title: "Placement test (all 4 skills)", minutes: 60 });
for (let w = 2; w <= 36; w += 2)
  events.push({ date: addWeeks(START, w - 1, 6), type: "progress-check", title: `Progress check #${w / 2} (per-skill NCLC estimate)`, minutes: 75 });
for (let w = 14; w <= 30; w += 2)
  events.push({ date: addWeeks(START, w - 1, 5), type: "half-mock", title: "Half mock: listening + reading, real timing", minutes: 95, replacesDay: false });
for (let w = 24; w <= 31; w += 2)
  events.push({ date: addWeeks(START, w - 1, 5), type: "full-mock", title: "Full mock exam (all 4 sections, no pausing)", minutes: 170 });
for (let w = 32; w <= 36; w++) {
  events.push({ date: addWeeks(START, w - 1, 2), type: "full-mock", title: "Full mock exam (Wednesday)", minutes: 170, replacesDay: true });
  events.push({ date: addWeeks(START, w - 1, 5), type: "full-mock", title: "Full mock exam (Saturday, exam-time start)", minutes: 170, replacesDay: true });
}
events.push({ date: addWeeks(START, 19), type: "booking", title: "Email AF Lagos for Apr–Jul 2027 TCF Canada sessions + fee (certification.lagos@afnigeria.org)", minutes: 10 });
events.push({ date: addWeeks(START, 24), type: "booking", title: "BOOK first TCF Canada sitting (~7–11 June 2027) if week-24 check is on track", minutes: 20, critical: true });
events.push({ date: addWeeks(START, 31), type: "booking", title: "Decide on retake slot (~12–23 July) based on mocks", minutes: 15 });
events.push({ date: addWeeks(START, EXAM_WEEK - 1), type: "exam", title: "TCF Canada — first sitting (exact date per AF Lagos session)", minutes: 180, critical: true });

const phaseOf = (w) => phases.find((p) => w >= p.weeks[0] && w <= p.weeks[1]);
const sum = (tasks) => tasks.reduce((a, t) => a + t.minutes, 0);

const weeks = [];
for (let w = 1; w <= EXAM_WEEK; w++) {
  const phase = phaseOf(w);
  const [grammar, vocab] = topics[w - 1];
  const days = [];
  for (let d = 0; d < 7; d++) {
    const date = addWeeks(START, w - 1, d);
    let tasks = d < 5 ? weekday[phase.id] : d === 5 ? saturday(phase.id) : sunday();
    if (phase.id === "survival" && w < 9) tasks = tasks.filter((t) => t.id !== "tcf").concat(T("extra-listen", "Extra listening (TCF practice starts week 9)", 25, "listening", ["easyfr"]));
    if (w === EXAM_WEEK) tasks = [T("light", "Light review: flashcards + one short listening", 45, "listening", ["app-srs", "rfi-jff"])];
    const dayEvents = events.filter((e) => e.date === date);
    if (dayEvents.some((e) => e.replacesDay)) tasks = tasks.filter((t) => t.id === "srs");
    days.push({
      date,
      tasks: tasks.map((t) => ({ ...t, id: `${date}-${t.id}`, template: t.id })),
      events: dayEvents,
      plannedMinutes: sum(tasks) + dayEvents.reduce((a, e) => a + e.minutes, 0),
    });
  }
  weeks.push({
    week: w,
    start: addWeeks(START, w - 1),
    phase: phase.id,
    level: phase.level,
    focus: { grammar, vocab },
    plannedHours: Math.round(days.reduce((a, d) => a + d.plannedMinutes, 0) / 6) / 10,
    days,
  });
}

const plan = {
  version: 1,
  generatedFrom: "scripts/generate-plan.mjs",
  exam: "TCF Canada",
  target: { nclcMin: 7, nclcPracticeTarget: 8, rule: "NCLC 7+ in ALL four skills (weakest skill decides)" },
  start: START,
  deadline: DEADLINE,
  firstSittingWeek: EXAM_WEEK,
  weeklyHoursTarget: 28,
  phases,
  adaptation: {
    description: "Rules the app applies every Sunday and after each progress check.",
    rules: [
      { id: "rollover", rule: "Missed tasks roll over max 1 day; after that they're dropped, except writing/speaking/exam tasks, which merge into the next same-skill slot. Backlog never exceeds 60 min/day." },
      { id: "hours-behind", rule: "If logged hours over the last 14 days < 80% of planned: status Behind. Tell the user how many hours/day for the next 2 weeks recovers it. If < 65% for 4 weeks: exam date AT RISK, recommend pushing the sitting to the July slot." },
      { id: "skill-lag", rule: "At each progress check, any skill > 1 NCLC below the phase target gets +30 min/day moved from the strongest skill for the next 2 weeks." },
      { id: "phase-gate", rule: "Don't advance phase until the exit criteria are met in all skills; if a gate slips > 2 weeks, compress the sprint (min 4 weeks) and flag the risk." },
      { id: "ahead", rule: "If all skills are ≥ 1 NCLC above target for 2 checks in a row: status Ahead; offer to bring the exam forward one session." },
      { id: "readiness", rule: "Pass-today = min(skill NCLC estimate) ≥ 7 over the last 2 mocks. Safe = ≥ 8." }
    ],
  },
  milestones: events.filter((e) => ["booking", "exam", "admin"].includes(e.type)),
  weeks,
};

writeFileSync(new URL("../data/plan.json", import.meta.url), JSON.stringify(plan, null, 2));
const total = weeks.reduce((a, w) => a + w.plannedHours, 0);
console.log(`plan.json: ${weeks.length} weeks, ${Math.round(total)} planned hours, first sitting week ${EXAM_WEEK} (${weeks[EXAM_WEEK - 1].start})`);
for (const p of phases) {
  const h = weeks.filter((w) => w.week <= p.weeks[1]).reduce((a, w) => a + w.plannedHours, 0);
  console.log(`  ${p.name.padEnd(24)} weeks ${p.weeks.join("–").padEnd(6)} cumulative ${Math.round(h)} h (goal ${p.goalHoursCumulative})`);
}
