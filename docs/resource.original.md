# Build Me a Personal TCF Prep App ("TCF Passer")

## Who I am
- Complete beginner in French (starting from absolute zero, level A0).
- Goal: pass the **TCF** as fast as realistically possible, with **10 months as the hard deadline**.
- I only care about reaching the score I need. Anything that doesn't move my score is out of scope.
- I'll use this app daily as my single place to study, get tested, and track progress.

## Step 0: Ask me these before writing any code
Ask me all of these at once, then wait for my answers:
1. **Which TCF?** (TCF Canada, TCF Tout Public, TCF IRN, TCF ANF/naturalisation, TCF Québec). The formats and required levels differ.
2. **What score/level counts as "passing" for me?** (e.g. CEFR B1, B2, or a specific NCLC/CLB per skill for Canada). If I don't know, explain the options for my purpose and help me pick.
3. **How many hours per day** can I realistically study on weekdays and weekends?
4. **Test city/country**, so you can tell me where to book and how far ahead.
5. **Preferred start date**, and whether I want the app run locally or deployed online.

## Step 1: Research (before building)
Research and write your findings to `/docs/research.md`, with sources:
- **Current official exam format** for my TCF version: sections, number of questions, timings, task types for writing and speaking, and how scores map to CEFR/NCLC levels. Use the official France Education International site (france-education-international.fr) as the source of truth, since formats get updated. Note the date you checked.
- **Realistic timeline**: typical guided hours needed to go from A0 to my target level (e.g. Alliance Française / CEFR estimates). Given my daily hours, calculate whether 10 months is enough, and the **shortest safe timeline**. Be honest if my target needs more hours per day than I gave you.
- **Best resources, free first**, sorted by level and skill. For each: what it's for, which phase to use it in, and the link. Consider things like TV5Monde Apprendre le français, RFI Français Facile / Journal en français facile, official TCF sample tests, Kwiziq, Anki decks, podcasts (e.g. InnerFrench, Coffee Break French), YouTube channels, grammar references, and reputable TCF prep books/sites. Verify each link works and is still active. Flag anything paid.
- **Test booking**: where I can sit the exam near me, how often sessions run, typical lead time, and fees.

## Step 2: The study plan
Create a phased plan from A0 to my target, stored as data (JSON/DB), not hardcoded prose:
- Phases like: Foundations (A1) → Survival (A2) → Independent (B1) → Exam-ready (B2, if needed) → Exam simulation sprint.
- Each week has concrete daily tasks: "Do X lesson, 20 new Anki cards, 15 min listening from Y, 1 writing task", tied to resources from research.
- Exam-specific practice starts early (from A2), not just at the end.
- Final 6–8 weeks: full timed mock exams under real conditions, weak-skill drilling.
- Includes the date I should **book the exam** and a reminder.
- The plan **adapts**: if I fall behind or my test scores lag, it rebalances the upcoming weeks and tells me if the exam date is at risk.

## Step 3: Build the app
A web app for one user (me). Keep the stack simple and reliable (e.g. Vite + React + TypeScript, with SQLite or a local JSON store; propose something better if you have a reason). Must work well on my phone.

### Features
**Dashboard**
- Days to exam, current estimated level per skill (listening, reading, writing, speaking, plus grammar/structures if my TCF has it), today's tasks, study streak, hours logged vs planned.
- A clear "On track / Behind / Ahead" status with the reason.

**Daily tasks & logging**
- Today's checklist from the plan; tick off tasks, log minutes, add notes.
- Missed days roll over sensibly without piling up into an impossible backlog.

**Vocabulary & grammar (spaced repetition)**
- Built-in SRS flashcards (SM-2 or FSRS), with audio pronunciation (browser text-to-speech for French is fine).
- Starter decks by level and topic, prioritised by frequency and TCF usefulness.
- Grammar drills (conjugation, articles/gender, prepositions, tenses) with instant feedback.

**Testing (the core)**
- **Placement test** at the start and a **progress check every 2 weeks**, per skill.
- **TCF-style practice questions** for each section of my version, matching the real format, difficulty progression (A1→C2), and timing. Write **original** questions; don't copy copyrighted official test items. Link to official samples instead.
- **Listening:** use browser TTS or embedded links to free audio for now; structure it so I can add real audio later.
- **Writing:** timed tasks matching the real ones (word counts included). Feedback with a rubric (task completion, coherence, vocabulary, grammar) and an estimated level. If you add AI grading, use an API key from a `.env` file I supply, and have a self-assessment rubric as fallback.
- **Speaking:** record myself in the browser for each real task type with timers, save recordings, self-score against a rubric, and optionally transcribe and grade with AI.
- **Full mock exam mode:** all sections back to back, real timing, no pausing, with an estimated score/level at the end.
- **Mistake bank:** every wrong answer is saved and resurfaced until I get it right.

**Progress tracking**
- Charts of estimated level per skill over time, hours studied per week, mock exam scores.
- Weekly review page: what improved, what's weak, what the plan changes next week.
- A readiness score and a plain answer to "If I sat the exam today, would I pass?"

**Resources page**
- All researched resources, filterable by skill, level, and free/paid, with links.

### Standards
- Data is saved persistently; include export/import (JSON) so I never lose progress.
- Clean, calm, fast UI. Mobile-first. Dark mode.
- Seed the app with enough content for at least the first 4 weeks, and a simple way (JSON files) to add more questions and decks.
- Write a `README.md` with setup, how to run, how to add content, and how to deploy.
- Test the main flows before telling me it's done.

## How to work with me
- Build in stages. After each stage, show me what's working and let me try it before moving on:
  1. Research + plan → 2. Dashboard + daily tasks + logging → 3. SRS + grammar → 4. Practice tests + placement → 5. Writing/speaking → 6. Mock exam + analytics.
- Explain decisions briefly in plain English. I'm here to pass an exam, not to become a developer.
- Be honest about my progress. If I'm behind, say so and tell me exactly what to change.
