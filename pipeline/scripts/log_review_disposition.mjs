// log_review_disposition.mjs — records the Creator's accept/reject/modify decision on every
// Fresh-eye Review / Visual QA / Storyline Review finding, with a reason. This is what makes
// "採否表" (the disposition table SKILL.md already requires) a durable, auditable artifact
// instead of a conversation that evaporates — and it's the input Targeted Revision's patches
// should be derived from (only "accept"/"modify" findings turn into patches).
//
// Never auto-accepts anything: this script only APPENDS whatever disposition list it's given.
// The rule "critical findings must be fixed absent a documented reason" is enforced by
// requiring `reason` on every non-"accept" disposition for a critical finding — the script
// refuses to log a reject/defer on a critical finding with no reason, rather than silently
// accepting a blank one.
//
// Usage: node scripts/log_review_disposition.mjs <dispositions.json> <log.json>
// dispositions.json: [{ findingId, slide, severity, category, issue, outcome: "accept"|"reject"|"modify", reason }]
// log.json: appended to (created if absent) — one array of every disposition ever logged,
// each stamped with loggedAt, so the full review history for a deck accumulates in one file.
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

export async function logReviewDisposition(dispositions, logPath) {
  for (const d of dispositions) {
    if (!["accept", "reject", "modify"].includes(d.outcome)) {
      throw new Error(`disposition for finding ${d.findingId ?? "(no id)"} has invalid outcome "${d.outcome}"`);
    }
    if (d.severity === "critical" && d.outcome !== "accept" && !d.reason) {
      throw new Error(`critical finding ${d.findingId ?? d.issue} was ${d.outcome} with no reason — critical findings require a documented reason to skip`);
    }
  }
  let existing = [];
  try {
    existing = JSON.parse(await fs.readFile(logPath, "utf8"));
  } catch {
    existing = [];
  }
  const stamped = dispositions.map((d) => ({ ...d, loggedAt: new Date().toISOString() }));
  const all = [...existing, ...stamped];
  await fs.writeFile(logPath, JSON.stringify(all, null, 2));
  return { logged: stamped.length, total: all.length };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [dispositionsPath, logPath] = process.argv.slice(2);
  if (!dispositionsPath || !logPath) {
    console.error("usage: node scripts/log_review_disposition.mjs <dispositions.json> <log.json>");
    process.exit(2);
  }
  const dispositions = JSON.parse(await fs.readFile(path.resolve(process.cwd(), dispositionsPath), "utf8"));
  const result = await logReviewDisposition(dispositions, path.resolve(process.cwd(), logPath));
  console.log(JSON.stringify(result, null, 2));
}
