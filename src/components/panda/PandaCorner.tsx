"use client";

import { useCallback, useRef, useState } from "react";
import type { PandaEvent, ReactMode } from "@/lib/panda/bus";
import { pickLine, type LineKey } from "@/lib/panda/lines";
import { Panda } from "./Panda";
import { PandaSay } from "./PandaSay";
import { usePandaReactions } from "./usePandaReactions";

const SAY_FOR: Partial<Record<PandaEvent["type"], LineKey>> = { "block:start": "block_start", "block:end": "block_end", milestone: "milestone" };
const SAY_MS = 2600;

/**
 * Bao in the bottom-right corner while you play. Says a short line when a game starts or ends; in
 * `quiet` mode (assessment) he only blinks during the game, so he can't distract from the measurement.
 */
export function PandaCorner({ mode, name }: { mode: ReactMode; name?: string }) {
  const [say, setSay] = useState("");
  const recent = useRef<string[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const onEvent = useCallback(
    (e: PandaEvent) => {
      const key = SAY_FOR[e.type];
      if (!key) return;
      const l = pickLine(key, { name }, recent.current, Math.random);
      recent.current = [...recent.current, l.id].slice(-5);
      setSay(l.text);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setSay(""), SAY_MS);
    },
    [name],
  );
  const pose = usePandaReactions(mode, onEvent);

  return (
    <div className="pointer-events-none fixed right-3 bottom-3 z-30 flex flex-col items-end gap-1 sm:right-6 sm:bottom-6">
      <PandaSay text={say} />
      <Panda state={pose} size={76} />
    </div>
  );
}
