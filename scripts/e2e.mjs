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
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
const ok = (cond, msg) => { if (!cond) throw new Error("FAIL: " + msg); console.log("✓", msg); };
const shot = async (n, full = true) => { await page.waitForTimeout(500); return page.screenshot({ path: `${OUT}/${n}.png`, fullPage: full }); };
const noHScroll = async (where) => ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `no sideways scroll on ${where}`);
const sheet = () => page.locator(".sheet");

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
ok(backup.format === "tcf-passer-backup" && backup.entries.length === 4, `export has all entries (${backup.entries.length})`);
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

ok(errors.length === 0, `no console errors${errors.length ? ": " + errors.join(" | ") : ""}`);
await browser.close();
