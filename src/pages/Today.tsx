import { useMemo, useState } from "react";
import { Icon } from "../components/Icon";
import { Journey } from "../components/Journey";
import { Ring } from "../components/Ring";
import { Sheet } from "../components/Sheet";
import { Resources, TaskRow, TaskSheet, TaskTags, type TaskFlags } from "../components/Task";
import { db } from "../db";
import { useDone, useEntries, useEstimates, useExamDate, useSetting } from "../hooks";
import { latestBySkill, rebalance, skillLag, skillStatus } from "../lib/adapt";
import { daysBetween, fmtDay, fmtHours } from "../lib/dates";
import { CORE_SKILLS, skillLabel, skillOptions } from "../lib/labels";
import { buildToday, computeStatus, loggedMinutes, plannedMinutes, streak, type Entry, type StatusState } from "../lib/logic";
import { findWeek, phaseOf, plan, type Item, type Skill } from "../lib/plan";
import { fmtNclc } from "../lib/scoring";
import { fmtClock, useTimer } from "../timer";

const tone: Record<StatusState, string> = { "not-started": "neutral", "on-track": "good", ahead: "good", behind: "warn", "at-risk": "bad" };
const toneIcon: Record<StatusState, string> = { "not-started": "flag", "on-track": "check", ahead: "sparkle", behind: "clock", "at-risk": "alert" };

