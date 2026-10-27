import type { Intent } from "../coach/intent";

/**
 * Bao's line bank: short, warm, first-person lines with {slots}. Used by the template coach and by the
 * panda's speech bubble. Rules: no digits or number words outside slots (every coach number is checked
 * against the evidence), no health or "better brain" claims, no comparison with other people.
 */
export type LineKey =
  | Intent
  | "consent_ask"
  | "consent_yes"
  | "consent_no"
  | "bet"
  | "trial_correct"
  | "trial_wrong"
  | "block_start"
  | "block_end"
  | "milestone"
  | "gift"
  | "greeting"
  | "sleep"
  | "no_data"
  | "need_more_games";

export const LINES: Record<LineKey, string[]> = {
  debrief: [
    "Here's what your last game says, in plain words.",
    "I watched the whole thing. Here's the short version.",
    "Let's look at that last game together.",
    "Bamboo break! Here's what I noticed in your last game.",
    "Nice effort. This is what your last game tells us.",
    "Quick recap of your last game, then you choose what's next.",
  ],
  play: [
    "Ooh, {skill}! I'll grab my bamboo and watch.",
    "Good pick. A {skill} game is ready when you are.",
    "Let's do it. Tap below and I'll keep you company.",
    "{skill} it is. I'll cheer quietly from the corner.",
    "Ready when you are. This one takes about a minute.",
    "Great choice, {name}. Your {skill} game is waiting.",
    "Let's play, {name}! Tap below and I'll keep you company.",
  ],
  progress: [
    "Here's where you are right now, {name}.",
    "Let's check your scores. The more you play, the surer I get.",
    "This is your progress so far, compared only with you.",
    "Here's the picture so far. Every game sharpens it.",
    "Your twin is taking shape. Here's what it shows.",
    "Good question. Here's how things look today.",
  ],
  forecast: [
    "If your recent trend continues, here's where you could land.",
    "Let's peek ahead. These are ranges, not promises.",
    "Here's my best guess for next week, with how sure I am.",
    "Playing more often tends to show up in the scores. Here's the range.",
    "I ran the numbers on your own history. Have a look.",
    "A little forecast, based only on your games.",
  ],
  goal: [
    "A goal! Pick a target and I'll keep an eye on it.",
    "Let's set something to aim for. Small and steady works best.",
    "Good idea. Choose a skill and a target that feels doable.",
    "Goals help. I'll remind you how close you are.",
    "Let's pick a target together.",
    "Setting a goal is a great way to keep going.",
  ],
  explain: [
    "Good question. Here it is in plain words.",
    "Let me explain that simply.",
    "Short answer first, details if you want them.",
    "Happy to explain. Tap 'Why?' for the evidence.",
    "Here's what that means for you.",
    "Plain words, coming up.",
  ],
  chat: [
    "Hi {name}! Want to play, or see how you're doing?",
    "Hello! I'm Bao. I can start a game, show your progress or look ahead.",
    "Hey there. Bamboo's fresh, games are ready. What shall we do?",
    "Hi! Ask me anything about your games.",
    "Good to see you, {name}. Shall we play something?",
    "Hello again! Pick a button below or just ask.",
  ],
  help: [
    "I can start a game for any skill, show your progress, or forecast where you're heading.",
    "Try 'I want to improve my memory' or 'What if I play every day?'",
    "Ask me how you're doing, what a word means, or to pick your next game.",
    "I explain your games in plain words and help you choose what's next.",
    "I'm your coach: games, progress, goals and forecasts. Tap a button to start.",
    "You can type or use the microphone. I'll answer in plain words.",
  ],
  consent_ask: [
    "Want me to use AI to answer in my own words? I'd send a summary of your scores (never your name) to an AI model. You can change this any time in Settings.",
    "I can answer more freely with AI. I'd only send a summary of your scores, never your name, and you can switch it off in Settings.",
    "Shall I use AI for my answers? It gets a summary of your scores, never your name. Settings lets you change your mind.",
    "With your OK, I'll use AI to write my answers. It sees a score summary, never your name. You can turn it off in Settings.",
    "May I use AI to chat with you? Only a summary of your scores goes out, never your name. Change it any time in Settings.",
    "AI would let me answer any question. It gets your score summary, never your name, and Settings has the off switch.",
  ],
  consent_yes: [
    "Thanks! Ask me anything about your games.",
    "Great, AI answers are on. What would you like to know?",
    "Done. I'll answer in my own words from now on.",
    "Lovely. Fire away!",
    "AI coaching is on. Every number I say is still checked against your games.",
    "Thanks for trusting me. What shall we look at first?",
  ],
  consent_no: [
    "No problem. I'll keep answering with my built-in replies.",
    "That's fine! I can still start games and show your progress.",
    "Got it. You can change this in Settings any time.",
    "Sure thing. Let's keep going without AI.",
    "Okay! The buttons below still do everything.",
    "No AI, no worries. What shall we do?",
  ],
  bet: [
    "I bet you did better than last time. Agree?",
    "Before I show you: better, same or a bit lower than last time?",
    "Quick bet! How do you think that went compared with last time?",
    "Your guess first: did your score go up?",
    "Let's play a little game. Better, same or lower?",
    "Guess before I tell you. Up, same or down?",
  ],
  trial_correct: ["Yes!", "Nice!", "Got it!", "Smooth.", "Bamboo-tastic!", "Keep going!"],
  trial_wrong: ["Oops, no worries.", "Shake it off.", "Next one!", "All part of it.", "Easy, keep going.", "That's fine."],
  block_start: [
    "Ready? I'll be right here.",
    "Let's go! Take your time.",
    "Deep breath. You've got this.",
    "I'm watching quietly. Have fun!",
    "Here we go!",
    "Off you go. I'll hold the bamboo.",
  ],
  block_end: [
    "Done! Let's see how it went.",
    "Finished! Nice focus.",
    "That's a wrap. Results coming up.",
    "Well played!",
    "All done. Bamboo break?",
    "Great effort, {name}!",
  ],
  milestone: [
    "Look at that! A new best for you.",
    "Woohoo! That's a personal record.",
    "You beat your own best!",
    "Celebration time!",
    "That's your best yet. Proud of you!",
    "New record! Bamboo for everyone.",
  ],
  gift: [
    "A gift for showing up today!",
    "Welcome back! Here's some fresh bamboo.",
    "You came back! That deserves bamboo.",
    "Daily bamboo, just for you.",
    "Every visit counts. Here's your gift.",
    "Hello again! Open your gift.",
  ],
  greeting: [
    "Hi {name}! Ready for a game?",
    "Welcome back, {name}!",
    "{streak} days in a row, {name}. Lovely rhythm!",
    "Good to see you, {name}. Your next game is ready.",
    "Hey {name}! Bamboo's fresh today.",
    "Back for more? I like your style, {name}.",
    "{name}, your streak is at {streak} days. Keep it going?",
  ],
  sleep: ["Zzz…", "Just resting my eyes.", "Wake me for a game!", "Bamboo dreams…", "Tap me when you're ready.", "Snooze… I'm still here."],
  no_data: [
    "I don't know you yet! Play a game and I'll tell you what it shows.",
    "Nothing to show yet. One game and we're off.",
    "Let's start with a game, then I'll have something to say.",
    "Your twin is empty for now. Play a game to fill it in.",
    "I need a game from you first. It takes about a minute.",
    "Play your first game and I'll explain it in plain words.",
  ],
  need_more_games: [
    "I need about {games} more {skill} games before I can forecast fairly.",
    "Play {games} more {skill} games and I'll show you a forecast.",
    "Forecasts need a little history: {games} more {skill} games should do it.",
    "Almost! {games} more {skill} games and I can look ahead.",
    "Not enough games yet to guess the future. Try {games} more {skill} games.",
    "Give me {games} more {skill} games and I'll forecast your pace.",
  ],
};

const SLOT = /\{(\w+)\}/g;

/**
 * Pick a line for `key`, never one of the last 5 ids in `recent`, skipping variants whose slots are
 * missing from `ctx`. Ids are "<key>:<index>". If everything is filtered out, `recent` is ignored.
 */
export function pickLine(key: LineKey, ctx: Record<string, string | number | undefined>, recent: string[], rand: () => number): { id: string; text: string } {
  const last = new Set(recent.slice(-5));
  const filled = LINES[key]
    .map((text, i) => ({ id: `${key}:${i}`, text }))
    .filter(({ text }) => [...text.matchAll(SLOT)].every((m) => ctx[m[1]] !== undefined && ctx[m[1]] !== ""));
  const fresh = filled.filter((l) => !last.has(l.id));
  const pool = fresh.length ? fresh : filled.length ? filled : [{ id: `${key}:0`, text: LINES[key][0] }];
  const pick = pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))];
  return { id: pick.id, text: pick.text.replace(SLOT, (_, k: string) => String(ctx[k] ?? "")) };
}
