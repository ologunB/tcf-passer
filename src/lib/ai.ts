// AI grading of writing and speaking with Claude, straight from the browser with the user's own key.
import Anthropic from "@anthropic-ai/sdk";
import { getSetting } from "../db";
import { countWords, SPEAKING_TASKS, WRITING_TASKS, type SpeakingPrompt, type WritingPrompt } from "./content";
import { cefrFrom20 } from "./scoring";

export const MODEL = "claude-opus-5";

export interface AiFeedback {
  score20: number;
  cefr: string;
  criteria: { name: string; level: string; comment: string }[];
  strengths: string[];
  improvements: string[];
  corrected: string;
  summary: string;
}

const CEFR = ["A0", "A1", "A2", "B1", "B2", "C1", "C2"];
const strArr = { type: "array", items: { type: "string" } };

export const FEEDBACK_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["score20", "cefr", "criteria", "strengths", "improvements", "corrected", "summary"],
  properties: {
    score20: { type: "number", description: "Official TCF 0–20 score (half points allowed)" },
    cefr: { type: "string", enum: CEFR },
    criteria: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "level", "comment"],
        properties: {
          name: { type: "string" },
          level: { type: "string", enum: CEFR },
          comment: { type: "string", description: "One or two sentences in plain English, with a French example" },
        },
      },
    },
    strengths: strArr,
    improvements: strArr,
    corrected: { type: "string", description: "The learner's text, corrected and lightly improved, in French" },
    summary: { type: "string", description: "Two or three sentences in plain English" },
  },
} as const;

export const SYSTEM_PROMPT = `You are a certified TCF Canada examiner. You grade the "expression écrite" and "expression orale" sections using the France Éducation international (FEI) grid:
- linguistic competence: range of vocabulary, grammatical accuracy, spelling (writing) or pronunciation (speaking);
- pragmatic competence: task completion, coherence and cohesion, development of ideas;
- sociolinguistic competence: register appropriate to the situation (tu/vous, formulas of politeness, letter/message conventions).

Score on the official 0–20 scale: A1 = 1–3, A2 = 4–5, B1 = 6–9, B2 = 10–13, C1 = 14–15, C2 = 16–20. Use 0 only for a blank or unusable answer.

Be strict and honest. The learner needs NCLC 7 (10/20) for Canadian immigration and is harmed by flattery: grade what is on the page, not what they meant. A word count outside the required range must be marked down clearly (far outside the range, or off-topic, can mean "A1 non atteint"). An answer that ignores part of the instructions loses marks for task completion. For task 3 writing, both documents must be summarised before the opinion.

The learner is a beginner whose first language is English. Write every comment, strength, improvement and the summary in plain, encouraging but direct English, and quote short French examples from their answer with the correction. Give concrete, actionable improvements (at most 5, most important first). Give one entry in "criteria" per criterion of the grid you actually assessed (task completion, coherence & cohesion, vocabulary, grammar, spelling or pronunciation, register). "corrected" is their answer rewritten in correct, natural French at roughly their level plus one step, keeping their ideas.`;

// ---------- prompt building (pure) ----------

export function buildWritingMessage(prompt: WritingPrompt, text: string): string {
  const rule = WRITING_TASKS[prompt.task];
  const words = countWords(text);
  const inRange = words >= rule.min && words <= rule.max;
  return [
    `EXPRESSION ÉCRITE — Tâche ${prompt.task} (${rule.label}).`,
    `Consigne : ${prompt.instructions}`,
    ...(prompt.docs ? prompt.docs.map((d, i) => `Document ${i + 1} : ${d.replace(/^Document \d+\s*[—–-]\s*/, "")}`) : []),
    `Required length: ${rule.min}–${rule.max} words.`,
    `Actual word count: ${words} words (${inRange ? "within the range" : words < rule.min ? `TOO SHORT by ${rule.min - words}` : `TOO LONG by ${words - rule.max}`}).`,
    "",
    "Candidate's answer:",
    "<answer>",
    text.trim() || "(blank)",
    "</answer>",
  ].join("\n");
}

