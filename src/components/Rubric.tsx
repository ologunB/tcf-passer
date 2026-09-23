import { useId } from "react";
import type { AiFeedback } from "../lib/ai";
import { cefrFrom20, fmtNclc, nclcFor } from "../lib/scoring";
import "../pages/writing-speaking.css";

export interface Criterion {
  key: string;
  label: string;
  hint: string;
}

const LV = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;

export const WRITING_CRITERIA: Criterion[] = [
  { key: "task", label: "Task completion", hint: "Did you do everything asked, in the word range?" },
  { key: "coherence", label: "Organisation & linking", hint: "Paragraphs, logical order, linking words" },
  { key: "vocabulary", label: "Vocabulary", hint: "Range and precision of words" },
  { key: "grammar", label: "Grammar", hint: "Tenses, agreement, sentence structure" },
  { key: "spelling", label: "Spelling & register", hint: "Accents, spelling, tu/vous, polite formulas" },
];

export const SPEAKING_CRITERIA: Criterion[] = [
  { key: "interaction", label: "Task completion & interaction", hint: "Did you answer / ask / argue as the task wants?" },
  { key: "fluency", label: "Fluency", hint: "Speaking without long pauses, keeping going" },
  { key: "pronunciation", label: "Pronunciation", hint: "Sounds, liaisons, being easy to understand" },
  { key: "vocabulary", label: "Vocabulary", hint: "Range and precision of words" },
  { key: "grammar", label: "Grammar", hint: "Tenses, agreement, sentence structure" },
];

/** What each CEFR level looks like for a given criterion, in one plain-English line. */
const DESCRIPTORS: Record<string, [string, string, string, string, string, string]> = {
  task: [
    "Only a few words or set phrases; much of the task is missing or off-topic.",
    "Covers the main point in simple sentences; some parts missing or too short.",
    "Does every part of the task in the word range, with simple details.",
    "Does every part fully and precisely, with relevant details and examples.",
    "Complete, well-judged and convincing; nothing irrelevant.",
    "Fully achieves the purpose with the ease of an expert writer.",
  ],
  coherence: [
    "Isolated words or sentences, linked only by « et ».",
    "Short sentences linked with « et, mais, parce que ».",
    "A clear sequence of points with common connectors (d'abord, ensuite, donc).",
    "Clear paragraphs and a range of connectors (cependant, en revanche, par conséquent).",
    "Well-structured, smooth text; linking is varied and natural.",
    "Flawless structure that guides the reader effortlessly.",
  ],
  vocabulary: [
    "Very basic words about yourself; frequent gaps.",
    "Everyday words for familiar topics; lots of repetition.",
    "Enough words for most everyday topics, with some circumlocution.",
    "Good range for general topics; varies words, few gaps.",
    "Broad, precise vocabulary including idioms.",
    "Very wide, nuanced vocabulary used with total precision.",
  ],
  grammar: [
    "Very limited, memorised structures; many errors.",
    "Simple structures (présent, passé composé) with basic mistakes.",
    "Common structures fairly accurate; errors don't block meaning.",
    "Good control incl. subjonctif, relative pronouns; errors are rare and minor.",
    "Consistently accurate complex grammar; errors are hard to spot.",
    "Complete grammatical control, even in complex forms.",
  ],
  spelling: [
    "Spelling often makes words hard to recognise; register ignored.",
    "Familiar words spelled mostly right; tu/vous not always right.",
    "Spelling and accents mostly correct; appropriate tu/vous and simple formulas.",
    "Accurate spelling and punctuation; register fits the reader well.",
    "Spelling and register are consistently accurate and appropriate.",
    "Flawless spelling; register adapted with subtlety.",
  ],
  interaction: [
    "Answers only very simple questions with single words or phrases.",
    "Handles short exchanges; asks or answers simple questions with help.",
    "Completes the task: answers, asks the needed questions, gives reasons.",
    "Takes an active part, asks follow-up questions, argues a point clearly.",
    "Handles the task fluently and flexibly, reacting to anything.",
    "Effortless, natural interaction with full control of the situation.",
  ],
  fluency: [
    "Very short, isolated phrases with many long pauses.",
    "Short phrases; pauses, false starts and reformulation are obvious.",
    "Keeps going comprehensibly, with pauses to plan and repair.",
    "Speaks at a fairly even pace; few long pauses.",
    "Fluent and spontaneous, almost effortless.",
    "Natural, effortless flow like an educated native speaker.",
  ],
  pronunciation: [
    "Hard to understand, even for a listener used to learners.",
    "Clear enough to be understood with effort; strong accent.",
    "Generally clear; accent noticeable, occasional mispronunciations.",
    "Clear and natural; accent doesn't get in the way.",
    "Clear intonation and stress used to express meaning.",
    "Full control of sounds and intonation for fine shades of meaning.",
  ],
};
const GENERIC = ["Beginner", "Elementary", "Intermediate", "Upper intermediate (NCLC 7 target)", "Advanced", "Mastery"];

