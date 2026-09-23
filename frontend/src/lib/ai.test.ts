import { beforeEach, describe, expect, it, vi } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import type { SpeakingPrompt, WritingPrompt } from "./content";

const h = vi.hoisted(() => ({ key: "sk-test", gkey: "", provider: "", create: vi.fn(), opts: [] as unknown[] }));

vi.mock("../db", () => ({
  getSetting: async (k: string, fb: unknown) =>
    (k === "anthropicKey" ? h.key : k === "geminiKey" ? h.gkey : k === "aiProvider" ? h.provider : "") || fb,
}));
vi.mock("@anthropic-ai/sdk", async (orig) => {
  const actual = (await orig()) as { default: typeof Anthropic };
  class Mock extends actual.default {
    constructor(o: ConstructorParameters<typeof Anthropic>[0]) {
      super(o);
      h.opts.push(o);
      (this as unknown as { beta: unknown }).beta = { messages: { create: h.create } };
    }
  }
  return { ...actual, default: Mock };
});

const { buildSpeakingMessage, buildWritingMessage, friendlyError, gradeSpeaking, gradeWriting, hasApiKey, parseFeedback, asFeedback, getProvider, geminiText, GEMINI_MODELS } = await import("./ai");

const w1: WritingPrompt = { id: "W1-x", task: 1, theme: "t", level: "A2", title: "x", instructions: "Écrivez un message à un ami." };
const w3: WritingPrompt = { id: "W3-x", task: 3, theme: "t", level: "B2", title: "x", instructions: "Comparez.", docs: ["Document 1 — Pour.", "Document 2 — Contre."] };
const s2: SpeakingPrompt = { id: "S2-x", task: 2, theme: "t", level: "B1", title: "x", instructions: "Posez des questions.", questions: ["Quel est le prix ?"] };

const good = {
  score20: 11.3,
  cefr: "B1",
  criteria: [{ name: "Grammar", level: "B2", comment: "ok" }, { name: "bad" }],
  strengths: ["a", 3],
  improvements: ["b"],
  corrected: "Bonjour.",
  summary: "Fine.",
};
const reply = (o: unknown, stop_reason = "end_turn") => ({ stop_reason, content: [{ type: "thinking", thinking: "" }, { type: "text", text: JSON.stringify(o) }] });

describe("buildWritingMessage", () => {
  it("includes instructions, limits and the real word count", () => {
    const m = buildWritingMessage(w1, "Salut Marie, je t'invite samedi.");
    expect(m).toContain("Tâche 1");
    expect(m).toContain("Écrivez un message à un ami.");
    expect(m).toContain("60–120 words");
    expect(m).toContain("Actual word count: 5 words (TOO SHORT by 55)");
    expect(m).toContain("Salut Marie");
  });
  it("includes both task 3 documents and flags too-long answers", () => {
    const m = buildWritingMessage(w3, "mot ".repeat(200));
    expect(m).toContain("Document 1 : Pour.");
    expect(m).toContain("Document 2 : Contre.");
    expect(m).toContain("TOO LONG by 20");
  });
  it("marks blank answers", () => {
    expect(buildWritingMessage(w1, "  ")).toContain("(blank)");
  });
});

describe("buildSpeakingMessage", () => {
  it("explains the role-play, timing, questions and the transcript limitation", () => {
    const m = buildSpeakingMessage(s2, "bonjour quel est le prix", 95);
    expect(m).toContain("CANDIDATE must ask");
    expect(m).toContain("3.5 min after 2 min of preparation");
    expect(m).toContain("spoke for 95 s");
    expect(m).toContain("Quel est le prix ?");
    expect(m).toContain("do NOT grade pronunciation");
    expect(m).toContain("Transcript word count: 5");
  });
});

describe("parseFeedback", () => {
  it("validates, rounds the score and derives the level from it", () => {
    const f = parseFeedback(JSON.stringify(good));
    expect(f.score20).toBe(11.5);
    expect(f.cefr).toBe("B2");
    expect(f.criteria).toEqual([{ name: "Grammar", level: "B2", comment: "ok" }]);
    expect(f.strengths).toEqual(["a"]);
  });
  it("clamps out-of-range scores", () => {
    expect(parseFeedback(JSON.stringify({ ...good, score20: 27 })).score20).toBe(20);
    expect(parseFeedback(JSON.stringify({ ...good, score20: -2 })).cefr).toBe("A0");
  });
  it("rejects malformed answers", () => {
    expect(() => parseFeedback("not json")).toThrow(/readable/);
    expect(() => parseFeedback(JSON.stringify({ ...good, score20: "x" }))).toThrow(/incomplete/);
    expect(() => parseFeedback(JSON.stringify({ ...good, criteria: null }))).toThrow(/incomplete/);
    expect(asFeedback({ nope: 1 })).toBeNull();
  });
});

