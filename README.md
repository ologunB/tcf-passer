# TCF Passer

A personal TCF Canada prep app: A0 → NCLC 7 in all four skills, for the Express Entry French-language category.
Mobile-first, works offline, and all data stays on your device.

**All six build stages are done:**

1. Research and the 37-week plan.
2. Dashboard, daily tasks with rollover, study timer and logging.
3. Flashcards (FSRS spaced repetition with French audio, both directions), grammar and verb drills, dictation, a phrase bank, and the mistake bank.
4. TCF-style listening and reading practice, the placement test and a progress check every 2 weeks.
5. Writing tasks with word limits, and speaking recordings with the real timers. Both have a self-assessment rubric and optional AI grading.
6. The full mock exam, level-over-time analytics, a weekly review, and a plan that adapts to your weakest skill.

**Content included (all original, all in `frontend/data/`):**

- 2,819 flashcards across 31 weekly decks (A1 → B2).
- 466 grammar drills covering weeks 1–36, plus generated drills for 26 verbs.
- 296 TCF-style questions: 148 listening and 148 reading, A1 → C2, each with an explanation.
- 39 writing prompts and 46 speaking prompts, each with a B2 model answer.
- A phrase bank of 232 phrases in 17 groups.

## Run it

You need [Node.js](https://nodejs.org) 20 or newer.

```bash
cd frontend
npm install
npm run dev
```

- **On this computer:** open the `Local:` address it prints (http://localhost:5173).
- **On your phone:** connect to the same Wi-Fi and open the `Network:` address (like `http://192.168.x.x:5173`).

To try a future day without waiting, add `?today=2026-10-05` to the address.

## Test it

```bash
cd frontend
npm test                                   # unit tests: scoring, rollover, SRS, adaptive plan, AI parsing, backup
npm run build && npx vite preview --port 4173 &
node scripts/e2e.mjs                       # real browser on a phone-sized screen (37 checks)
GEMINI_KEY=… node scripts/e2e.mjs          # optional: also runs a real AI grading through the Writing screen
```

## Where things live

| What | Where |
|---|---|
| The app (Vite + React + TypeScript PWA) | `frontend/` |
| Study content (decks, drills, TCF items, prompts, plan, resources) | `frontend/data/` |
| Plan generator, e2e test, icon script | `frontend/scripts/` |
| Research (format, scores, booking, resources) | `docs/research.md` |
| The brief | `resource.md` |
| Your progress | In the browser (IndexedDB) on your device. Export it from **Settings → Export backup**. |

## Change the plan or add content

All content is plain JSON in `frontend/data/`. Add a file or entry, then rebuild; nothing else is needed.

| Content | File(s) | Shape |
|---|---|---|
| Flashcard decks | `frontend/data/decks/*.json` | `{ id, title, week, level, cards: [[fr, en, example?], …] }`. Decks unlock at their plan `week`. |
| Grammar drills | `frontend/data/grammar.json` | `{ id, week, topic, type: "choice" \| "type", q, options?, answer, accept?, explain }` |
| Verb drills | `frontend/src/lib/conjugation.ts` (`VERBS`) | Add a verb with its present forms, participle and auxiliary |
| Listening / reading | `frontend/data/tcf/*.json` (any file with "listening" in the name counts as listening) | `{ id, level: A1–C2, audio (script, "A:"/"B:" lines = two voices) or text, q, options[4], answer, explain? }`. Add `audioUrl` to use a real recording. |
| Writing / speaking prompts | `frontend/data/prompts/writing.json`, `frontend/data/prompts/speaking.json` | See existing entries |
| The plan | `frontend/scripts/generate-plan.mjs`, then `npm run plan` | Ticked tasks are kept: task IDs are `date-template`. |
| Resources | `frontend/data/resources.json` | `id, name, url, skills, levels, paid, type, status, use`. Reference an `id` from a plan task's `resources`. |

All exam items are original, not copied from official tests. For official-style extra practice, use the free TV5Monde TCF simulator (linked in the app).

## AI grading (optional)

In **Settings → AI grading**, pick a provider and paste a key. The key is stored only in this browser: never in backups, never in the repo.

- **Gemini (free):** get a key at https://aistudio.google.com/apikey.
  - Uses `gemini-3.8-flash`, falling back to `gemini-3.5-flash-lite` if it's unavailable or the daily limit is reached.
  - On the free tier, Google may use what you send to improve its products, and human reviewers may read it. Don't put personal details in practice answers.
- **Claude (paid, strictest):** Claude Opus 5 with server-side fallbacks. It costs a few cents per grade on your own Anthropic account.

Both grade against the TCF 0–20 grid. Speaking is graded from the transcript, so pronunciation isn't judged. Without a key, you score yourself with the rubric.

## How scores are estimated

- **Listening and reading:** questions are ordered A1 → C2. Each level adds up to 100 points in proportion to accuracy above chance (25%), so harder questions count more. That gives 100–699, which maps to NCLC through IRCC's table. A short set only proves the levels it asked, so the official-style estimates come from progress checks and mocks.
- **Writing and speaking:** each rubric criterion is rated A1–C2 and averaged onto the TCF 0–20 scale (A1 ≈ 2, A2 ≈ 5, B1 ≈ 8, B2 ≈ 11.5, C1 ≈ 14.5, C2 ≈ 18). If you use AI grading, its score is used instead.
- **"Would I pass today?"** means your latest estimate is NCLC 7 or above in all four skills. The app aims for 8 as a margin.

## Rules the app follows

- **Rollover:** unfinished tasks carry over for one day only, capped at 60 minutes. Writing, speaking and exam tasks go first. Missed writing, speaking and exam tasks beyond that are folded into the next task of the same skill. Everything else is dropped, so the backlog can't pile up.
- **Stays until done:** the placement test, booking reminders and admin reminders.
- **Status:** based on hours logged over the last 14 days versus the plan.
  - Under 80% is **Behind**, and the app tells you how many extra minutes a day catch you up.
  - Under 65% over 4 weeks puts the **exam date at risk**.
  - 110% or more is **Ahead**.
  - Skill levels join this in stage 4.

## Deploy (free) so it works away from home Wi-Fi

It's a static site, so any free static host works.

- **Vercel (current setup):** every push to `main` deploys automatically. `vercel.json` builds from `frontend/`.
- **Netlify:** `cd frontend && npm run build`, then drag `frontend/dist/` onto https://app.netlify.com/drop.

Open the URL on your phone and add it to your home screen: Safari → Share → **Add to Home Screen**, or Chrome → ⋮ → **Install app**. After the first load it works with no connection.

⚠️ Your data is stored per browser. Moving to a new phone or browser means **Export** on the old one and **Import** on the new one.

## Credits

Fonts: [Inter](https://rsms.me/inter/) and [Fraunces](https://fonts.google.com/specimen/Fraunces), both under the SIL Open Font License.
