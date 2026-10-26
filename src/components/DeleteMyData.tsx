"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DeleteMyData() {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);

  async function del() {
    await fetch("/api/me", { method: "DELETE" });
    router.push("/");
    router.refresh();
  }

  if (!confirming) {
    return <button onClick={() => setConfirming(true)} className="text-sm text-red-600 underline-offset-4 hover:underline">Delete all my data</button>;
  }
  return (
    <span className="flex items-center gap-3 text-sm">
      This permanently deletes your profile, history and results.
      <button onClick={del} className="rounded-lg bg-red-600 px-3 py-1 font-medium text-white">Delete</button>
      <button onClick={() => setConfirming(false)} className="text-slate-500">Cancel</button>
    </span>
  );
}