describe("grading calls", () => {
  beforeEach(() => {
    h.key = "sk-test";
    h.create.mockReset();
    h.opts.length = 0;
  });

  it("sends the right request and returns parsed feedback", async () => {
    h.create.mockResolvedValue(reply(good));
    const f = await gradeWriting(w1, "Salut !");
    expect(f.score20).toBe(11.5);
    const req = h.create.mock.calls[0][0];
    expect(req).toMatchObject({ model: "claude-opus-5", max_tokens: 16000, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default", thinking: { type: "adaptive" } });
    expect(req.output_config.format.type).toBe("json_schema");
    expect(req).not.toHaveProperty("temperature");
    expect(req.messages).toHaveLength(1);
    expect(req.messages[0].role).toBe("user");
    expect(h.opts[0]).toMatchObject({ apiKey: "sk-test", dangerouslyAllowBrowser: true });
  });

  it("handles refusals before reading content", async () => {
    h.create.mockResolvedValue({ stop_reason: "refusal", content: [] });
    await expect(gradeSpeaking(s2, "bonjour")).rejects.toThrow(/declined/);
  });

  it("needs a key", async () => {
    h.key = "";
    expect(await hasApiKey()).toBe(false);
    await expect(gradeWriting(w1, "x")).rejects.toThrow(/Settings/);
    expect(h.create).not.toHaveBeenCalled();
  });

  it("turns SDK errors into plain messages", async () => {
    h.create.mockRejectedValue(new Anthropic.AuthenticationError(401, {}, "bad key", new Headers()));
    await expect(gradeWriting(w1, "x")).rejects.toThrow("Your API key was rejected — check it in Settings.");
    expect(friendlyError(new Anthropic.RateLimitError(429, {}, "slow", new Headers()))).toMatch(/Too many requests/);
    expect(friendlyError(new Anthropic.APIConnectionError({ message: "offline" }))).toMatch(/No connection/);
    expect(friendlyError(new Anthropic.InternalServerError(500, {}, "boom", new Headers()))).toMatch(/\(500\)/);
  });
});


describe("Gemini (free) provider", () => {
  const ok = (o: unknown) => ({ ok: true, status: 200, json: async () => ({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(o) }] } }] }) });
  const fail = (status: number, message = "x") => ({ ok: false, status, statusText: "", json: async () => ({ error: { code: status, message } }) });
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    h.key = "";
    h.gkey = "AIza-test";
    h.provider = "";
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("is picked when a Gemini key is set, and an explicit choice wins", async () => {
    expect(await getProvider()).toBe("gemini");
    h.key = "sk-x";
    h.provider = "claude";
    expect(await getProvider()).toBe("claude");
    h.provider = "";
    h.gkey = "";
    expect(await getProvider()).toBe("claude");
  });

  it("grades via generateContent with the key in a header and JSON mode", async () => {
    fetchMock.mockResolvedValueOnce(ok(good));
    const f = await gradeWriting(w1, "Salut Marie.");
    expect(f.score20).toBe(11.5);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain(`/v1beta/models/${GEMINI_MODELS[0]}:generateContent`);
    expect(init.headers["x-goog-api-key"]).toBe("AIza-test");
    const body = JSON.parse(init.body);
    expect(body.generationConfig.responseMimeType).toBe("application/json");
    expect(body.systemInstruction.parts[0].text).toContain("JSON Schema");
    expect(body.contents[0].parts[0].text).toContain("Tâche 1");
  });

  it("falls back to the lighter model when the free limit is hit", async () => {
    fetchMock.mockResolvedValueOnce(fail(429)).mockResolvedValueOnce(ok(good));
    await gradeWriting(w1, "x");
    expect(fetchMock.mock.calls[1][0]).toContain(GEMINI_MODELS[1]);
  });

  it("explains the daily limit when both models are exhausted", async () => {
    fetchMock.mockResolvedValue(fail(429));
    await expect(gradeWriting(w1, "x")).rejects.toThrow(/free Gemini limit/);
  });

  it("reports a bad key plainly", async () => {
    fetchMock.mockResolvedValueOnce(fail(400, "API key not valid. Please pass a valid API key."));
    await expect(gradeSpeaking(s2, "bonjour")).rejects.toThrow(/Gemini API key was rejected/);
  });

  it("handles blocks, truncation and fenced JSON", () => {
    expect(() => geminiText({ promptFeedback: { blockReason: "SAFETY" } })).toThrow(/declined/);
    expect(() => geminiText({ candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [{ text: "{" }] } }] })).toThrow(/cut off/);
    expect(geminiText({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: "```json\n{\"a\":1}\n```" }] } }] })).toBe('{"a":1}');
  });

  it("asks for a key when none is set", async () => {
    h.gkey = "";
    expect(await hasApiKey()).toBe(false);
    await expect(gradeWriting(w1, "x")).rejects.toThrow(/free Gemini API key/);
  });
});
