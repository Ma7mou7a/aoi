"use client";

import { useEffect, useRef, useState } from "react";
import { INITIAL_THROTTLE, pandaBus, reactTo, type PandaEvent, type PandaState, type ReactMode } from "@/lib/panda/bus";

const HOLD_MS: Partial<Record<PandaState, number>> = { cheer: 400, oops: 1000, celebrate: 1500, proud: 1500, wave: 2200 };
const SLEEP_AFTER_MS = 60_000;

/**
 * Bao's current pose for a placement: listens to the bus, throttles trial reactions (`reactTo`), holds
 * a pose briefly, then returns to the resting pose (`watch` when lively, `quiet` when quiet). Falls
 * asleep after a minute without events; any event wakes him.
 */
export function usePandaReactions(mode: ReactMode, onEvent?: (e: PandaEvent) => void): PandaState {
  const rest: PandaState = mode === "quiet" ? "quiet" : "watch";
  const [pose, setPose] = useState<PandaState>(rest);
  const throttle = useRef(INITIAL_THROTTLE);
  const handler = useRef(onEvent);
  handler.current = onEvent;

  useEffect(() => {
    let back: ReturnType<typeof setTimeout> | undefined;
    let sleep: ReturnType<typeof setTimeout> | undefined;
    const armSleep = () => {
      clearTimeout(sleep);
      sleep = setTimeout(() => setPose("sleep"), SLEEP_AFTER_MS);
    };
    setPose(rest);
    armSleep();
    const off = pandaBus.on((e) => {
      handler.current?.(e);
      const r = reactTo(throttle.current, e, mode);
      throttle.current = r.next;
      armSleep();
      if (!r.pose) {
        setPose((p) => (p === "sleep" ? rest : p));
        return;
      }
      setPose(r.pose);
      clearTimeout(back);
      const hold = HOLD_MS[r.pose];
      if (hold) back = setTimeout(() => setPose(rest), hold);
    });
    return () => {
      off();
      clearTimeout(back);
      clearTimeout(sleep);
    };
  }, [mode, rest]);

  return pose;
}
