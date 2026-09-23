import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Icon, SkillBadge } from "../components/Icon";
import { McqRunner, type McqAnswer } from "../components/McqRunner";
import { Rubric, SPEAKING_CRITERIA, WRITING_CRITERIA } from "../components/Rubric";
import { SpeakingTask } from "../components/SpeakingTask";
import { WritingTask } from "../components/WritingTask";
import { db, recordAnswer, setSetting, type Estimate, type Recording, type Writing } from "../db";
import { latestBySkill, readiness } from "../lib/adapt";
import { MOCK_SPREAD, pickItems, speakingPrompts, tcfItems, writingPrompts, type SpeakingPrompt, type WritingPrompt } from "../lib/content";
import { fmtDay } from "../lib/dates";
import { CORE_SKILLS, skillLabel, type CoreSkill } from "../lib/labels";
import { fmtNclc, levelScore, nclcFor, rubricTo20 } from "../lib/scoring";
import { go, useRoute } from "../router";
import { fmtClock } from "../timer";
import { ReadinessCard } from "./Log";
import "./mock-progress.css";

// ---------- run state (settings key "mockRun") ----------

type Stage = "listening" | "reading" | "writing" | "speaking" | "assess" | "results";
const STAGES: Stage[] = ["listening", "reading", "writing", "speaking", "assess", "results"];
const SECTION_MIN: Partial<Record<Stage, number>> = { listening: 35, reading: 60, writing: 60 };

interface MockRun {
  v: 1;
  date: string; // the day the mock counts for
  stage: Stage;
  began: Partial<Record<Stage, number>>; // wall-clock ms when the section started
  deadline?: number; // current timed section's deadline (set when it begins)
  listeningIds: string[];
  readingIds: string[];
  progress?: McqAnswer[]; // answers so far in the current MCQ section
  listening?: McqAnswer[];
  reading?: McqAnswer[];
  listeningSec?: number;
  readingSec?: number;
  writingPrompts: string[]; // task 1, 2, 3
  speakingPrompts: string[];
  writingIds: (number | null)[];
  recordingIds: (number | null)[];
  speakingIdx: number;
  result?: { score: Record<CoreSkill, number>; nclc: Record<CoreSkill, number> };
}

// Serialise read-modify-write so a progress save can't clobber a finish.
let chain: Promise<unknown> = Promise.resolve();
function patchRun(fn: (r: MockRun) => Partial<MockRun>) {
  chain = chain.then(async () => {
    const row = await db.settings.get("mockRun");
    if (!row?.value) return;
    const cur = row.value as MockRun;
    await setSetting("mockRun", { ...cur, ...fn(cur) });
  });
  return chain;
}
const clearRun = () => (chain = chain.then(() => db.settings.delete("mockRun")));

function useRun() {
  return useLiveQuery(async () => ((await db.settings.get("mockRun"))?.value as MockRun | undefined) ?? null, []);
}

function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

function pickPrompt<T extends { id: string; task: 1 | 2 | 3 }>(list: T[], task: 1 | 2 | 3, used: Set<string>): T {
  const pool = list.filter((p) => p.task === task);
  const fresh = pool.filter((p) => !used.has(p.id));
  const from = fresh.length ? fresh : pool;
  return from[Math.floor(Math.random() * from.length)];
}

async function startRun(today: string) {
  const [attempts, writings, recordings] = await Promise.all([db.attempts.toArray(), db.writings.toArray(), db.recordings.toArray()]);
  const seen = new Set(attempts.flatMap((a) => a.items.map((i) => i.id)));
  const usedW = new Set(writings.map((w) => w.promptId));
  const usedS = new Set(recordings.map((r) => r.promptId));
  const tasks = [1, 2, 3] as const;
  const run: MockRun = {
    v: 1,
    date: today,
    stage: "listening",
    began: {},
    listeningIds: pickItems("listening", MOCK_SPREAD, seen).map((i) => i.id),
    readingIds: pickItems("reading", MOCK_SPREAD, seen).map((i) => i.id),
    writingPrompts: tasks.map((t) => pickPrompt(writingPrompts, t, usedW)?.id ?? ""),
    speakingPrompts: tasks.map((t) => pickPrompt(speakingPrompts, t, usedS)?.id ?? ""),
    writingIds: [null, null, null],
    recordingIds: [null, null, null],
    speakingIdx: 0,
  };
  await setSetting("mockRun", run);
  go("mock?run=1");
}

