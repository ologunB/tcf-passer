// End-to-end check of the main flows on a phone-sized screen.
// Run: npm run build && npx vite preview --port 4173 & node scripts/e2e.mjs [screenshotDir]
import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:4173";
const OUT = process.argv[2] ?? "/tmp";
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, acceptDownloads: true });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
// Gemini 429/503s are handled by the app's model fallback, so the browser's network log for them isn't an error.
page.on("console", (m) => m.type() === "error" && !m.location().url.includes("generativelanguage.googleapis.com") && errors.push(m.text()));
const ok = (cond, msg) => { if (!cond) throw new Error("FAIL: " + msg + (errors.length ? "\nPage errors: " + errors.join(" | ") : "")); console.log("✓", msg); };
process.on("unhandledRejection", (e) => { console.error(String(e).slice(0, 400), "\nPage errors:", errors.join(" | ")); process.exit(1); });
const shot = async (n, full = true) => { await page.waitForTimeout(500); return page.screenshot({ path: `${OUT}/${n}.png`, fullPage: full }); };
const noHScroll = async (where) => ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `no sideways scroll on ${where}`);
const sheet = () => page.locator(".sheet");
// Wait until the question counter shows question n (1-based), so clicks never hit the previous question.
const atQuestion = (n) => page.locator(".mcq-top").filter({ hasText: new RegExp(`Question ${n} /`) }).waitFor();

// 1. Before week 1
await page.goto(`${BASE}/?today=2026-09-23#/`);
await page.getByText("Before you start").waitFor();
ok(await page.getByText("Not started yet").isVisible(), "pre-start status shown");
await noHScroll("Today (pre-start)");
await shot("1-prestart");

// 2. Day 1: quick-tick, then log custom minutes + note from the sheet
await page.goto(`${BASE}/?today=2026-09-28#/`);
await page.getByText("Up next").waitFor();
ok(await page.locator(".focus-title").innerText() === "Placement test (all 4 skills)", "day 1 leads with the placement test");
const total = await page.locator("li.task").count() + 1;
await page.locator("li.task button.check").first().click();
await page.getByText(`1/${total} done`).waitFor();
ok(true, "ticking a task updates the counter");
await page.locator("li.task .task-body").first().click();
await sheet().waitFor();
await sheet().getByLabel("5 minutes more").click();
await sheet().getByLabel("5 minutes more").click();
await sheet().locator("textarea").fill("Tracks 1-4, nasal sounds are hard");
await sheet().getByRole("button", { name: "Mark done" }).click();
await page.getByText(`2/${total} done`).waitFor();
ok(true, "minutes + note saved from the task sheet");
await page.reload();
await page.getByText(`2/${total} done`).waitFor();
ok(true, "progress survives a reload");
await noHScroll("Today");
await shot("2-day1");

// 3. Timer: start, it keeps running across reloads, finish logs minutes
await page.locator(".focus .btn.primary").click();
await sheet().getByRole("button", { name: "Start timer" }).click();
await page.waitForTimeout(1200);
ok(/00:0[1-9]/.test(await sheet().locator(".timer").innerText()), "timer counts up");
await shot("3-timer", false);
await page.keyboard.press("Escape");
ok(await page.locator(".focus-label", { hasText: "In progress" }).isVisible(), "running task is pinned as In progress");
await page.reload();
await page.locator(".focus-label", { hasText: "In progress" }).waitFor();
ok(true, "timer survives closing the app");
await page.locator(".focus .btn.primary").click();
await sheet().getByRole("button", { name: "Finish" }).click();
await page.getByText(`3/${total} done`).waitFor();
ok(true, "finishing the timer logs the task");

// 4. Day 2: rollover (the overdue-placement case is covered in logic.test.ts)
await page.goto(`${BASE}/?today=2026-09-29#/`);
await page.getByText("Also today").waitFor();
const titles = await page.locator(".task-title, .focus-title").allInnerTexts();
ok(new Set(titles).size === titles.length, "no task appears twice after a missed day");
ok(await page.locator(".tag", { hasText: "missed folded in" }).count() >= 1, "missed writing/speaking folded into today's task");
ok(await page.locator(".tag", { hasText: "Overdue" }).count() === 0, "placement test finished via the timer is not shown as overdue");
await shot("4-day2");

// 5. Extra study
await page.getByLabel("Log extra study").click();
await sheet().getByRole("button", { name: "Listening" }).click();
await sheet().getByPlaceholder(/Easy French/).fill("Easy French street interview");
await sheet().getByRole("button", { name: /Save 30 min/ }).click();
await sheet().waitFor({ state: "detached" });
ok(true, "extra study logged from the + sheet");

