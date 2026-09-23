// Generated conjugation drills. Ids encode everything (`conj:verb:person:tense`) so any drill can be rebuilt
// from its id, e.g. by the mistake bank.

export const PERSONS = ["je", "tu", "il/elle", "nous", "vous", "ils/elles"] as const;

interface Verb {
  inf: string;
  en: string;
  week: number; // plan week it's introduced
  present: [string, string, string, string, string, string];
  pp?: string; // past participle
  aux?: "avoir" | "être";
}

const er = (stem: string): Verb["present"] => [`${stem}e`, `${stem}es`, `${stem}e`, `${stem}ons`, `${stem}ez`, `${stem}ent`];

export const VERBS: Verb[] = [
  { inf: "être", en: "to be", week: 1, present: ["suis", "es", "est", "sommes", "êtes", "sont"], pp: "été", aux: "avoir" },
  { inf: "avoir", en: "to have", week: 2, present: ["ai", "as", "a", "avons", "avez", "ont"], pp: "eu", aux: "avoir" },
  { inf: "parler", en: "to speak", week: 3, present: er("parl"), pp: "parlé", aux: "avoir" },
  { inf: "travailler", en: "to work", week: 3, present: er("travaill"), pp: "travaillé", aux: "avoir" },
  { inf: "habiter", en: "to live", week: 3, present: er("habit"), pp: "habité", aux: "avoir" },
  { inf: "aimer", en: "to like", week: 3, present: er("aim"), pp: "aimé", aux: "avoir" },
  { inf: "regarder", en: "to watch", week: 3, present: er("regard"), pp: "regardé", aux: "avoir" },
  { inf: "manger", en: "to eat", week: 3, present: ["mange", "manges", "mange", "mangeons", "mangez", "mangent"], pp: "mangé", aux: "avoir" },
  { inf: "aller", en: "to go", week: 4, present: ["vais", "vas", "va", "allons", "allez", "vont"], pp: "allé", aux: "être" },
  { inf: "faire", en: "to do / make", week: 4, present: ["fais", "fais", "fait", "faisons", "faites", "font"], pp: "fait", aux: "avoir" },
  { inf: "prendre", en: "to take", week: 4, present: ["prends", "prends", "prend", "prenons", "prenez", "prennent"], pp: "pris", aux: "avoir" },
  { inf: "acheter", en: "to buy", week: 5, present: ["achète", "achètes", "achète", "achetons", "achetez", "achètent"], pp: "acheté", aux: "avoir" },
  { inf: "vouloir", en: "to want", week: 6, present: ["veux", "veux", "veut", "voulons", "voulez", "veulent"], pp: "voulu", aux: "avoir" },
  { inf: "pouvoir", en: "can", week: 6, present: ["peux", "peux", "peut", "pouvons", "pouvez", "peuvent"], pp: "pu", aux: "avoir" },
  { inf: "devoir", en: "must", week: 6, present: ["dois", "dois", "doit", "devons", "devez", "doivent"], pp: "dû", aux: "avoir" },
  { inf: "venir", en: "to come", week: 6, present: ["viens", "viens", "vient", "venons", "venez", "viennent"], pp: "venu", aux: "être" },
  { inf: "finir", en: "to finish", week: 6, present: ["finis", "finis", "finit", "finissons", "finissez", "finissent"], pp: "fini", aux: "avoir" },
  { inf: "sortir", en: "to go out", week: 6, present: ["sors", "sors", "sort", "sortons", "sortez", "sortent"], pp: "sorti", aux: "être" },
  { inf: "partir", en: "to leave", week: 6, present: ["pars", "pars", "part", "partons", "partez", "partent"], pp: "parti", aux: "être" },
  { inf: "voir", en: "to see", week: 7, present: ["vois", "vois", "voit", "voyons", "voyez", "voient"], pp: "vu", aux: "avoir" },
  { inf: "savoir", en: "to know", week: 7, present: ["sais", "sais", "sait", "savons", "savez", "savent"], pp: "su", aux: "avoir" },
  { inf: "dire", en: "to say", week: 7, present: ["dis", "dis", "dit", "disons", "dites", "disent"], pp: "dit", aux: "avoir" },
  { inf: "lire", en: "to read", week: 7, present: ["lis", "lis", "lit", "lisons", "lisez", "lisent"], pp: "lu", aux: "avoir" },
  { inf: "écrire", en: "to write", week: 7, present: ["écris", "écris", "écrit", "écrivons", "écrivez", "écrivent"], pp: "écrit", aux: "avoir" },
  { inf: "arriver", en: "to arrive", week: 8, present: er("arriv"), pp: "arrivé", aux: "être" },
  { inf: "rester", en: "to stay", week: 8, present: er("rest"), pp: "resté", aux: "être" },
];

export interface ConjItem {
  id: string;
  week: number;
  q: string;
  answer: string;
  explain: string;
}

const subject = (p: number, form: string) =>
  p === 0 ? (/^[aeéèêiouh]/i.test(form) ? "j'" : "je ") : `${PERSONS[p]} `;

const AVOIR = ["ai", "as", "a", "avons", "avez", "ont"];
const ETRE = ["suis", "es", "est", "sommes", "êtes", "sont"];

export function conjItem(id: string): ConjItem | null {
  const [, inf, ps, tense] = id.split(":");
  const v = VERBS.find((x) => x.inf === inf);
  const p = Number(ps);
  if (!v || !(p >= 0 && p < 6)) return null;
  if (tense === "pc" && v.pp) {
    const aux = (v.aux === "être" ? ETRE : AVOIR)[p];
    // With être the participle agrees; drills use the masculine form (singular or plural).
    const pp = v.aux === "être" && p >= 3 ? `${v.pp}s` : v.pp;
    const answer = `${aux} ${pp}`;
    return {
      id, week: Math.max(v.week, v.aux === "être" ? 8 : 7),
      q: `Passé composé · ${subject(p, aux)}___ (${v.inf})`,
      answer,
      explain: `${v.inf} takes ${v.aux} in the passé composé, participle ${v.pp}${v.aux === "être" ? " (agrees with the subject)" : ""}. → ${subject(p, aux)}${answer}`,
    };
  }
  const form = v.present[p];
  return {
    id, week: v.week,
    q: `Présent · ${subject(p, form)}___ (${v.inf}, ${v.en})`,
    answer: form,
    explain: `${v.inf}: ${v.present.map((f, i) => `${subject(i, f)}${f}`).join(", ")}.`,
  };
}

/** All drills unlocked by `week` (present for every verb introduced, passé composé from week 7). */
export function conjItemsFor(week: number): ConjItem[] {
  const out: ConjItem[] = [];
  for (const v of VERBS) {
    if (v.week > week) continue;
    for (let p = 0; p < 6; p++) {
      out.push(conjItem(`conj:${v.inf}:${p}:pres`)!);
      if (week >= 7 && v.pp) {
        const it = conjItem(`conj:${v.inf}:${p}:pc`)!;
        if (it.week <= week) out.push(it);
      }
    }
  }
  return out;
}

/** Compare typed answers: case/space-insensitive; accents must match, but we say when only accents are off. */
export function checkTyped(given: string, answers: string[]): "right" | "accents" | "wrong" {
  const norm = (s: string) => s.trim().toLowerCase().replace(/[’`]/g, "'").replace(/\s+/g, " ");
  const bare = (s: string) => norm(s).normalize("NFD").replace(/\p{Diacritic}/gu, "");
  const g = norm(given);
  if (answers.some((a) => norm(a) === g)) return "right";
  if (answers.some((a) => bare(a) === bare(g))) return "accents";
  return "wrong";
}