// ---------- page ----------

export function MockPage({ today }: { today: string }) {
  const route = useRoute();
  const run = useRun();
  const running = route.params.get("run") === "1";
  // Nothing to resume (finished or abandoned elsewhere): back to the intro.
  useEffect(() => {
    if (running && run === null) go("mock");
  }, [running, run]);
  if (run === undefined) return null;
  if (running && run) return <Runner run={run} />;
  if (running) return null;
  return <Intro today={today} run={run} />;
}

function Intro({ today, run }: { today: string; run: MockRun | null }) {
  const estimates = useLiveQuery(() => db.estimates.filter((e) => e.source === "mock").toArray(), []);
  const mocks = useMemo(() => groupMocks(estimates ?? []), [estimates]);
  const [busy, setBusy] = useState(false);
  const itemsPerSkill = (s: "listening" | "reading") => tcfItems.filter((i) => i.skill === s).length;

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <div className="eyebrow">Full mock · TCF Canada</div>
          <h1 className="title">Examen blanc<em>.</em></h1>
        </div>
      </header>

      {run && run.stage !== "results" && (
        <section className="notice warn">
          <Icon name="hourglass" size={18} />
          <span style={{ flex: 1 }}>
            <b>A mock is in progress</b> ({skillLabel[run.stage as CoreSkill] ?? "self-assessment"} section, started {fmtDay(run.date)}). The clock kept running while the app was closed.
            <span className="mp-row" style={{ marginTop: 10 }}>
              <button className="btn primary" onClick={() => go("mock?run=1")}>Resume</button>
              <button className="btn ghost" onClick={() => confirm("Abandon this mock? Nothing from it will be saved as a score.") && clearRun()}>Abandon</button>
            </span>
          </span>
        </section>
      )}

      <section className="card">
        <h3>How it works</h3>
        <ol className="mp-steps">
          <li data-skill="listening"><SkillBadge skill="listening" size={30} /><span><b>Listening · 39 questions · 35 min</b><small>Each recording plays once. You can't go back.</small></span></li>
          <li data-skill="reading"><SkillBadge skill="reading" size={30} /><span><b>Reading · 39 questions · 60 min</b><small>Forward only, like the real test.</small></span></li>
          <li data-skill="writing"><SkillBadge skill="writing" size={30} /><span><b>Writing · 3 tasks · 60 min total</b><small>One shared clock for all three; you choose how to split it.</small></span></li>
          <li data-skill="speaking"><SkillBadge skill="speaking" size={30} /><span><b>Speaking · 3 tasks · about 12 min</b><small>Recorded. Task 2 has 2 min of preparation.</small></span></li>
        </ol>
        <p className="small muted" style={{ margin: "12px 0 0" }}>
          About 3 hours in total. Timing is real and uses the clock on the wall: <b>nothing pauses</b>, even if you close the app. Use headphones and a quiet room, and do the whole thing in one sitting.
        </p>
      </section>

      <section className="card">
        <h3>What happens to the results</h3>
        <p className="small muted" style={{ margin: 0 }}>
          At the end you mark your own writing and speaking against the exam criteria. Be strict: a generous mark now only hides the problem until test day.
          The four scores become your current level, feed the readiness answer on the Progress tab, and the plan shifts time towards whichever skill is furthest behind.
          Wrong listening and reading answers go into your mistake bank.
        </p>
      </section>

      <div className="notice">
        <Icon name="alert" size={18} />
        <span>
          The built-in question bank is small ({itemsPerSkill("listening")} listening, {itemsPerSkill("reading")} reading items), so questions repeat across mocks and a repeat inflates your score.
          For fresh questions, also do the free official simulator:{" "}
          <a href="https://apprendre.tv5monde.com/fr/tcf" target="_blank" rel="noreferrer">TV5Monde TCF practice <Icon name="external" size={13} /></a>.
        </span>
      </div>

      {(!run || run.stage === "results") && (
        <button className="btn primary lg block" disabled={busy} onClick={async () => { setBusy(true); await startRun(today); }}>
          <Icon name="play" size={16} /> Start the mock
        </button>
      )}

      <div className="section-title"><h2>Past mocks</h2>{mocks.length > 0 && <span>{mocks.length}</span>}</div>
      <MockList mocks={mocks} />
    </div>
  );
}

