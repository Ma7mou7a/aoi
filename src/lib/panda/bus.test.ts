import { describe, expect, it } from "vitest";
import { createPandaBus, INITIAL_THROTTLE, reactTo, type PandaEvent, type ThrottleState } from "./bus";

const run = (events: PandaEvent[], mode: "quiet" | "lively") => {
  let s: ThrottleState = INITIAL_THROTTLE;
  return events.map((e) => {
    const r = reactTo(s, e, mode);
    s = r.next;
    return r.pose;
  });
};
const correct = { type: "trial:correct" } as const;
const wrong = { type: "trial:wrong" } as const;

describe("reactTo", () => {
  it("stays still for trials in quiet mode", () => {
    expect(run([correct, wrong, correct, correct, wrong], "quiet").every((p) => p === null)).toBe(true);
  });
  it("cheers on every third correct answer when lively", () => {
    expect(run(Array(7).fill(correct), "lively")).toEqual([null, null, "cheer", null, null, "cheer", null]);
  });
  it("covers its eyes at most once per 5 trials", () => {
    const poses = run(Array(10).fill(wrong), "lively");
    expect(poses.filter((p) => p === "oops")).toHaveLength(2);
    expect(poses[0]).toBe("oops");
    expect(poses.slice(1, 5)).toEqual([null, null, null, null]);
  });
  it("counts every trial toward the oops spacing", () => {
    expect(run([wrong, correct, correct, correct, correct, wrong], "lively").at(-1)).toBe("oops");
  });
  it("celebrates milestones even when quiet", () => {
    expect(run([{ type: "milestone" }], "quiet")).toEqual(["celebrate"]);
  });
  it("takes the coach's mood", () => expect(run([{ type: "coach:mood", mood: "proud" }], "lively")).toEqual(["proud"]));
});

describe("pandaBus", () => {
  it("delivers events until unsubscribed", () => {
    const bus = createPandaBus();
    const seen: string[] = [];
    const off = bus.on((e) => seen.push(e.type));
    bus.emit(correct);
    off();
    bus.emit(wrong);
    expect(seen).toEqual(["trial:correct"]);
  });
});
