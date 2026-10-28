import { afterEach, describe, expect, it, vi } from "vitest";
import { startRetentionJob, stopRetentionJob } from "./retentionJob";

describe("retention job schedule", () => {
  afterEach(() => {
    stopRetentionJob();
    vi.useRealTimers();
  });

  it("runs shortly after start, then every interval, and only once per process", async () => {
    vi.useFakeTimers();
    const run = vi.fn(async () => ({ users: 0, challenges: 0, at: "" }));
    startRetentionJob({ run, firstDelayMs: 1000, intervalMs: 60_000, log: () => {} });
    startRetentionJob({ run, firstDelayMs: 1000, intervalMs: 60_000, log: () => {} }); // hot reload: no second timer
    expect(run).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(run).toHaveBeenCalledTimes(3);
  });

  it("keeps going after a failed run", async () => {
    vi.useFakeTimers();
    const run = vi.fn().mockRejectedValueOnce(new Error("db busy")).mockResolvedValue({ users: 1, challenges: 0, at: "" });
    const log = vi.fn();
    startRetentionJob({ run, firstDelayMs: 10, intervalMs: 100, log });
    await vi.advanceTimersByTimeAsync(10);
    await vi.advanceTimersByTimeAsync(100);
    expect(run).toHaveBeenCalledTimes(2);
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/failed/));
  });
});
