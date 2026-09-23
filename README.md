# TCF Passer

A personal TCF Canada prep app: A0 → NCLC 7 in all four skills, for the Express Entry French-language category.
Mobile-first, works offline, and all data stays on your device.

**Build stage 2 of 6:** dashboard, daily tasks and logging, plan browser, resources, backup.
Still to come: 3. flashcards and grammar · 4. TCF practice and placement test · 5. writing and speaking · 6. mock exams and analytics.

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

- **Plan:** edit the phases, weekly topics or day templates in `scripts/generate-plan.mjs`, then run `npm run plan`. Your ticked tasks are kept, because task IDs are `date-template`.
- **Resources:** add an entry to `data/resources.json` with `id, name, url, skills, levels, paid, type, status, use`. To use it in the plan, put its `id` in a task's `resources` list.
- Flashcard decks and practice questions will also be plain JSON files in `data/` (stages 3–4).

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
