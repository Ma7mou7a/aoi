"use client";

import { useEffect, useState } from "react";

/**
 * A date in the viewer's own time zone and locale. Formatted after mount: the server renders in UTC,
 * so formatting during render would differ between server and browser and break hydration.
 */
export function LocalTime({ at, options }: { at: string | Date; options?: Intl.DateTimeFormatOptions }) {
  const iso = typeof at === "string" ? at : at.toISOString();
  const [text, setText] = useState<string | null>(null);
  useEffect(() => setText(new Date(iso).toLocaleString(undefined, options)), [iso, options]);
  return <time dateTime={iso}>{text ?? ""}</time>;
}