// ---------- past mocks (shared with Progress) ----------

export interface MockSummary {
  date: string;
  nclc: Partial<Record<CoreSkill, number>>;
  score: Partial<Record<CoreSkill, number>>;
}

export function groupMocks(estimates: Estimate[]): MockSummary[] {
  const m = new Map<string, MockSummary>();
  for (const e of [...estimates].filter((x) => x.source === "mock").sort((a, b) => (a.id ?? 0) - (b.id ?? 0))) {
    if (!m.has(e.date)) m.set(e.date, { date: e.date, nclc: {}, score: {} });
    const s = m.get(e.date)!;
    s.nclc[e.skill] = e.nclc;
    if (e.score !== undefined) s.score[e.skill] = e.score;
  }
  return [...m.values()].sort((a, b) => b.date.localeCompare(a.date));
}

export function MockList({ mocks }: { mocks: MockSummary[] }) {
  if (!mocks.length) return <section className="card"><p className="empty">No mocks yet. The first full mock is in the plan; you can also take one any time from here.</p></section>;
  return (
    <div className="list">
      {mocks.map((m) => {
        const pass = CORE_SKILLS.every((s) => (m.nclc[s] ?? 0) >= 7);
        return (
          <div key={m.date} className="list-row mp-mock-row">
            <span className="txt">
              <b>{fmtDay(m.date, { day: "numeric", month: "short", year: "numeric" })}</b>
              <span>{pass ? "NCLC 7+ in all four" : `Below 7: ${CORE_SKILLS.filter((s) => (m.nclc[s] ?? 0) < 7).map((s) => skillLabel[s].toLowerCase()).join(", ")}`}</span>
            </span>
            <span className="mp-nclcs">
              {CORE_SKILLS.map((s) => {
                const n = m.nclc[s];
                return (
                  <span key={s} className={`mp-nclc ${n === undefined ? "" : n >= 7 ? "ok" : "no"}`} data-skill={s} title={`${skillLabel[s]}: NCLC ${n === undefined ? "—" : fmtNclc(n)}`}>
                    <Icon name={s} size={12} />
                    <b className="num">{n === undefined ? "—" : fmtNclc(n)}</b>
                  </span>
                );
              })}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ---------- the run ----------

function Runner({ run }: { run: MockRun }) {
  const idx = STAGES.indexOf(run.stage);
  const quit = () => {
    if (run.stage === "results" || confirm("Quit the mock? This attempt won't be scored.")) {
      clearRun();
      go("mock");
    }
  };
  return (
    <div className="page mp-run">
      <header className="mp-bar">
        <div className="mp-steps-mini" aria-label={`Section ${Math.min(idx + 1, 4)} of 4`}>
          {(["listening", "reading", "writing", "speaking"] as const).map((s, i) => (
            <span key={s} data-skill={s} className={i < idx ? "done" : i === idx ? "on" : ""}>
              <Icon name={s} size={14} />
              <span className="sr-only">{skillLabel[s]}</span>
            </span>
          ))}
        </div>
        <button className="btn ghost" onClick={quit}>{run.stage === "results" ? "Close" : "Quit"}</button>
      </header>
      {run.stage === "listening" || run.stage === "reading" ? (
        <McqSection key={run.stage} run={run} skill={run.stage} />
      ) : run.stage === "writing" ? (
        <WritingSection run={run} />
      ) : run.stage === "speaking" ? (
        <SpeakingSection run={run} />
      ) : run.stage === "assess" ? (
        <Assess run={run} />
      ) : (
        <Results run={run} />
      )}
    </div>
  );
}

function SectionIntro({ skill, title, lines, onBegin }: { skill: CoreSkill; title: string; lines: string[]; onBegin: () => void }) {
  return (
    <section className="focus" data-skill={skill}>
      <div className="focus-label"><Icon name={skill} size={14} /> {skillLabel[skill]}</div>
      <div className="focus-title">{title}</div>
      <ul className="mp-rules">{lines.map((l) => <li key={l}>{l}</li>)}</ul>
      <div className="focus-actions">
        <button className="btn primary lg" style={{ flex: 1 }} onClick={onBegin}><Icon name="play" size={16} /> Begin</button>
      </div>
    </section>
  );
}

const begin = (stage: Stage) =>
  patchRun((r) => {
    const now = Date.now();
    const min = SECTION_MIN[stage];
    return { began: { ...r.began, [stage]: now }, deadline: min ? now + min * 60_000 : undefined, progress: [] };
  });

function McqSection({ run, skill }: { run: MockRun; skill: "listening" | "reading" }) {
  const ids = skill === "listening" ? run.listeningIds : run.readingIds;
  const items = useMemo(() => {
    const byId = new Map(tcfItems.map((i) => [i.id, i]));
    return ids.flatMap((id) => byId.get(id) ?? []);
  }, [ids.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!run.began[skill])
    return (
      <SectionIntro
        skill={skill}
        title={skill === "listening" ? `Listening · ${items.length} questions · 35 min` : `Reading · ${items.length} questions · 60 min`}
        lines={
          skill === "listening"
            ? ["Headphones on. Each recording plays once, automatically.", "Answer, then move on. There's no going back.", "When the time runs out, unanswered questions count as wrong."]
            : ["Questions get harder as you go. Don't spend 5 minutes on one.", "Forward only. Unanswered questions count as wrong.", "Pace: about 1½ minutes a question."]
        }
        onBegin={() => begin(skill)}
      />
    );

  const finish = (answers: McqAnswer[]) =>
    patchRun((r) => {
      const sec = Math.round((Date.now() - (r.began[skill] ?? Date.now())) / 1000);
      return skill === "listening"
        ? { listening: answers, listeningSec: sec, stage: "reading", progress: [], deadline: undefined }
        : { reading: answers, readingSec: sec, stage: "writing", progress: [], deadline: undefined };
    });

  return (
    <McqRunner
      key={skill}
      items={items}
      mode="exam"
      deadline={run.deadline}
      initialAnswers={run.progress}
      onProgress={(a) => patchRun(() => ({ progress: a }))}
      onFinish={finish}
    />
  );
}

function WritingSection({ run }: { run: MockRun }) {
  const now = useNow();
  const [tab, setTab] = useState(0);
  const prompts = run.writingPrompts.map((id) => writingPrompts.find((p) => p.id === id)).filter(Boolean) as WritingPrompt[];

  if (!run.began.writing)
    return (
      <SectionIntro
        skill="writing"
        title="Writing · 3 tasks · 60 min"
        lines={[
          "One clock for all three tasks. Suggested split: 10 / 20 / 30 min.",
          "Word limits: task 1 60–120, task 2 120–150, task 3 120–180. Stay inside them.",
          "No spellchecker, no dictionary. Save each task when it's done.",
        ]}
        onBegin={() => begin("writing")}
      />
    );

  const saved = run.writingIds.filter((x) => x !== null).length;
  const over = !!run.deadline && now >= run.deadline;
  const next = () => {
    if (saved < 3 && !over && !confirm(`${3 - saved} task${3 - saved > 1 ? "s aren't" : " isn't"} saved yet and will score 0. Move on to speaking?`)) return;
    patchRun(() => ({ stage: "speaking", deadline: undefined }));
  };

  return (
    <>
      <div className="mp-section-head">
        <h2>Writing</h2>
        {run.deadline && <span className={`tag num ${run.deadline - now < 5 * 60_000 ? "bad" : ""}`} role="timer"><Icon name="clock" size={12} /> {over ? "Time's up" : fmtClock(run.deadline - now)}</span>}
      </div>
      <div className="seg" role="tablist" aria-label="Writing tasks">
        {prompts.map((p, i) => (
          <button key={p.id} role="tab" aria-pressed={tab === i} aria-selected={tab === i} onClick={() => setTab(i)}>
            Task {p.task} {run.writingIds[i] !== null && <Icon name="check" size={14} />}
          </button>
        ))}
      </div>
      {prompts.map((p, i) => (
        <div key={p.id} hidden={tab !== i}>
          {run.writingIds[i] !== null ? (
            // Already saved (maybe before the app was reopened): don't remount the editor, it would start empty.
            <section className="card">
              <p className="empty" style={{ padding: 12 }}><Icon name="check" size={16} /> Task {p.task} is saved. You'll mark it after the speaking section.</p>
            </section>
          ) : (
          <WritingTask
            prompt={p}
            context="mock"
            today={run.date}
            deadline={run.deadline}
            showTimer={false}
            assess={false}
            onSaved={(id) => {
              patchRun((r) => ({ writingIds: r.writingIds.map((x, k) => (k === i ? id : x)) }));
              if (i < 2) setTab(i + 1);
            }}
          />
          )}
        </div>
      ))}
      {over && saved < 3 && <div className="notice bad"><Icon name="alert" size={18} /><span>Time's up. Save what you have, then move on. On the real exam, the paper is taken away now.</span></div>}
      <button className={`btn lg block ${saved === 3 || over ? "primary" : "soft"}`} onClick={next}>
        {saved === 3 ? "All three saved: go to speaking" : `Finish writing (${saved}/3 saved)`} <Icon name="chevronR" size={16} />
      </button>
    </>
  );
}

function SpeakingSection({ run }: { run: MockRun }) {
  const prompts = run.speakingPrompts.map((id) => speakingPrompts.find((p) => p.id === id)).filter(Boolean) as SpeakingPrompt[];
  if (!run.began.speaking)
    return (
      <SectionIntro
        skill="speaking"
        title="Speaking · 3 tasks"
        lines={[
          "You'll be recorded. Allow the microphone when asked.",
          "Task 1: 2 min interview. Task 2: 2 min prep, 3½ min role-play. Task 3: 4½ min opinion.",
          "Speak the whole time. Silence is what costs points.",
        ]}
        onBegin={() => begin("speaking")}
      />
    );
  const i = Math.min(run.speakingIdx, prompts.length - 1);
  const p = prompts[i];
  const advance = (id: number | null) =>
    patchRun((r) => {
      const recordingIds = r.recordingIds.map((x, k) => (k === r.speakingIdx ? id : x));
      const speakingIdx = r.speakingIdx + 1;
      return speakingIdx >= 3 ? { recordingIds, speakingIdx, stage: "assess" } : { recordingIds, speakingIdx };
    });
  return (
    <>
      <div className="mp-section-head">
        <h2>Speaking</h2>
        <span className="muted small num">Task {i + 1} of 3</span>
      </div>
      {p && <SpeakingTask key={p.id} prompt={p} context="mock" today={run.date} examMode assess={false} onSaved={(id) => advance(id)} />}
      <button className="btn ghost block" onClick={() => confirm("Skip this task? It scores 0.") && advance(null)}>
        Microphone not working? Skip this task (scores 0)
      </button>
    </>
  );
}

// ---------- self-assessment ----------

type RowRef = { kind: "writing"; row: Writing } | { kind: "speaking"; row: Recording };

function Assess({ run }: { run: MockRun }) {
  const rows = useLiveQuery(async () => {
    const w = await db.writings.bulkGet(run.writingIds.map((x) => x ?? -1));
    const r = await db.recordings.bulkGet(run.recordingIds.map((x) => x ?? -1));
    return { w, r };
  }, [run.writingIds.join(","), run.recordingIds.join(",")]);
  const [marks, setMarks] = useState<Record<string, Record<string, string>>>({});
  const [busy, setBusy] = useState(false);

  if (!rows) return null;
  const list: RowRef[] = [
    ...rows.w.flatMap((row) => (row ? [{ kind: "writing" as const, row }] : [])),
    ...rows.r.flatMap((row) => (row ? [{ kind: "speaking" as const, row }] : [])),
  ];
  const keyOf = (r: RowRef) => `${r.kind}-${r.row.id}`;
  const criteriaOf = (r: RowRef) => (r.kind === "writing" ? WRITING_CRITERIA : SPEAKING_CRITERIA);
  const valueOf = (r: RowRef) => marks[keyOf(r)] ?? r.row.rubric ?? {};
  const needs = (r: RowRef) => r.row.aiScore === undefined; // AI-graded rows are already scored
  const complete = (r: RowRef) => !needs(r) || criteriaOf(r).every((c) => valueOf(r)[c.key]);
  const left = list.filter((r) => !complete(r)).length;

  const finish = async () => {
    setBusy(true);
    for (const r of list) {
      if (!needs(r)) continue;
      const v = valueOf(r);
      const selfScore = rubricTo20(criteriaOf(r).map((c) => v[c.key]));
      if (r.kind === "writing") await db.writings.update(r.row.id!, { selfScore, rubric: v });
      else await db.recordings.update(r.row.id!, { selfScore, rubric: v });
    }
    await saveResults(run);
  };

  return (
    <>
      <div className="mp-section-head"><h2>Mark your writing and speaking</h2></div>
      <div className="notice">
        <Icon name="alert" size={18} />
        <span>Rate each criterion by what's actually on the page or in the recording, not what you meant. NCLC 7 needs B2 (10/20) on average. If unsure between two levels, pick the lower.</span>
      </div>
      {list.length === 0 && <section className="card"><p className="empty">No writing or speaking was saved, so both score 0.</p></section>}
      {list.map((r) => {
        const prompt = r.kind === "writing" ? writingPrompts.find((p) => p.id === r.row.promptId) : speakingPrompts.find((p) => p.id === r.row.promptId);
        const v = valueOf(r);
        const partial = criteriaOf(r).every((c) => v[c.key]) ? rubricTo20(criteriaOf(r).map((c) => v[c.key])) : null;
        return (
          <section key={keyOf(r)} className="card mp-assess" data-skill={r.kind}>
            <div className="mp-assess-head">
              <SkillBadge skill={r.kind} size={32} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <b>{skillLabel[r.kind]} · task {r.row.task}</b>
                <span className="muted small" style={{ display: "block" }}>{prompt?.title ?? r.row.promptId}</span>
              </span>
              {r.row.aiScore !== undefined ? (
                <span className="tag brand num">AI {r.row.aiScore}/20</span>
              ) : partial !== null ? (
                <span className="tag num">{partial}/20</span>
              ) : null}
            </div>
            {r.kind === "writing" ? (
              <>
                <details className="small">
                  <summary>Task</summary>
                  <p lang="fr" style={{ whiteSpace: "pre-wrap" }}>{prompt?.instructions}</p>
                </details>
                <blockquote className="mp-text" lang="fr">{r.row.text || <span className="muted">(empty)</span>}</blockquote>
                <p className="muted tiny num" style={{ margin: 0 }}>{r.row.words} words</p>
              </>
            ) : (
              <>
                <details className="small">
                  <summary>Task</summary>
                  <p lang="fr" style={{ whiteSpace: "pre-wrap" }}>{prompt?.instructions}</p>
                </details>
                <RecordingAudio rec={r.row} />
                {r.row.transcript && <blockquote className="mp-text" lang="fr">{r.row.transcript}</blockquote>}
              </>
            )}
            {needs(r) && <Rubric criteria={criteriaOf(r)} value={v} onChange={(nv) => setMarks((m) => ({ ...m, [keyOf(r)]: nv }))} />}
          </section>
        );
      })}
      <button className="btn primary lg block" disabled={left > 0 || busy} onClick={finish}>
        {left > 0 ? `${left} still to mark` : "See my results"}
      </button>
    </>
  );
}

function RecordingAudio({ rec }: { rec: Recording }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!rec.blob) return;
    const u = URL.createObjectURL(rec.blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [rec.blob]);
  return url ? <audio controls src={url} style={{ width: "100%" }} /> : <p className="muted small">No audio saved.</p>;
}

// ---------- scoring & saving ----------

const mean20 = (xs: number[]) => Math.round((xs.reduce((a, x) => a + x, 0) / 3) * 2) / 2; // 3 tasks; missing = 0

async function saveResults(run: MockRun) {
  const byId = new Map(tcfItems.map((i) => [i.id, i]));
  const L = run.listening ?? [];
  const R = run.reading ?? [];
  const [w, r] = await Promise.all([
    db.writings.bulkGet(run.writingIds.map((x) => x ?? -1)),
    db.recordings.bulkGet(run.recordingIds.map((x) => x ?? -1)),
  ]);
  const score: Record<CoreSkill, number> = {
    listening: levelScore(L),
    reading: levelScore(R),
    writing: mean20(w.map((x) => (x ? x.aiScore ?? x.selfScore ?? 0 : 0))),
    speaking: mean20(r.map((x) => (x ? x.aiScore ?? x.selfScore ?? 0 : 0))),
  };
  const nclc = Object.fromEntries(CORE_SKILLS.map((s) => [s, nclcFor(s, score[s])])) as Record<CoreSkill, number>;

  await db.transaction("rw", [db.attempts, db.estimates], async () => {
    await db.attempts.bulkAdd([
      { date: run.date, kind: "mock", skill: "listening", items: L.map(({ id, level, correct }) => ({ id, level, correct })), score: score.listening, nclc: nclc.listening, durationSec: run.listeningSec ?? 0 },
      { date: run.date, kind: "mock", skill: "reading", items: R.map(({ id, level, correct }) => ({ id, level, correct })), score: score.reading, nclc: nclc.reading, durationSec: run.readingSec ?? 0 },
    ]);
    await db.estimates.bulkAdd(CORE_SKILLS.map((s) => ({ date: run.date, skill: s, nclc: nclc[s], score: score[s], source: "mock" as const })));
  });
  for (const [source, answers] of [["listening", L], ["reading", R]] as const)
    for (const a of answers) {
      const it = byId.get(a.id);
      if (!it) continue;
      await recordAnswer(
        { source, itemId: a.id, prompt: it.q, correct: it.options[it.answer], given: a.chosen === null ? "(no answer)" : it.options[a.chosen] },
        a.correct,
      );
    }
  await patchRun(() => ({ stage: "results", result: { score, nclc } }));
}

// ---------- results ----------

function Results({ run }: { run: MockRun }) {
  if (!run.result) return null;
  const { score, nclc } = run.result;
  const latest = latestBySkill(CORE_SKILLS.map((s, i) => ({ id: i, date: run.date, skill: s, nclc: nclc[s], score: score[s], source: "mock" as const })));
  const ready = readiness(latest);
  const correct = (a?: McqAnswer[]) => (a ? `${a.filter((x) => x.correct).length}/${a.length} right` : "");
  return (
    <>
      <header className="page-head">
        <div>
          <div className="eyebrow">Mock · {fmtDay(run.date, { day: "numeric", month: "long" })}</div>
          <h1 className="title">Résultats<em>.</em></h1>
        </div>
      </header>
      <ReadinessCard latest={latest} ready={ready} title="If this had been the real exam" />
      <div className="mp-results">
        {CORE_SKILLS.map((s) => {
          const n = nclc[s];
          const mcq = s === "listening" || s === "reading";
          return (
            <section key={s} className="card mp-result" data-skill={s}>
              <div className="mp-result-head">
                <SkillBadge skill={s} size={30} />
                <b>{skillLabel[s]}</b>
                <span className={`tag ${n >= 8 ? "good" : n >= 7 ? "warn" : "bad"}`}>
                  <Icon name={n >= 7 ? "check" : "x"} size={12} /> {n >= 8 ? "Safe" : n >= 7 ? "Pass, no margin" : "Below 7"}
                </span>
              </div>
              <div className="mp-result-v num">
                {score[s]}<small>{mcq ? " / 699" : " / 20"}</small>
              </div>
              <div className="small">NCLC <b className="num">{fmtNclc(n)}</b> <span className="muted">{mcq ? `· ${correct(s === "listening" ? run.listening : run.reading)}` : "· self-marked"}</span></div>
              <NclcScale n={n} />
            </section>
          );
        })}
      </div>
      {(run.listeningIds.length < 39 || run.readingIds.length < 39) && (
        <p className="muted tiny" style={{ margin: 0 }}>Mock sections use the app's item bank; if it has fewer than 39 items at some level, the score is based on what was asked.</p>
      )}
      <div className="notice">
        <Icon name="sparkle" size={18} />
        <span>Saved as your current level. Wrong answers are in the mistake bank, and the plan now puts extra time on {ready.weakest ? skillLabel[ready.weakest].toLowerCase() : "your weakest skill"}.</span>
      </div>
      <button className="btn dark lg block" onClick={() => { clearRun(); go("log"); }}>See progress</button>
      <button className="btn ghost block" onClick={() => { clearRun(); go("mock"); }}>Done</button>
    </>
  );
}

/** NCLC 3–10 scale with the pass (7) and safety (8) lines marked. */
export function NclcScale({ n }: { n: number }) {
  const pct = (v: number) => `${(Math.max(0, Math.min(10, v) - 3) / 7) * 100}%`;
  return (
    <div className="mp-scale" role="img" aria-label={`NCLC ${fmtNclc(n)} on a scale of 3 to 10; 7 passes, 8 is the safety margin`}>
      <div className="meter"><i style={{ width: pct(Math.max(3, n)) }} /><b style={{ left: pct(7) }} /><b style={{ left: pct(8) }} /></div>
      <div className="mp-scale-lbl"><span style={{ left: pct(7) }}>7</span><span style={{ left: pct(8) }}>8</span></div>
    </div>
  );
}
