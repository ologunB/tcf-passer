import { useMemo, useRef, useState } from "react";
import { recordAnswer, type Mistake } from "../db";
import { checkTyped } from "../lib/conjugation";
import { shuffled } from "../lib/scoring";
import { Icon } from "./Icon";

/** A grammar or conjugation question, choice or typed. */
export interface QuizItem {
  id: string;
  source: Extract<Mistake["source"], "grammar" | "conjugation">;
  label?: string; // topic
  q: string;
  options?: string[];
  answer: number | string;
  accept?: string[];
  explain: string;
}

const ACCENTS = ["é", "è", "ê", "à", "â", "ç", "î", "ô", "û", "ù", "ë", "œ"];

export function Quiz({ items, onFinish }: { items: QuizItem[]; onFinish: (right: number, total: number) => void }) {
  const [i, setI] = useState(0);
  const [right, setRight] = useState(0);
  const [typed, setTyped] = useState("");
  const [picked, setPicked] = useState<number | null>(null);
  const [result, setResult] = useState<"right" | "accents" | "wrong" | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const item = items[i];
  const view = useMemo(() => (item?.options ? shuffled(item.options, item.id) : null), [item]);
  if (!item) return null;

  const correctText = typeof item.answer === "number" ? item.options![item.answer] : item.answer;

  const check = async (given: string, ok: boolean, verdict: "right" | "accents" | "wrong") => {
    setResult(verdict);
    if (ok) setRight((r) => r + 1);
    await recordAnswer({ source: item.source, itemId: item.id, prompt: item.q, correct: correctText, given }, ok);
  };

  const pick = (k: number) => {
    if (result) return;
    setPicked(k);
    const orig = view!.order[k];
    check(item.options![orig], orig === item.answer, orig === item.answer ? "right" : "wrong");
  };

  const submitTyped = () => {
    if (result || !typed.trim()) return;
    const v = checkTyped(typed, [String(item.answer), ...(item.accept ?? [])]);
    check(typed.trim(), v === "right", v);
  };

  const next = () => {
    if (i + 1 >= items.length) return onFinish(right, items.length);
    setI(i + 1);
    setTyped("");
    setPicked(null);
    setResult(null);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const insert = (ch: string) => {
    const el = inputRef.current;
    if (!el) return setTyped((t) => t + ch);
    const s = el.selectionStart ?? typed.length;
    const e = el.selectionEnd ?? typed.length;
    setTyped(typed.slice(0, s) + ch + typed.slice(e));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(s + 1, s + 1);
    });
  };

  return (
    <div className="mcq" data-skill="grammar">
      <div className="mcq-top">
        <span className="small num">Question <b>{i + 1}</b> / {items.length}</span>
        {item.label && <span className="tag skill">{item.label}</span>}
      </div>
      <div className="mcq-progress" aria-hidden="true"><i style={{ width: `${(i / items.length) * 100}%` }} /></div>
      <div className="mcq-q" lang="fr">{item.q}</div>

      {view ? (
        <div className="mcq-options" role="radiogroup">
          {view.items.map((opt, k) => {
            const orig = view.order[k];
            const state = result ? (orig === item.answer ? "right" : k === picked ? "wrong" : "") : "";
            return (
              <button key={k} role="radio" aria-checked={picked === k} className={`mcq-opt ${state}`} onClick={() => pick(k)} lang="fr">
                <span className="mcq-letter">{"ABCD"[k]}</span>
                <span>{opt}</span>
                {state === "right" && <Icon name="check" size={18} stroke={2.6} />}
                {state === "wrong" && <Icon name="x" size={18} stroke={2.6} />}
              </button>
            );
          })}
        </div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          <input
            ref={inputRef}
            className={`answer-input ${result === "right" ? "right" : result ? "wrong" : ""}`}
            type="text"
            lang="fr"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            autoFocus
            value={typed}
            readOnly={!!result}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (result ? next() : submitTyped())}
            placeholder="Type your answer"
            aria-label="Your answer"
          />
          {!result && (
            <div className="accents" aria-label="Accented letters">
              {ACCENTS.map((a) => (
                <button key={a} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => insert(a)}>{a}</button>
              ))}
            </div>
          )}
        </div>
      )}

      {result && (
        <div className={`notice ${result === "right" ? "" : result === "accents" ? "warn" : "bad"}`}>
          <Icon name={result === "right" ? "check" : "alert"} size={18} />
          <span>
            <b>{result === "right" ? "Correct." : result === "accents" ? `Almost: check the accents → ${correctText}.` : `Answer: ${correctText}.`}</b> {item.explain}
          </span>
        </div>
      )}

      {!result && !view ? (
        <button className="btn dark lg block" onClick={submitTyped} disabled={!typed.trim()}>Check</button>
      ) : (
        <button className="btn dark lg block" onClick={next} disabled={!result}>
          {i + 1 === items.length ? "Finish" : "Next"} <Icon name="chevronR" size={18} />
        </button>
      )}
    </div>
  );
}