export function Rubric({ criteria, value, onChange }: { criteria: Criterion[]; value: Record<string, string>; onChange(v: Record<string, string>): void }) {
  const uid = useId();
  return (
    <div className="ws-rubric">
      {criteria.map((c) => {
        const cur = value[c.key];
        const i = LV.indexOf(cur as (typeof LV)[number]);
        return (
          <div key={c.key} className="ws-crit" role="group" aria-labelledby={`${uid}-${c.key}`}>
            <div className="ws-crit-head">
              <b id={`${uid}-${c.key}`}>{c.label}</b>
              <span className="muted tiny">{c.hint}</span>
            </div>
            <div className="seg ws-levels">
              {LV.map((l) => (
                <button key={l} type="button" aria-pressed={cur === l} aria-label={`${c.label}: ${l}`} onClick={() => onChange({ ...value, [c.key]: l })}>
                  {l}
                </button>
              ))}
            </div>
            <div className="ws-desc small">
              {i >= 0 ? (DESCRIPTORS[c.key]?.[i] ?? GENERIC[i]) : <span className="muted">Pick the level that best matches your answer.</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function ScoreLine({ score, skill, label }: { score: number; skill: "writing" | "speaking"; label: string }) {
  const nclc = nclcFor(skill, score);
  const tone = nclc >= 7 ? "good" : nclc >= 5 ? "warn" : "bad";
  return (
    <div className="ws-score">
      <div>
        <div className="eyebrow">{label}</div>
        <div className="ws-score-v num">{score}<small>/20</small></div>
      </div>
      <div className="ws-score-tags">
        <span className="tag brand">{cefrFrom20(score)}</span>
        <span className={`tag ${tone}`}>NCLC {fmtNclc(nclc)}</span>
        {nclc < 7 && <span className="muted tiny">Target: 10/20 = NCLC 7</span>}
      </div>
    </div>
  );
}

export function Feedback({ fb, skill }: { fb: AiFeedback; skill: "writing" | "speaking" }) {
  return (
    <div className="ws-fb">
      <ScoreLine score={fb.score20} skill={skill} label="AI examiner" />
      {fb.summary && <p className="ws-fb-summary">{fb.summary}</p>}
      {!!fb.criteria.length && (
        <ul className="ws-fb-crit">
          {fb.criteria.map((c, i) => (
            <li key={i}>
              <div className="ws-crit-head"><b>{c.name}</b><span className="tag">{c.level}</span></div>
              {c.comment && <p>{c.comment}</p>}
            </li>
          ))}
        </ul>
      )}
      {!!fb.strengths.length && (
        <div>
          <div className="ws-fb-h good">What went well</div>
          <ul className="ws-bullets">{fb.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul>
        </div>
      )}
      {!!fb.improvements.length && (
        <div>
          <div className="ws-fb-h warn">Fix these next</div>
          <ol className="ws-bullets">{fb.improvements.map((s, i) => <li key={i}>{s}</li>)}</ol>
        </div>
      )}
      {fb.corrected && (
        <div>
          <div className="ws-fb-h">Corrected version</div>
          <div className="ws-corrected" lang="fr">{fb.corrected}</div>
        </div>
      )}
    </div>
  );
}