export function buildSpeakingMessage(prompt: SpeakingPrompt, transcript: string, durationSec?: number): string {
  const t = SPEAKING_TASKS[prompt.task];
  const kind = { 1: "guided interview (the examiner asks the candidate about themselves)", 2: "interactive role-play: the CANDIDATE must ask the examiner questions to get information", 3: "the candidate gives and defends an opinion" }[prompt.task];
  return [
    `EXPRESSION ORALE — Tâche ${prompt.task}: ${kind}.`,
    `Speaking time: ${Math.round(t.speakSec / 6) / 10} min${t.prepSec ? ` after ${t.prepSec / 60} min of preparation` : ", no preparation"}.${durationSec ? ` The candidate actually spoke for ${durationSec} s.` : ""}`,
    `Consigne : ${prompt.instructions}`,
    ...(prompt.questions?.length ? [`${prompt.task === 1 ? "Examiner questions" : "Suggested questions"} : ${prompt.questions.join(" / ")}`] : []),
    "",
    "You only have a transcript (from browser speech recognition or typed by the learner), so it may contain recognition errors and has no punctuation you can trust. You cannot hear the audio: do NOT grade pronunciation — for that criterion use your best guess from fluency cues and say plainly that it wasn't assessed. Judge the amount of speech against the time allowed; a very short transcript means the task was not really completed.",
    `Transcript word count: ${countWords(transcript)}.`,
    "",
    "<transcript>",
    transcript.trim() || "(empty)",
    "</transcript>",
  ].join("\n");
}

// ---------- response validation (pure) ----------

const isStr = (v: unknown): v is string => typeof v === "string";

export function parseFeedback(raw: string): AiFeedback {
  let d: Record<string, unknown>;
  try {
    d = JSON.parse(raw);
  } catch {
    throw new Error("The AI's answer wasn't readable. Try again.");
  }
  const bad = () => new Error("The AI's answer was incomplete. Try again.");
  if (!d || typeof d !== "object") throw bad();
  const score = Number(d.score20);
  if (!Number.isFinite(score)) throw bad();
  if (!Array.isArray(d.criteria) || !Array.isArray(d.strengths) || !Array.isArray(d.improvements)) throw bad();
  if (!isStr(d.corrected) || !isStr(d.summary)) throw bad();
  const score20 = Math.round(Math.min(20, Math.max(0, score)) * 2) / 2;
  const criteria = (d.criteria as unknown[]).flatMap((c) => {
    const o = c as Record<string, unknown>;
    return o && isStr(o.name) && isStr(o.level) ? [{ name: o.name, level: CEFR.includes(o.level) ? o.level : "?", comment: isStr(o.comment) ? o.comment : "" }] : [];
  });
  return {
    score20,
    // Keep the level consistent with the score so it matches NCLC.
    cefr: cefrFrom20(score20),
    criteria,
    strengths: (d.strengths as unknown[]).filter(isStr),
    improvements: (d.improvements as unknown[]).filter(isStr),
    corrected: d.corrected,
    summary: d.summary,
  };
}

export function friendlyError(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError) return "Your API key was rejected — check it in Settings.";
  if (e instanceof Anthropic.RateLimitError) return "Too many requests — try again in a minute.";
  if (e instanceof Anthropic.APIConnectionError) return "No connection — AI grading needs internet.";
  if (e instanceof Anthropic.APIError) return `AI grading failed (${e.status ?? "error"}): ${e.message}`;
  return e instanceof Error ? e.message : "AI grading failed.";
}

// ---------- API ----------

async function getApiKey(): Promise<string> {
  const k = await getSetting<unknown>("anthropicKey", "");
  return typeof k === "string" ? k.trim() : "";
}

export const hasApiKey = async () => !!(await getApiKey());

async function grade(userMessage: string): Promise<AiFeedback> {
  const apiKey = await getApiKey();
  if (!apiKey) throw new Error("Add your Anthropic API key in Settings to use AI grading.");
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  let res: Anthropic.Beta.BetaMessage;
  try {
    res = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      thinking: { type: "adaptive" },
      output_config: { format: { type: "json_schema", schema: FEEDBACK_SCHEMA as unknown as Record<string, unknown> } },
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });
  } catch (e) {
    throw new Error(friendlyError(e));
  }
  if (res.stop_reason === "refusal") throw new Error("The AI declined to grade this answer. Try rewording it or use the self-assessment.");
  if (res.stop_reason === "max_tokens") throw new Error("The AI's feedback was cut off. Try again.");
  const text = res.content.find((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text");
  if (!text) throw new Error("The AI sent no feedback. Try again.");
  return parseFeedback(text.text);
}

export const gradeWriting = (prompt: WritingPrompt, text: string) => grade(buildWritingMessage(prompt, text));

export const gradeSpeaking = (prompt: SpeakingPrompt, transcript: string, durationSec?: number) =>
  grade(buildSpeakingMessage(prompt, transcript, durationSec));

/** Narrow saved `ai` JSON back to feedback (older rows, imports). */
export const asFeedback = (v: unknown): AiFeedback | null => {
  try {
    return v && typeof v === "object" ? parseFeedback(JSON.stringify(v)) : null;
  } catch {
    return null;
  }
};