export function Today({ today }: { today: string }) {
  const entries = useEntries();
  const done = useDone(entries);
  const examDate = useExamDate();
  const lastExport = useSetting<string | null>("lastExport", null);
  const { timer, elapsed } = useTimer();
  const [openId, setOpenId] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [logOpen, setLogOpen] = useState(false);

  const estimates = useEstimates();
  const preStartDay = today < plan.start;
  const weekNo = preStartDay ? 1 : (findWeek(plan, today)?.week ?? plan.weeks.length);
  const latest = useMemo(() => latestBySkill(estimates ?? []), [estimates]);
  // Adaptive plan: if a skill is behind where the plan expects it, today gets a catch-up drill for it.
  const t = useMemo(() => {
    const base = buildToday(plan, today, done);
    const r = rebalance(today, base.items, skillLag(weekNo, latest), latest);
    return { ...base, items: r.items, rebalanceNote: r.note };
  }, [today, done, weekNo, latest]);
  // Status = the worse of the hours signal and the skill-level signal.
  const status = useMemo(() => {
    const hours = computeStatus(plan, entries ?? [], today);
    const skills = preStartDay ? null : skillStatus(weekNo, latest);
    const rank = { "not-started": 0, "on-track": 1, ahead: 1, behind: 2, "at-risk": 3 } as const;
    if (!skills || rank[skills.state] < rank[hours.state]) return hours;
    if (rank[skills.state] === rank[hours.state] && skills.state === "on-track") return { ...hours, reason: `${hours.reason} ${skills.reason}` };
    return { ...skills, reason: rank[hours.state] >= 2 ? `${skills.reason} Hours: ${hours.reason}` : skills.reason };
  }, [entries, today, weekNo, latest, preStartDay]);
  const byTask = useMemo(() => new Map((entries ?? []).filter((e) => e.taskId).map((e) => [e.taskId!, e])), [entries]);

  if (!entries) return null;

  const preStart = today < plan.start;
  const week = findWeek(plan, today) ?? plan.weeks[0];
  const phase = phaseOf(plan, week);
  const toExam = daysBetween(today, examDate);

  const rows: { item: Item; flags: TaskFlags }[] = [
    ...t.sticky.map((item) => ({ item, flags: { overdue: true } })),
    ...t.carried.map((item) => ({ item, flags: { carried: true } })),
    ...t.items.map((item) => ({ item, flags: { merged: t.merged[item.id] } })),
  ];
  const todo = rows.filter((r) => !done.has(r.item.id));
  const finished = rows.filter((r) => done.has(r.item.id));
  const next = todo.find((r) => r.item.id === timer?.taskId) ?? todo[0];
  const rest = todo.filter((r) => r !== next);

  const plannedToday = rows.reduce((a, r) => a + r.item.minutes, 0);
  const loggedToday = loggedMinutes(entries, today, today);
  const plannedSoFar = preStart ? 0 : plannedMinutes(plan, plan.start, today);
  const loggedTotal = entries.reduce((a, e) => a + e.minutes, 0);
  // Nudge once there's a week of data to lose and no backup in the last 7 days.
  const firstLog = entries.reduce((a, e) => (e.date < a ? e.date : a), today);
  const exportDue = daysBetween(lastExport ? lastExport.slice(0, 10) : firstLog, today) >= 7;
  const upcoming = plan.milestones.filter((m) => m.date >= today && daysBetween(today, m.date) <= 30 && m.type !== "exam");
  const open = rows.find((r) => r.item.id === openId);
  const todayPct = loggedToday / Math.max(1, plannedToday);
  const running = !!next && timer?.taskId === next.item.id;

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <div className="eyebrow">
            {fmtDay(today, { weekday: "long", day: "numeric", month: "long" })}
            {!preStart && ` · Week ${week.week}`}
          </div>
          <h1 className="title">{new Date().getHours() >= 18 ? "Bonsoir" : "Bonjour"}<em>.</em></h1>
        </div>
        <button className="icon-btn brand" onClick={() => setLogOpen(true)} aria-label="Log extra study">
          <Icon name="plus" size={20} stroke={2.4} />
        </button>
      </header>

      <section className="hero">
        <div className="hero-top">
          <Ring value={preStart ? 0 : todayPct} size={104} stroke={10} color="#fff">
            <b className="num">{preStart ? "—" : `${Math.round(todayPct * 100)}%`}</b>
            <span>today</span>
          </Ring>
          <div className="hero-count num">
            {toExam}
            <small>days to your TCF · {fmtDay(examDate, { day: "numeric", month: "short", year: "numeric" })}</small>
          </div>
        </div>
        <div className="hero-stats">
          <span className="hero-pill"><Icon name="flame" size={14} /> {streak(entries, today)}-day streak</span>
          <span className="hero-pill num">
            <Icon name="clock" size={14} /> {fmtHours(loggedTotal)}{plannedSoFar ? ` of ${fmtHours(plannedSoFar)}` : ""} logged
          </span>
          {!preStart && <span className="hero-pill">{phase.name} · {phase.level}</span>}
        </div>
        <Journey today={today} />
      </section>

      <section className="card status" data-tone={tone[status.state]}>
        <span className="status-dot"><Icon name={toneIcon[status.state]} size={18} stroke={2.2} /></span>
        <div style={{ flex: 1 }}>
          <h3>{status.headline}</h3>
          <p>{status.reason}</p>
          {status.action && <p className="do">{status.action}</p>}
        </div>
      </section>

      {upcoming.map((m) => (
        <div key={m.date + m.type} className={`notice ${m.critical ? "bad" : "warn"}`}>
          <Icon name="calendar" size={18} />
          <span><b>{m.date === today ? "Today" : `In ${daysBetween(today, m.date)} days`}:</b> {m.title}</span>
        </div>
      ))}
      {exportDue && (
        <a className="notice" href="#/settings">
          <Icon name="download" size={18} />
          <span>{lastExport ? "It's been a week since your last backup." : "You have a week of progress and no backup yet."} <b>Back up now →</b></span>
        </a>
      )}

      {preStart ? (
        <PreStart today={today} />
      ) : (
        <>
          {next ? (
            <section className="focus" data-skill={next.item.skill}>
              <div className="focus-label">
                {running ? <><span className="running-dot" /> In progress</> : "Up next"}
              </div>
              <div className="focus-title">{next.item.title}</div>
              <div className="focus-meta"><TaskTags item={next.item} flags={next.flags} /></div>
              {running && <div className="timer num">{fmtClock(elapsed)}</div>}
              <div style={{ marginTop: 14 }}><Resources ids={next.item.resources} /></div>
              <div className="focus-actions">
                <button className="btn primary lg" style={{ flex: 1 }} onClick={() => setOpenId(next.item.id)}>
                  {running ? "Open timer" : <><Icon name="play" size={16} /> Start</>}
                </button>
              </div>
            </section>
          ) : (
            <section className="card celebrate">
              <Icon name="sparkle" size={30} />
              <div className="big">Journée terminée !</div>
              <div className="muted">Everything on today's list is done. Rest, or add some relaxed listening.</div>
            </section>
          )}

          {rest.length > 0 && (
            <>
              <div className="section-title">
                <h2>Also today</h2>
                <span className="num">{finished.length}/{rows.length} done · {fmtHours(loggedToday)} of {fmtHours(plannedToday)}</span>
              </div>
              <section className="card flush">
                <ul className="tasks">
                  {rest.map((r) => (
                    <TaskRow key={r.item.id} item={r.item} date={today} flags={r.flags} onOpen={(i) => setOpenId(i.id)} />
                  ))}
                </ul>
              </section>
            </>
          )}

          {finished.length > 0 && (
            <section className="card flush">
              <button className="group-toggle" aria-expanded={showDone} onClick={() => setShowDone(!showDone)}>
                <span>Done · {finished.length}</span>
                <Icon name="chevronD" size={18} />
              </button>
              {showDone && (
                <ul className="tasks">
                  {finished.map((r) => (
                    <TaskRow key={r.item.id} item={r.item} entry={byTask.get(r.item.id)} date={today} flags={r.flags} onOpen={(i) => setOpenId(i.id)} />
                  ))}
                </ul>
              )}
            </section>
          )}
          {t.rebalanceNote && (
            <div className="notice warn"><Icon name="sparkle" size={18} /><span><b>Plan adjusted:</b> {t.rebalanceNote}</span></div>
          )}
          {t.dropped > 0 && (
            <p className="muted tiny" style={{ margin: "-4px 4px 0" }}>
              {t.dropped} older unfinished item{t.dropped > 1 ? "s were" : " was"} let go so your backlog stays at 60 min or less. That's by design.
            </p>
          )}

          <div className="section-title"><h2>This week</h2><span>{phase.name}</span></div>
          <div className="grid-2 focus-tiles">
            <div className="tile"><div className="k"><Icon name="grammar" size={14} /> Grammaire</div><div className="v">{week.focus.grammar}</div></div>
            <div className="tile"><div className="k"><Icon name="vocabulary" size={14} /> Vocabulaire</div><div className="v">{week.focus.vocab}</div></div>
          </div>
        </>
      )}

      <SkillLevels />

      <TaskSheet item={open?.item ?? null} entry={open ? byTask.get(open.item.id) : undefined} date={today} flags={open?.flags} onClose={() => setOpenId(null)} />
      <QuickLog open={logOpen} onClose={() => setLogOpen(false)} today={today} />
    </div>
  );
}

