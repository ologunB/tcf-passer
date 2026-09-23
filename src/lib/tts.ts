// French text-to-speech with the browser's built-in voices.
// Lines starting "A:" / "B:" are read by two different voices (or the same voice at two pitches).

let voicesCache: SpeechSynthesisVoice[] = [];
const loadVoices = () => (voicesCache = typeof speechSynthesis === "undefined" ? [] : speechSynthesis.getVoices());
if (typeof speechSynthesis !== "undefined") {
  loadVoices();
  speechSynthesis.addEventListener?.("voiceschanged", loadVoices);
}

export const ttsAvailable = () => typeof speechSynthesis !== "undefined";

export function frenchVoices(): SpeechSynthesisVoice[] {
  const fr = voicesCache.filter((v) => v.lang.toLowerCase().startsWith("fr"));
  // Prefer France/Canada French and higher-quality voices first.
  const rank = (v: SpeechSynthesisVoice) =>
    (/premium|enhanced|natural|google/i.test(v.name) ? 0 : 2) + (v.lang === "fr-FR" || v.lang === "fr-CA" ? 0 : 1);
  return fr.sort((a, b) => rank(a) - rank(b));
}

export function stop() {
  if (ttsAvailable()) speechSynthesis.cancel();
}

function utter(text: string, voice: SpeechSynthesisVoice | undefined, rate: number, pitch: number) {
  return new Promise<void>((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = voice?.lang ?? "fr-FR";
    if (voice) u.voice = voice;
    u.rate = rate;
    u.pitch = pitch;
    // Some browsers never fire onend (no voice installed, tab in background): resolve after a generous estimate.
    const fallback = setTimeout(resolve, 2500 + (text.length * 90) / rate);
    const done = () => {
      clearTimeout(fallback);
      resolve();
    };
    u.onend = done;
    u.onerror = done;
    speechSynthesis.speak(u);
  });
}

/** Speak French text. Resolves when finished (or immediately if TTS isn't available). */
export async function speak(text: string, { rate = 0.95 }: { rate?: number } = {}) {
  if (!ttsAvailable()) return;
  stop();
  const voices = frenchVoices();
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const dialogue = lines.some((l) => /^[AB]:/.test(l));
  for (const line of lines) {
    const who = line.startsWith("B:") ? 1 : 0;
    const clean = line.replace(/^[AB]:\s*/, "");
    const v = dialogue ? voices[who] ?? voices[0] : voices[0];
    const pitch = dialogue && !voices[1] && who === 1 ? 0.8 : 1;
    await utter(clean, v, rate, pitch);
    if (dialogue) await new Promise((r) => setTimeout(r, 250));
  }
}

/** Slower for beginner levels, closer to natural speed for B2+. */
export const rateForLevel = (level: string) => ({ A1: 0.8, A2: 0.88, B1: 0.95, B2: 1, C1: 1.05, C2: 1.08 })[level] ?? 1;
