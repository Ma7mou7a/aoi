"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Voice coaching with the browser's built-in Web Speech API: nothing to install, no audio stored.

/** Text-to-speech for coach messages. */
export function useSpeaker() {
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const supported = typeof window !== "undefined" && "speechSynthesis" in window;

  const stop = useCallback(() => {
    if (supported) window.speechSynthesis.cancel();
    setSpeakingId(null);
  }, [supported]);

  const speak = useCallback(
    (id: string, text: string) => {
      if (!supported) return;
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "en-US";
      u.rate = 1;
      u.onend = () => setSpeakingId((s) => (s === id ? null : s));
      setSpeakingId(id);
      window.speechSynthesis.speak(u);
    },
    [supported],
  );

  useEffect(() => stop, [stop]);
  return { supported, speakingId, speak, stop };
}

type Recognition = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start: () => void;
  stop: () => void;
};

/**
 * Speech-to-text for questions. The transcript fills the input for the user to review: it is never
 * sent automatically, and no decision is ever made from the voice itself.
 */
export function useDictation(onText: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<Recognition | null>(null);
  const Ctor =
    typeof window !== "undefined"
      ? ((window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }).SpeechRecognition ??
        (window as unknown as { webkitSpeechRecognition?: new () => Recognition }).webkitSpeechRecognition)
      : undefined;

  const start = useCallback(() => {
    if (!Ctor) return;
    setError(null);
    const r = new Ctor();
    r.lang = "en-US";
    r.interimResults = false;
    r.maxAlternatives = 1;
    r.onresult = (e) => onText(e.results[0]?.[0]?.transcript ?? "");
    r.onend = () => setListening(false);
    r.onerror = (e) => {
      setError(e.error === "not-allowed" ? "Microphone access was blocked in the browser." : "Couldn't hear that, try again.");
      setListening(false);
    };
    rec.current = r;
    setListening(true);
    r.start();
  }, [Ctor, onText]);

  const stop = useCallback(() => rec.current?.stop(), []);
  return { supported: !!Ctor, listening, error, start, stop };
}

/** Plain text of a coach message for reading aloud. */
export function spokenText(m: { content: string; claims: Array<{ claim: string }>; nextStep: string | null }) {
  return [m.content, ...m.claims.map((c) => c.claim), m.nextStep ? `Next step: ${m.nextStep}` : ""].filter(Boolean).join(" ");
}