function SkillLevels() {
  const estimates = useEstimates();
  const latest = new Map<string, number>();
  for (const e of estimates ?? []) latest.set(e.skill, e.nclc);
  const tested = CORE_SKILLS.filter((s) => latest.has(s));
  const weakest = tested.length === 4 ? CORE_SKILLS.reduce((a, s) => (latest.get(s)! < latest.get(a)! ? s : a)) : null;
  const pct = (n: number) => `${Math.max(0, Math.min(1, (n - 3) / 7)) * 100}%`; // meter covers NCLC 3–10

  return (
    <>
      <div className="section-title"><h2>Your level</h2><span>need NCLC 7 in all four</span></div>
      <div className="grid-4">
        {CORE_SKILLS.map((s) => {
          const n = latest.get(s);
          return (
            <div key={s} className="skill-tile" data-skill={s}>
              <div className="lbl"><Icon name={s} size={14} /> {skillLabel[s]}</div>
              <div className={`val num${n === undefined ? " untested" : ""}`}>{n === undefined ? "—" : fmtNclc(n)}</div>
              <div className="meter">{n !== undefined && n > 3 ? <i style={{ width: pct(n) }} /> : null}<b style={{ left: pct(7) }} /></div>
            </div>
          );
        })}
      </div>
      <p className="muted tiny" style={{ margin: "-4px 4px 0" }}>
        {weakest
          ? `Your level is set by your weakest skill: ${skillLabel[weakest].toLowerCase()}.`
          : <>Take the <a href="#/check?kind=placement">placement test</a> to fill this in. After that, progress checks every 2 weeks and mock exams keep it current.</>}
      </p>
    </>
  );
}

