import type { DisputeReason } from "./dispute";

/**
 * French for the surprise scenarios. A Tunisian jury may well ask Bao in French ("Pourquoi cet exercice ?",
 * "Ce n'était pas juste, j'étais distrait", "Quel sera exactement mon score le mois prochain ?", "Je stagne").
 * Detection works on accent-folded text; the replies themselves are written in server/scenarios.ts.
 */
export type Lang = "en" | "fr";

/** Lower case, accents removed, apostrophes as spaces: "J'étais distrait" → " j etais distrait ". */
export const fold = (s: string) =>
  ` ${s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[’'`]/g, " ").replace(/[^a-z0-9%\s]/g, " ").replace(/\s+/g, " ").trim()} `;

const STRONG = /\b(pourquoi|j etais|je stagne|je plafonne|quel sera|quelle sera|aujourd hui|n etait pas|c etait|ce n est|exercice|prochain|prochaine|distraite?|bloquee?|progresse)\b/;
const WEAK = /\b(je|j|mon|ma|mes|est|pas|le|la|les|un|une|du|des|ce|cet|cette|quel|quelle|sera|mois|semaine|juste|jeu|niveau|score|moi|tu|vous)\b/g;
const ENGLISH = /\b(the|why|what|my|is|was|i|you|this|that|game|will|not|stuck)\b/g;

/** "fr" when the message reads as French, else "en". */
export function detectLang(text: string): Lang {
  const t = fold(text);
  const fr = (t.match(WEAK) ?? []).length + (STRONG.test(t) ? 3 : 0);
  const en = (t.match(ENGLISH) ?? []).length;
  return fr >= 3 && fr > en ? "fr" : "en";
}

const DISPUTE_FR: Array<[DisputeReason, RegExp]> = [
  ["interruption", /\b(interromp\w*|derange\w*|on m a appele|telephone a sonne|quelqu un est (entre|venu)|j ai du (partir|arreter|repondre))\b/],
  ["noise", /\b(bruit\w*|bruyant\w*|musique|travaux|cri\w*)\b/],
  ["tired", /\b(fatigue\w*|epuise\w*|crevee?|pas dormi|mal dormi|mal a la tete|sommeil)\b/],
  ["device", /\b(bug\w*|lag\w*|rame\w*|clavier|souris|ecran|internet|wifi|connexion|ordinateur lent|telephone lent)\b/],
  ["distraction", /\b(distrait\w*|deconcentre\w*|pas concentre\w*|j avais la tete ailleurs|sur mon telephone|enfants?|bebe|tele)\b/],
  ["unfair", /\b(pas juste|injuste|pas equitable|c est faux|tu te trompes|vous vous trompez|pas d accord|ce n est pas moi|pas mon (vrai )?niveau|mauvais jour|pas representatif)\b/],
];

/** French pushback: a reason word about a result ("ce n'était pas juste, j'étais distrait"). */
export function detectDisputeFr(text: string): { reason: DisputeReason } | null {
  const t = fold(text);
  const hit = DISPUTE_FR.find(([, re]) => re.test(t));
  if (!hit) return null;
  const isHowTo = /^\s*(comment|quels?|des conseils|astuces?)\b/.test(t) && !/\b(j etais|c etait|etait)\b/.test(t);
  return isHowTo ? null : { reason: hit[0] };
}

/** "Pourquoi cet exercice aujourd'hui ?" */
export function detectWhyFr(text: string): boolean {
  const t = fold(text);
  return /\bpourquoi\b/.test(t) && /\b(cet|ce|cette|exercice|jeu|tache|niveau|choisi\w*|donne\w*|propose\w*|recommande\w*|assigne\w*|aujourd hui|plan)\b/.test(t) && !/\b(baisse|chute|descendu|diminue)\b/.test(t);
}

/** "Quel sera exactement mon score le mois prochain ?" → horizon in days. */
export function detectFortuneFr(text: string): { horizonDays: number; exact: boolean } | null {
  const t = fold(text);
  const future = /\b(sera|serai|aurai|vais (avoir|atteindre|etre)|prevoi\w*|predi\w*|dans (un|une|deux|trois|six|\d+) (semaines?|mois|ans?)|(le )?mois prochain|(la )?semaine prochaine|l an prochain)\b/.test(t);
  const number = /\b(score|niveau|pourcentage|%|resultat|note)\b/.test(t);
  if (!(future && number)) return null;
  const exact = /\b(exactement|precisement|sur|certain\w*|garanti\w*)\b/.test(t);
  let horizonDays = 30;
  if (/\bsemaine prochaine\b|\bdans (une|1) semaine\b/.test(t)) horizonDays = 7;
  else if (/\bdans (deux|2) semaines\b/.test(t)) horizonDays = 14;
  else if (/\b(trois|3|six|6) mois\b|\bl an prochain\b|\bdans (un|1) an\b/.test(t)) horizonDays = 90;
  return { horizonDays, exact };
}

const PLATEAU_EN =
  /\b(i m|im|i am|i feel|feel) (so )?(stuck|plateau\w*)\b|\bplateau\w*\b|\bsame score\b|\b(score|scores|results?|progress)\b[^.?!]{0,30}\b(isn t|aren t|not|never|doesn t|don t|won t)\b[^.?!]{0,15}\b(mov\w*|chang\w*|improv\w*|go(ing)? up|budg\w*|grow\w*)\b|\bnot (getting|improving) (any )?better\b|\bno progress\b|\bkeep getting the same\b|\bnothing (ever )?changes\b|\b(been|stuck|stay\w*) at \d+ ?%|\bnot improving\b|\bnot getting anywhere\b/;
const PLATEAU_FR = /\b(je stagne|je plafonne|je suis bloquee?|bloquee? au meme|plateau|toujours le meme score|meme score|je ne progresse (pas|plus)|aucun progres|pas de progres|ca ne bouge (pas|plus)|mon score ne bouge|n arrive pas a progresser|je ne m ameliore (pas|plus)|je n avance (pas|plus))\b/;

/** "I'm stuck, my score never moves" / "Je stagne". */
export function detectPlateauQuestion(text: string): boolean {
  const t = fold(text);
  return PLATEAU_EN.test(t) || PLATEAU_FR.test(t);
}

export const REASON_WORDS_FR: Record<DisputeReason, string> = {
  distraction: "tu étais distrait(e)",
  interruption: "tu as été interrompu(e)",
  noise: "c'était bruyant",
  tired: "tu étais fatigué(e)",
  device: "l'appareil t'a gêné(e)",
  unfair: "ça ne reflète pas ton vrai niveau",
};

/** French versions of verifyDispute's notes, from the same recorded signals. */
export function disputeNotesFr(s: { lookedAway: number; focusLost: number; flags: string[]; fatigueHigh?: boolean; n: number }, reason: DisputeReason): string[] {
  const notes: string[] = [];
  if (s.lookedAway > 0) notes.push(`la caméra t'a vu(e) détourner le regard pendant ${s.lookedAway} manches sur ${s.n}`);
  if (s.focusLost > 0) notes.push(`la fenêtre du jeu a perdu le focus ${s.focusLost} fois`);
  if (s.flags.includes("rushing")) notes.push("beaucoup de réponses sont arrivées plus vite qu'on ne peut lire les mots");
  if (s.flags.includes("many_timeouts")) notes.push("beaucoup de manches ont expiré");
  if (s.flags.includes("many_anticipations")) notes.push("beaucoup d'appuis sont arrivés avant le stimulus");
  if (reason === "tired" && s.fatigueHigh) notes.push("tes réponses ont ralenti vers la fin, un signe typique de fatigue");
  return notes;
}

