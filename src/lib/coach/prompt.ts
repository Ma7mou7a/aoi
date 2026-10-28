import type { Dimension } from "../dimensions/schema";
import { packToPrompt, type EvidencePack } from "./evidence";
import type { Intent } from "./intent";
import { memoryToPrompt, type CoachMemory } from "./memory";
import { scienceToPrompt, type ScienceRef } from "./science";

/** Replace every mention of the user's name with "the user" (case-insensitive, whole word). */
function redactName(text: string, name: string): string {
  const n = name.trim();
  if (n.length < 2) return text;
  const escaped = n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.replace(new RegExp(`\\b${escaped}\\b`, "gi"), "the user");
}

/**
 * The user prompt for the coach model. The display name is never sent (the consent says "never your
 * name"): it is removed from the question and the conversation history, since Bao's built-in lines
 * greet people by name.
 */
export function buildCoachPrompt(input: {
  pack: EvidencePack;
  science: ScienceRef[];
  memory: CoachMemory;
  dims: Dimension[];
  intent: Intent;
  skill?: string;
  nextNote?: string;
  history: Array<{ role: string; content: string }>;
  ask: string;
  userName: string;
}): string {
  const { pack, science, memory, dims, intent, skill, nextNote, history, ask, userName } = input;
  const prompt =
    `EVIDENCE PACK\n${packToPrompt(pack)}\n\n` +
    `${scienceToPrompt(science)}\n\n` +
    `ABOUT THE USER\n${memoryToPrompt(memory, dims)}\n\n` +
    `USER INTENT (keyword guess, may be wrong): ${intent}${skill ? `, skill id ${skill}` : ""}\n\n` +
    (nextNote ? `SUGGESTED NEXT BLOCK (from the adaptive selector)\n${nextNote}\n\n` : "") +
    (history.length ? `RECENT CONVERSATION (oldest first)\n${history.map((m) => `${m.role}: ${m.content}`).join("\n")}\n\n` : "") +
    ask;
  return redactName(prompt, userName);
}
