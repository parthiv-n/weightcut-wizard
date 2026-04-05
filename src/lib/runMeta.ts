export type RunMeta = {
  distance: string;
  unit: "km" | "mi";
  time: string;
  pace: string;
};

const TAG_RE = /^\[RUN_META\](.*?)\[\/RUN_META\]/;

export function encodeRunMeta(meta: Partial<RunMeta>, notes: string): string {
  const hasData = meta.distance || meta.time;
  if (!hasData) return notes;
  const json = JSON.stringify(meta);
  const prefix = `[RUN_META]${json}[/RUN_META]`;
  return notes ? `${prefix}${notes}` : prefix;
}

export function decodeRunMeta(raw: string | null): { meta: RunMeta | null; notes: string } {
  if (!raw) return { meta: null, notes: "" };
  const match = raw.match(TAG_RE);
  if (!match) return { meta: null, notes: raw };
  try {
    const meta = JSON.parse(match[1]) as RunMeta;
    const notes = raw.slice(match[0].length);
    return { meta, notes };
  } catch {
    return { meta: null, notes: raw };
  }
}

export function formatPace(distance: string, time: string): string {
  const d = parseFloat(distance);
  if (!d || d <= 0 || !time) return "";
  const parts = time.split(":");
  let totalSeconds = 0;
  if (parts.length === 2) {
    totalSeconds = parseInt(parts[0]) * 60 + parseInt(parts[1]);
  } else if (parts.length === 1) {
    totalSeconds = parseInt(parts[0]) * 60;
  } else if (parts.length === 3) {
    totalSeconds = parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2]);
  }
  if (totalSeconds <= 0) return "";
  const paceSeconds = Math.round(totalSeconds / d);
  const m = Math.floor(paceSeconds / 60);
  const s = paceSeconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