/** The plateau strategies, explained in French. */
export const STRATEGY_FR: Record<string, string> = {
  "Rolling rehearsal": "Répète en silence les dernières lettres comme une petite comptine (« K-T… T-R… ») et laisse tomber la plus ancienne à chaque fois.",
  "Chunk in pairs": "Groupe les lettres deux par deux (« KT », « RB ») et compare chaque nouvelle paire avec la précédente.",
  "Soft focus": "Regarde le bas des lettres, pas le mot : la couleur de l'encre ressort avant le sens.",
  "Name the ink first": "Avant de lire quoi que ce soit, dis la couleur de l'encre dans ta tête (« rouge ! »), puis appuie : le mot vient après.",
  "Draw the shape": "Ne mémorise pas des cases : trace le chemin comme une forme (un L, un zigzag) et rejoue la forme.",
  "Count the jumps": "Compte les cases pendant que tu regardes (1-2-3…) et associe chaque nombre à un coin du plateau.",
  "Three anchors": "Apprends par cœur trois paires symbole–chiffre avant de commencer, puis ne cherche que les autres.",
  "Scan by rows": "Lis la clé ligne par ligne une fois, de gauche à droite, et garde les yeux sur la ligne dont tu as besoin.",
  "Say the rule": "Avant chaque réponse, dis la règle en cours dans ta tête (« forme ! ») et seulement ensuite appuie.",
  "Pause on a switch": "Quand la règle change, prends une demi-seconde avant de répondre ; quand elle se répète, va vite.",
  "Rows, then columns": "Regarde ce qui change sur chaque ligne, puis chaque colonne, puis la diagonale, avant de regarder les réponses.",
  "Name the change": "Dis en mots ce qui change (« un point de plus », « tourne à droite ») avant de regarder les réponses.",
  "Commit first": "Décide ta propre réponse et ton degré de certitude avant de lire ce que dit l'IA.",
  "Spot the disagreement": "Ne reconsidère ta réponse que quand l'IA n'est pas d'accord avec toi ; quand elle est d'accord, continue.",
};

/** A number written the French way (decimal comma). */
export const frNum = (n: number) => String(n).replace(".", ",");

/** Skill names in French. */
export const SKILL_FR: Record<string, string> = {
  working_memory: "mémoire de travail",
  attention_inhibition: "attention et inhibition",
  processing_speed: "vitesse de traitement",
  cognitive_flexibility: "flexibilité cognitive",
  visuospatial_memory: "mémoire visuo-spatiale",
  reasoning: "raisonnement",
  ai_reliance: "confiance envers l'IA",
};
