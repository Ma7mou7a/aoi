"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createAwayTracker, eyeAwayScore, isLookingAway, poseFromMatrix, type Interval } from "./gaze";

export type FocusStatus = "off" | "starting" | "on" | "away" | "denied" | "unavailable";

const FRAME_MS = 100; // 10 checks a second is plenty to catch a glance away

/**
 * Focus Guard, the browser part. While `active`, it runs MediaPipe face landmarks on the camera, on this
 * device only, and keeps the moments the player looked away (epoch ms). No frame is stored or sent:
 * the video never leaves the <video> element, and only the intervals are kept. Any failure (no camera,
 * permission refused, no WebAssembly) turns the guard off; the game itself is never blocked.
 */
export function useFocusGuard(active: boolean) {
  const [status, setStatus] = useState<FocusStatus>("off");
  const tracker = useRef(createAwayTracker());
  const stopRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    let landmarker: { detectForVideo: (v: HTMLVideoElement, t: number) => unknown; close: () => void } | null = null;
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;

    const stop = () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
      landmarker?.close();
      video.srcObject = null;
    };
    stopRef.current = stop;

    // MediaPipe announces its CPU backend through console.error ("INFO: Created TensorFlow Lite ..."),
    // which the dev overlay shows as an error. Drop exactly those lines while the guard runs.
    const consoleError = console.error;
    console.error = (...args: unknown[]) => {
      if (typeof args[0] === "string" && args[0].startsWith("INFO:")) return;
      consoleError(...args);
    };

    (async () => {
      setStatus("starting");
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240, facingMode: "user" }, audio: false });
      } catch {
        if (!cancelled) setStatus("denied");
        return;
      }
      try {
        const { FaceLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
        const files = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
        landmarker = await FaceLandmarker.createFromOptions(files, {
          baseOptions: { modelAssetPath: "/mediapipe/face_landmarker.task", delegate: "CPU" },
          runningMode: "VIDEO",
          numFaces: 1,
          outputFaceBlendshapes: true,
          outputFacialTransformationMatrixes: true,
        });
        video.srcObject = stream;
        await video.play();
      } catch {
        stream?.getTracks().forEach((t) => t.stop());
        if (!cancelled) setStatus("unavailable");
        return;
      }
      if (cancelled) return stop();
      setStatus("on");
      timer = setInterval(() => {
        if (!landmarker || video.readyState < 2) return;
        const now = Date.now();
        const r = landmarker.detectForVideo(video, performance.now()) as {
          facialTransformationMatrixes?: Array<{ data: ArrayLike<number> }>;
          faceBlendshapes?: Array<{ categories: Array<{ categoryName: string; score: number }> }>;
        };
        const m = r.facialTransformationMatrixes?.[0];
        const away = isLookingAway({ pose: m ? poseFromMatrix(m.data) : null, eyeAway: eyeAwayScore(r.faceBlendshapes?.[0]?.categories ?? []) });
        tracker.current.push(now, away);
        setStatus((s) => (s === "on" || s === "away" ? (away ? "away" : "on") : s));
      }, FRAME_MS);
    })();

    return () => {
      stop();
      console.error = consoleError;
      setStatus("off");
    };
  }, [active]);

  /** The away moments since the last call, closing any still open; starts a fresh record. */
  const takeIntervals = useCallback((): Interval[] => {
    const done = tracker.current.close(Date.now());
    tracker.current = createAwayTracker();
    return done;
  }, []);

  return { status, takeIntervals };
}
