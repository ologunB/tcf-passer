import { useLiveQuery } from "dexie-react-hooks";
import { Icon } from "../components/Icon";
import { db } from "../db";
import { useSetting } from "../hooks";
import { daysBetween, fmtDay } from "../lib/dates";
import { findWeek, plan } from "../lib/plan";
import { nextNewCards } from "../lib/srs";

export function StudyPage({ today }: { today: string }) {
  const week = today < plan.start ? 1 : (findWeek(plan, today)?.week ?? 1);
  const perDay = useSetting<number>("newPerDay", 20);
  const stats = useLiveQuery(async () => {
    const now = Date.now();
    const cards = await db.cards.toArray();
    const due = cards.filter((c) => c.due <= now).length;
    const newToday = cards.filter((c) => c.introducedOn === today).length;
    const fresh = nextNewCards(new Set(cards.map((c) => c.id)), week, Math.max(0, perDay - newToday)).length;
    const mistakes = await db.mistakes.where("resolved").equals(0).count();
    const placement = await db.estimates.filter((e) => e.source === "placement").count();
    const writings = await db.writings.count();
    const recordings = await db.recordings.count();
    return { due, fresh, mistakes, placement, writings, recordings };
  }, [today, week, perDay]);

  const nextCheck = plan.weeks.flatMap((w) => w.days.flatMap((d) => d.events)).find((e) => e.type === "progress-check" && e.date >= today);
  const tiles: { href: string; skill: string; icon: string; title: string; sub: string; count?: number }[] = [
    { href: "#/cards", skill: "vocabulary", icon: "vocabulary", title: "Flashcards", sub: stats ? `${stats.due} due · ${stats.fresh} new` : "", count: stats ? stats.due + stats.fresh : undefined },
    { href: "#/grammar", skill: "grammar", icon: "grammar", title: "Grammar & verbs", sub: (findWeek(plan, today) ?? plan.weeks[0]).focus.grammar },
    { href: "#/practice?skill=listening", skill: "listening", icon: "listening", title: "Listening", sub: "TCF-style, audio once in exam mode" },
    { href: "#/practice?skill=reading", skill: "reading", icon: "reading", title: "Reading", sub: "TCF-style, A1 → C2" },
    { href: "#/writing", skill: "writing", icon: "writing", title: "Writing", sub: stats?.writings ? `${stats.writings} written so far` : "3 real task types, word limits" },
    { href: "#/speaking", skill: "speaking", icon: "speaking", title: "Speaking", sub: stats?.recordings ? `${stats.recordings} recordings` : "Record yourself, real timers" },
    { href: "#/dictation", skill: "listening", icon: "writing", title: "Dictation", sub: "Hear it, type it: catch every word" },
    { href: "#/phrases", skill: "writing", icon: "note", title: "Phrase bank", sub: "Openers, connectors, opinions, polite questions" },
  ];

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <div className="eyebrow">Week {week} · everything in one place</div>
          <h1 className="title">Étudier<em>.</em></h1>
        </div>
      </header>

      {stats && !stats.placement && (
        <a className="focus" data-skill="exam" href="#/check?kind=placement" style={{ color: "inherit" }}>
          <div className="focus-label">Start here</div>
          <div className="focus-title">Placement test</div>
          <div className="focus-meta">About 30 minutes across all four skills. It sets your starting level so the app can track progress honestly. Total beginner? Take it anyway, and skip what you can't do yet.</div>
        </a>
      )}

      <div className="hub">
        {tiles.map((t) => (
          <a key={t.href} className="hub-tile" data-skill={t.skill} href={t.href}>
            <span className="skill-badge" style={{ width: 38, height: 38 }}><Icon name={t.icon} size={19} /></span>
            {!!t.count && <span className="count tag skill num">{t.count}</span>}
            <span style={{ display: "grid", gap: 3 }}><b>{t.title}</b><small>{t.sub}</small></span>
          </a>
        ))}
        <a className="hub-tile wide" data-skill="speaking" href="#/mistakes">
          <span className="skill-badge" style={{ width: 38, height: 38 }}><Icon name="alert" size={19} /></span>
          <span style={{ display: "grid", gap: 2 }}><b>Mistake bank</b><small>Every wrong answer, until you get it right twice</small></span>
          <span className="tag skill num">{stats?.mistakes ?? 0}</span>
        </a>
        <a className="hub-tile wide" data-skill="exam" href="#/check?kind=progress">
          <span className="skill-badge" style={{ width: 38, height: 38 }}><Icon name="flag" size={19} /></span>
          <span style={{ display: "grid", gap: 2 }}>
            <b>Progress check</b>
            <small>{nextCheck ? `Next one planned ${daysBetween(today, nextCheck.date) === 0 ? "today" : fmtDay(nextCheck.date, { weekday: "short", day: "numeric", month: "short" })}` : "Every 2 weeks"} · updates your level</small>
          </span>
          <Icon name="chevronR" size={18} />
        </a>
        <a className="hub-tile wide" data-skill="exam" href="#/mock">
          <span className="skill-badge" style={{ width: 38, height: 38 }}><Icon name="hourglass" size={19} /></span>
          <span style={{ display: "grid", gap: 2 }}><b>Full mock exam</b><small>All four sections, real timing, no pausing (about 3 h)</small></span>
          <Icon name="chevronR" size={18} />
        </a>
        <a className="hub-tile wide" data-skill="planning" href="#/resources">
          <span className="skill-badge" style={{ width: 38, height: 38 }}><Icon name="library" size={19} /></span>
          <span style={{ display: "grid", gap: 2 }}><b>Resources</b><small>Researched sites, podcasts, simulators and tutors</small></span>
          <Icon name="chevronR" size={18} />
        </a>
      </div>
    </div>
  );
}
