#!/usr/bin/env node
// Sync the human-readable recovery research markdown into a TS constant
// that the recovery-coach edge function can import. Supabase Edge Function
// deploys only bundle files reachable via imports, so we cannot rely on
// Deno.readTextFile() at runtime in production.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(__dirname, "../supabase/functions/recovery-coach/research/combat-sports-recovery.md");
const OUT = resolve(__dirname, "../supabase/functions/recovery-coach/research.ts");

const md = readFileSync(SRC, "utf8");

// Escape sequences that would break a template literal.
const escaped = md.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");

const out = `// AUTO-GENERATED — do not edit by hand.
// Source: supabase/functions/recovery-coach/research/combat-sports-recovery.md
// Regenerate with: node scripts/sync-recovery-research.mjs

export const RECOVERY_RESEARCH_MD = \`${escaped}\`;
`;

writeFileSync(OUT, out, "utf8");
console.log(`Wrote ${OUT} (${md.length} chars from ${SRC})`);
