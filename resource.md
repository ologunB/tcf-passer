# Build Me a Personal TCF Canada Prep App ("TCF Passer")

> v2, 23 Sep 2026. Rewritten with the Step 0 answers and the findings in `docs/research.md`. Original: `docs/resource.original.md`.

## Who I am
- Complete beginner in French (A0).
- Goal: **Canada PR through the Express Entry French-language category draws.**
- Exam: **TCF Canada**, sat at **Alliance Française de Lagos, Nigeria**.
- Hard deadline: **23 July 2027** (10 months from 23 Sep 2026).
- Study time: **about 4 hours a day, about 28 hours a week.**
- I only care about hitting the score. Anything that doesn't move my score is out of scope.
- This app is my one place to study, get tested and track progress, mainly **on my phone**.

## Step 0 answers (done)
| Question | Answer |
|---|---|
| Which TCF | TCF Canada |
| Passing score | **NCLC 7 in all four skills**: Listening ≥ 458, Reading ≥ 453, Writing ≥ 10/20, Speaking ≥ 10/20. **Train to NCLC 8** (503 / 499 / 12 / 12) for a safety margin. |
| Hours | 4+ h/day (plan assumes 28 h/week) |
| Test city | Lagos (backup: Ibadan, Abuja) |
| Start / hosting | Week 1 starts Mon 28 Sep 2026. Deployed online for free, installable on my phone, works offline. |

## Step 1: Research ✅
Done. See `docs/research.md`. Key facts that shape everything below:
- TCF Canada = Listening (39 Q, 35 min) · Reading (39 Q, 60 min) · Writing (3 tasks, 60 min) · Speaking (3 tasks, about 12 min). **No grammar section.**
- IRCC uses my **lowest** skill. No averaging.
- Target is **solid B2 in all four skills**. That's roughly 900–1,100 self-study hours, which **fits in about 8.5 months at 28 h/week**.
- **First attempt: week of 7 June 2027 (week 37).** Leaves exactly one retake (30-day gap plus about 3 weeks for results) before the deadline.
- **Email AF Lagos by 8 Feb 2027, book by 15 Mar 2027.** Lagos sessions sell out weeks ahead, and there are no refunds or postponements.
- Remarking/appeals are suspended by FEI (since 1 Sep 2026), so a retake is the only fallback.
- Re-check the format on the FEI site before booking, and note the date checked.

## Step 2: The study plan
Stored as data (`data/plan.json`), not hardcoded prose.

**Phases** (source of truth: `scripts/generate-plan.mjs`)
| # | Phase | Weeks | Dates | Cumulative hours |
|---|---|---|---|---|
| 1 | Foundations (A1) | 1–5 | 28 Sep – 1 Nov 2026 | ~140 |
| 2 | Survival (A2). TCF-format practice from week 9 | 6–12 | 2 Nov – 20 Dec 2026 | ~340 |
| 3 | Independent (B1) | 13–22 | 21 Dec 2026 – 28 Feb 2027 | ~620 |
| 4 | Exam-ready (B2 / NCLC 7) | 23–31 | 1 Mar – 2 May 2027 | ~870 |
| 5 | Exam simulation sprint, first sitting in week 37 | 32–37 | 3 May – 13 Jun 2027 | ~1,030 |
| – | Retake buffer (only if needed) | after 37 | mid-June – 23 Jul 2027 | – |

**Rules**
- Every week has concrete daily tasks tied to named resources from the research, e.g. "TV5Monde A1 lesson X, 20 new cards, 20 min Coffee Break ep. N, 1 writing Task 1".
- **TCF-format practice starts in week 9 (A2)**, not at the end.
- **A human speaking partner or tutor from about week 10** (2–3 × 30 min/week). Speaking can't be self-graded reliably.
- Progress check every 2 weeks. Full timed mocks in the final 6 weeks.
- **Deadlines as reminders:** 23 Nov 2026 (English test check), 8 Feb 2027 (email AF Lagos), 15 Mar 2027 (book attempt 1), 3 May 2027 (retake decision), exam day.
- **The plan adapts:** if hours or scores lag, rebalance the coming weeks toward the **weakest skill**. Say plainly whether the June date is at risk, and by how many hours or points.

