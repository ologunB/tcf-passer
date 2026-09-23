# TCF Passer

A personal TCF Canada prep app: A0 → NCLC 7 in all four skills, for the Express Entry French-language category.
Mobile-first, works offline, and all data stays on your device.

**All six build stages are done:**

1. Research and the 37-week plan.
2. Dashboard, daily tasks with rollover, study timer and logging.
3. Flashcards (FSRS spaced repetition with French audio), grammar and verb drills, and the mistake bank.
4. TCF-style listening and reading practice, the placement test and a progress check every 2 weeks.
5. Writing tasks with word limits, and speaking recordings with the real timers. Both have a self-assessment rubric and optional AI grading.
6. The full mock exam, level-over-time analytics, a weekly review, and a plan that adapts to your weakest skill.

## Run it

You need [Node.js](https://nodejs.org) 20 or newer.

```bash
npm install
npm run dev
```

- **On this computer:** open the `Local:` address it prints (http://localhost:5173).
- **On your phone:** connect to the same Wi-Fi and open the `Network:` address (like `http://192.168.x.x:5173`).

To try a future day without waiting, add `?today=2026-10-05` to the address.

## Test it

```bash
npm test                                   # logic: rollover, status, streak, backup
npm run build && npx vite preview --port 4173 &
node scripts/e2e.mjs                       # real browser on a phone-sized screen
```

## Where things live

| What | Where |
|---|---|
| Research (format, scores, booking, resources) | `docs/research.md` |
| The study plan (generated) | `data/plan.json`, from `scripts/generate-plan.mjs` |
| Resources list | `data/resources.json` |
| Your progress | In the browser (IndexedDB) on your device. Export it from **Settings → Export backup**. |

## Change the plan or add content

All content is plain JSON in `data/`. Add a file or entry, then rebuild; nothing else is needed.

| Content | File(s) | Shape |
|---|---|---|
| Flashcard decks | `data/decks/*.json` | `{ id, title, week, level, cards: [[fr, en, example?], …] }`. Decks unlock at their plan `week`. |
| Grammar drills | `data/grammar.json` | `{ id, week, topic, type: "choice" \| "type", q, options?, answer, accept?, explain }` |
| Verb drills | `src/lib/conjugation.ts` (`VERBS`) | Add a verb with its present forms, participle and auxiliary |
| Listening / reading | `data/tcf/*.json` (any file with "listening" in the name counts as listening) | `{ id, level: A1–C2, audio (script, "A:"/"B:" lines = two voices) or text, q, options[4], answer, explain? }`. Add `audioUrl` to use a real recording. |
| Writing / speaking prompts | `data/prompts/writing.json`, `data/prompts/speaking.json` | See existing entries |
| The plan | `scripts/generate-plan.mjs`, then `npm run plan` | Ticked tasks are kept: task IDs are `date-template`. |
| Resources | `data/resources.json` | `id, name, url, skills, levels, paid, type, status, use`. Reference an `id` from a plan task's `resources`. |

All exam items are original, not copied from official tests. For official-style extra practice, use the free TV5Monde TCF simulator (linked in the app).

## AI grading (optional)

Settings → AI grading → paste an Anthropic API key. It's stored only in this browser: never in backups, never in the repo, and only sent to Anthropic. Writing and speaking are graded by Claude Opus 5 against the TCF 0–20 grid, with server-side fallbacks enabled. Speaking is graded from the transcript, so it can't judge pronunciation. Without a key, you score yourself with the rubric.

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

- **Netlify:** `npm run build`, then drag the `dist/` folder onto https://app.netlify.com/drop.
- **Cloudflare Pages:** `npx wrangler pages deploy dist`

Open the URL on your phone and add it to your home screen: Safari → Share → **Add to Home Screen**, or Chrome → ⋮ → **Install app**. After the first load it works with no connection.

⚠️ Your data is stored per browser. Moving to a new phone or browser means **Export** on the old one and **Import** on the new one.

## Credits

Fonts: [Inter](https://rsms.me/inter/) and [Fraunces](https://fonts.google.com/specimen/Fraunces), both under the SIL Open Font License.