function PreStart({ today }: { today: string }) {
  const n = daysBetween(today, plan.start);
  const steps: [string, string, string][] = [
    ["phone", "Add to your home screen", "Share → Add to Home Screen. Then it works offline."],
    ["calendar", "Look through week 1", "See what each day asks of you in the Plan tab."],
    ["library", "Bookmark your core three", "Language Transfer, TV5Monde and Coffee Break French."],
    ["flag", "Know your target", "NCLC 7 in all four skills: listening 458, reading 453, writing and speaking 10/20."],
    ["plus", "Want a head start?", "Log any study with the + button. It counts."],
  ];
  return (
    <>
      <section className="focus" data-skill="exam">
        <div className="focus-label">Week 1 starts in {n} day{n > 1 ? "s" : ""}</div>
        <div className="focus-title">{fmtDay(plan.start, { weekday: "long", day: "numeric", month: "long" })}</div>
        <div className="focus-meta">Day 1 opens with your placement test, then about 4 hours of study.</div>
      </section>
      <div className="section-title"><h2>Before you start</h2></div>
      <div className="list">
        {steps.map(([icon, title, sub]) => (
          <div key={title} className="list-row">
            <span className="ico"><Icon name={icon} size={17} /></span>
            <span className="txt"><b>{title}</b><span>{sub}</span></span>
          </div>
        ))}
      </div>
    </>
  );
}

function QuickLog({ open, onClose, today }: { open: boolean; onClose: () => void; today: string }) {
  const [skill, setSkill] = useState<Skill>("listening");
  const [minutes, setMinutes] = useState(30);
  const [note, setNote] = useState("");
  const [date, setDate] = useState(today);

  const save = async () => {
    const e: Entry = { date, taskId: null, skill, minutes, note: note.trim(), createdAt: Date.now() };
    await db.entries.add(e);
    setNote("");
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title="Log extra study">
      <div className="field">
        Skill
        <div className="chips" style={{ flexWrap: "wrap" }}>
          {skillOptions.map((s) => (
            <button key={s} aria-pressed={skill === s} onClick={() => setSkill(s)} data-skill={s}>
              <span style={{ color: skill === s ? "inherit" : "var(--c)", display: "inline-flex" }}><Icon name={s} size={15} /></span>
              {skillLabel[s]}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        Minutes
        <div className="stepper">
          <button onClick={() => setMinutes((m) => Math.max(5, m - 5))} aria-label="5 minutes less">−</button>
          <output className="num">{minutes}<small> min</small></output>
          <button onClick={() => setMinutes((m) => m + 5)} aria-label="5 minutes more">+</button>
        </div>
      </div>
      <label className="field">
        What did you do?
        <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Easy French episode, chat with a tutor" />
      </label>
      <label className="field">
        Date
        <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
      </label>
      <button className="btn dark lg block" onClick={save}>Save {minutes} min</button>
    </Sheet>
  );
}