## Step 3: Build the app
Single user (me). Proposed stack: **Vite + React + TypeScript as an installable PWA. Data in IndexedDB (via Dexie) on my phone. JSON export/import for backup. Deployed free to Cloudflare Pages or Netlify.**
Why: no server to maintain, works offline during power cuts or with no data, fast on a phone, and the voice recordings stay on the device.

**AI grading (optional):** a static site can't hide an API key in `.env`. Anyone could read it from the page. So either (a) I paste my key into Settings and it stays only on my device, or (b) a tiny serverless function holds it. Self-assessment rubric is always the fallback.

### Features
**Dashboard**
- Days to exam · estimated **NCLC per skill (L, R, W, S)** against the NCLC 7 and 8 lines · **headline = weakest skill** · today's tasks · streak · hours logged vs planned.
- "On track / Behind / Ahead" with the reason, e.g. "Behind: speaking is NCLC 5, 18 h short this month".

**Daily tasks & logging**
- Today's checklist from the plan. Tick off tasks, log minutes, add notes.
- Missed days roll over with a cap (at most about 30% extra per day). Low-value tasks get dropped first, never mock exams or the weakest skill.

**Vocabulary & grammar (support, not scored)**
- SRS flashcards (**FSRS**, or SM-2 as fallback) with French TTS audio. Starter decks by frequency and TCF theme (work, housing, immigration, health, environment, technology, education).
- Grammar drills with instant feedback: conjugation, gender/articles, prepositions, tenses, pronouns, and connectors for argument writing.

**Testing (the core)**
- **Placement test** now and a **progress check every 2 weeks**, per skill.
- **Listening:** 39 Q / 35 min format. **Audio plays once**, like the real exam. Questions get harder in order (A1 → C2). TTS for now, structured so real audio files can be added later.
- **Reading:** 39 Q / 60 min, same difficulty order.
- **Score estimate weights harder questions more** and maps to the 100–699 scale, then to NCLC through the IRCC table. Not percent × 699.
- Write **original** questions only. Link to the FEI official samples.
- **Writing:** the 3 real tasks with live word counts (60–120 / 120–150 / 120–180) and a 60-min timer for all three. Rubric: task done, coherence, vocabulary, grammar. Estimate out of 20, then NCLC.
- **Speaking:** record each task in the browser with real timers (2:00 · 2:00 prep + 3:30 · 4:30). Save recordings, self-score against the rubric, optional AI transcription and grading. **Task 2 = I ask the questions**, so the app gives a scenario and a list of prompts.
- **Topic bank** for writing and speaking themes, easy to extend from monthly "sujets" reports.
- **Full mock exam mode:** all 4 sections back to back, real timing, no pausing, NCLC estimate at the end.
- **Mistake bank:** every wrong answer comes back until I get it right twice.

**Progress tracking**
- Charts: NCLC per skill over time (with the 7 and 8 lines), hours per week vs plan, mock scores.
- Weekly review: what improved, what's weak, what changes next week.
- Readiness score and a plain answer to **"If I sat the exam today, would I get NCLC 7 in all four?"** Name the skill that fails.

**Resources page**
- Everything from `docs/research.md`, filterable by skill, level and free/paid, with links.

### Standards
- Persistent data plus JSON export/import. Remind me to export weekly.
- Calm, fast, mobile-first UI with dark mode. Works offline. Low data use.
- Seed content for **at least the first 4 weeks**. Adding questions and decks = drop in JSON files.
- `README.md`: setup, run, adding content, deploying.
- Test the main flows before saying it's done.

## Out of scope (but flagged)
- Express Entry eligibility itself (work experience, education assessment) and the **English test (CLB 5+) needed for the +50 CRS bonus**. Sort these separately, ideally with a licensed consultant (RCIC).

## How to work with me
- Build in stages. After each one, show me what works and let me try it:
  1. Research + plan → 2. Dashboard + daily tasks + logging → 3. SRS + grammar → 4. Practice tests + placement → 5. Writing/speaking → 6. Mock exam + analytics.
- Explain decisions briefly in plain English.
- Be honest about progress. If I'm behind, say so and tell me exactly what to change.
