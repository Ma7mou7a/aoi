/** A skill name inside a sentence: lower-case, except acronyms ("AI reliance" stays, "Working memory" → "working memory"). */
export const inSentence = (name: string) => name.split(" ").map((w) => (/^[A-Z]{2,}/.test(w) ? w : w.toLowerCase())).join(" ");
