import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { completeTask, db, exportAll, importAll, setSetting, uncompleteTask } from "./db";

describe("db", () => {
  it("ticking a task twice keeps one entry; unticking removes it", async () => {
    await completeTask("2026-09-28-srs", "2026-09-28", "vocabulary", 30);
    await completeTask("2026-09-28-srs", "2026-09-28", "vocabulary", 45, "did extra");
    const rows = await db.entries.where("taskId").equals("2026-09-28-srs").toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0].minutes).toBe(45);
    await uncompleteTask("2026-09-28-srs");
    expect(await db.entries.count()).toBe(0);
  });

  it("export → wipe → import restores everything", async () => {
    await completeTask("2026-09-28-core", "2026-09-28", "speaking", 45);
    await db.entries.add({ date: "2026-09-29", taskId: null, skill: "listening", minutes: 20, note: "Easy French", createdAt: 1 });
    await setSetting("examDate", "2027-06-09");
    await db.estimates.add({ date: "2026-09-28", skill: "listening", nclc: 3, source: "placement" });

    await setSetting("geminiKey", "AIza-secret");
    await setSetting("anthropicKey", "sk-secret");
    const backup = JSON.parse(JSON.stringify(await exportAll()));
    expect(JSON.stringify(backup)).not.toMatch(/secret/);
    // Wipe the data (not settings: API keys live on the device and must survive an import).
    await Promise.all([db.entries.clear(), db.estimates.clear(), db.settings.delete("examDate")]);

    expect(await importAll(backup)).toBe(2);
    expect(await db.entries.count()).toBe(2);
    expect((await db.settings.get("examDate"))?.value).toBe("2027-06-09");
    expect((await db.settings.get("geminiKey"))?.value).toBe("AIza-secret"); // keys on this device survive an import
    expect(await db.estimates.count()).toBe(1);
  });

  it("refuses files that aren't backups, without touching data", async () => {
    const before = await db.entries.count();
    await expect(importAll({ hello: "world" })).rejects.toThrow(/isn't a TCF Passer backup/);
    expect(await db.entries.count()).toBe(before);
  });
});