// 6. Plan
await page.goto(`${BASE}/?today=2026-09-29#/plan`);
await page.getByText("The journey").waitFor();
await page.locator('.week-chip[data-week="2"]').click();
ok(await page.getByText(/Week 2 · 5 Oct/).isVisible(), "can jump to week 2");
await page.locator(".day").nth(2).click();
ok(await page.locator("li.task").count() > 3, "picking a day shows its tasks");
await page.getByRole("button", { name: "This week" }).click();
await noHScroll("Plan");
await shot("5-plan");

// 7. Progress
await page.goto(`${BASE}/?today=2026-09-29#/log`);
await page.getByText("Hours per week").waitFor();
ok(await page.getByText("Easy French street interview").isVisible(), "extra study appears in history");
ok(await page.locator("svg.chart path").count() >= 1, "weekly chart draws bars");
await noHScroll("Progress");
await shot("6-progress");

// 8. Resources
await page.goto(`${BASE}/#/resources`);
const all = await page.locator("a.res").count();
await page.getByRole("button", { name: "Free", exact: true }).click();
const free = await page.locator("a.res").count();
await page.locator(".chips").first().getByRole("button", { name: "Speaking" }).click();
const freeSpeaking = await page.locator("a.res").count();
await page.getByRole("button", { name: "All skills" }).click();
await page.getByLabel("Search resources").fill("tv5");
const searched = await page.locator("a.res").count();
ok(all > free && free > freeSpeaking && freeSpeaking > 0 && searched >= 1, `filters + search work (${all} → ${free} → ${freeSpeaking} → ${searched})`);
await noHScroll("Resources");
await page.getByLabel("Search resources").fill("");
await shot("7-resources");

// 9. Backup round trip
await page.goto(`${BASE}/?today=2026-09-29#/settings`);
const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: /Export backup/ }).click()]);
const file = await dl.path();
const backup = JSON.parse(readFileSync(file, "utf8"));
ok(backup.format === "tcf-passer-backup" && backup.entries.length === 4 && !JSON.stringify(backup).includes("anthropicKey"), `export has all entries (${backup.entries.length}) and no API key`);
await page.evaluate(() => new Promise((r) => { const q = indexedDB.deleteDatabase("tcf-passer"); q.onsuccess = q.onblocked = r; }));
await page.reload();
await page.getByText("Your data").waitFor();
page.once("dialog", (d) => d.accept());
await page.locator('input[type="file"]').setInputFiles(file);
await page.getByText("Restored 4 log entries.").waitFor();
ok(true, "import restores the backup");
await shot("8-settings");

// 10. Dark mode
await page.getByRole("button", { name: "Dark" }).click();
await page.goto(`${BASE}/?today=2026-09-29#/`);
await page.getByText("Also today").waitFor();
ok(await page.evaluate(() => document.documentElement.dataset.theme) === "dark", "dark mode applies");
await shot("9-dark");

// 11. Offline
await page.evaluate(() => navigator.serviceWorker.ready);
await page.reload();
await ctx.setOffline(true);
await page.reload();
await page.getByText("Also today").waitFor({ timeout: 5000 });
ok(await page.evaluate(() => document.fonts.check('600 20px "Fraunces"')), "loads with no connection, fonts included");
await ctx.setOffline(false);

// 12. Study hub → flashcards: grade 3 cards, finish, time logged against today's flashcards task
await page.goto(`${BASE}/?today=2026-09-30#/study`);
await page.getByText("Placement test").first().waitFor();
await noHScroll("Study");
await shot("10-study");
await page.goto(`${BASE}/?today=2026-09-30#/cards`);
await page.getByRole("button", { name: /Start/ }).click();
for (let k = 0; k < 3; k++) {
  await page.getByRole("button", { name: "Show answer" }).click();
  await page.locator(".grades .good").click();
}
await shot("11-flashcards", false);
ok((await page.evaluate(() => new Promise((r) => { const q = indexedDB.open("tcf-passer"); q.onsuccess = () => { const t = q.result.transaction("cards").objectStore("cards").count(); t.onsuccess = () => r(t.result); }; }))) === 3, "3 flashcards scheduled with FSRS");
await page.getByRole("button", { name: "Done" }).click();
await page.getByText("Ticked off today's flashcards task.").waitFor();
ok(true, "finishing flashcards ticks today's flashcards task");

// 13. Grammar drill: answer every question (right or wrong), results + mistake bank
await page.goto(`${BASE}/?today=2026-09-30#/grammar`);
await page.getByRole("button", { name: /Start drill/ }).click();
const drillLen = Number((await page.locator(".mcq-top").innerText()).match(/\/ (\d+)/)[1]);
for (let k = 0; k < drillLen; k++) {
  await atQuestion(k + 1);
  if (await page.locator(".mcq-opt").count()) await page.locator(".mcq-opt").first().click();
  else {
    await page.locator(".answer-input").fill("xyz");
    await page.getByRole("button", { name: "Check" }).click();
  }
  await shot("12-grammar", false);
  await page.getByRole("button", { name: /Next|Finish/ }).click();
}
await page.locator(".celebrate").waitFor();
ok(true, "grammar drill runs to the end with feedback");
await page.goto(`${BASE}/?today=2026-09-30#/mistakes`);
await page.locator(".tasks .task").first().waitFor({ timeout: 5000 });
ok(await page.locator(".tasks .task").count() > 0, "wrong answers land in the mistake bank");
await shot("15-mistakes");

// 14. Listening practice, 5 questions, instant feedback
await page.goto(`${BASE}/?today=2026-09-30#/practice?skill=listening`);
await page.getByRole("button", { name: "5", exact: true }).click();
await page.getByRole("button", { name: /Start 5 questions/ }).click();
for (let k = 0; k < 5; k++) {
  await atQuestion(k + 1);
  await page.locator(".mcq-opt").nth(1).click();
  await page.locator(".notice").first().waitFor();
  if (k === 0) await shot("13-listening", false);
  await page.getByRole("button", { name: /Next|Finish/ }).click();
}
await page.getByText(/≈ \d+ · /).waitFor();
ok(true, "listening practice gives a level-weighted estimate");
await noHScroll("Practice");

// 15. Placement test: 12 listening + 12 reading (exam mode), skip writing/speaking, levels appear on Today
await page.goto(`${BASE}/?today=2026-09-30#/check?kind=placement`);
await page.getByRole("button", { name: /Start/ }).click();
await page.getByText("step 1 of 5").waitFor();
ok(await page.locator("nav.tabs").count() === 0, "tab bar hidden during a test");
for (const sec of ["listening", "reading"]) {
  for (let k = 0; k < 12; k++) {
    await atQuestion(k + 1);
    await page.locator(".mcq-opt").nth(k % 4).click();
    await page.getByRole("button", { name: /Next|Finish/ }).click();
  }
}
await page.getByRole("button", { name: /can't write/ }).click();
await page.getByRole("button", { name: /can't speak/ }).click();
await page.getByRole("button", { name: "See my progress" }).waitFor();
await shot("14-placement-results");
await page.getByRole("button", { name: "See my progress" }).click();
await page.getByText("If you sat").first().waitFor({ timeout: 5000 }).catch(() => {});
await shot("16-progress-after-placement");
await page.locator("nav.tabs a", { hasText: "Today" }).click();
await page.getByRole("heading", { name: "Your level" }).waitFor({ timeout: 8000 }).catch(async (e) => {
  await shot("debug-today");
  console.error("Page errors:", errors.join(" | "), "\nBody:", (await page.locator("body").innerText()).slice(0, 600));
  throw e;
});
ok(await page.locator(".skill-tile .val.untested").count() === 0, "placement fills in all four skill levels on Today");

// 16. Optional: real AI grading through the Writing screen (only when GEMINI_KEY is set; the key is never stored in the repo)
if (process.env.GEMINI_KEY) {
  await page.evaluate((key) => new Promise((r) => {
    const q = indexedDB.open("tcf-passer");
    q.onsuccess = () => {
      const tx = q.result.transaction("settings", "readwrite");
      tx.objectStore("settings").put({ key: "geminiKey", value: key });
      tx.objectStore("settings").put({ key: "aiProvider", value: "gemini" });
      tx.oncomplete = r;
    };
  }), process.env.GEMINI_KEY);
  await page.goto(`${BASE}/?today=2026-09-30#/writing?prompt=W1-01`);
  await page.locator("textarea").first().fill(
    "Salut Marie, je t'invite à dîner chez moi samedi soir à dix-neuf heures. J'habite au 25 rue Saint-Denis, au troisième étage. Je vais préparer du poulet avec du riz et une salade, et pour le dessert un gâteau au chocolat. Tu peux venir avec ton frère si tu veux. Est-ce que tu manges de la viande ? Dis-moi si tu es libre. À samedi, j'espère ! Bisous, Tope",
  );
  await page.getByRole("button", { name: /^Submit/ }).click();
  await page.getByRole("button", { name: /Grade with AI/ }).click();
  const outcome = await Promise.race([
    page.getByText(/\/\s?20/).first().waitFor({ timeout: 120_000 }).then(() => "graded"),
    page.locator(".notice.bad").first().waitFor({ timeout: 120_000 }).then(async () => `error: ${await page.locator(".notice.bad").first().innerText()}`),
  ]);
  await shot("17-ai-graded");
  ok(outcome === "graded", `real Gemini grading works (${outcome})`);
}

ok(errors.length === 0, `no console errors${errors.length ? ": " + errors.join(" | ") : ""}`);
await browser.close();
