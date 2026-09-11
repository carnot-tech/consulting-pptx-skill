// log_experience.mjs — tracks recurring, reproducible failure patterns toward eventual
// promotion into slide-rules.md, WITHOUT ever writing to slide-rules.md itself. Per the
// design brief: "複数回再現した問題のみ恒久ルール化できる構造" — a pattern only becomes
// eligible after it has recurred `PROMOTION_THRESHOLD` times, and even then this script only
// FLAGS eligibility; a human/Claude still decides whether to actually append the rule
// (append-only, per slide-rules.md's own header convention: "番号は変えず末尾追記").
//
// Matching is deliberately simple (case-folded substring/equality on `pattern`), not fuzzy
// NLP — a pattern that doesn't match verbatim creates a new candidate rather than silently
// merging into an unrelated one. Over-merging is worse than a few near-duplicate candidates,
// since a wrongly-merged occurrence count could promote a rule from an inflated signal.
//
// Usage: node scripts/log_experience.mjs <candidate.json> <experience-log.json>
// candidate.json: { pattern, root_cause, proposed_rule }
// Output: the updated entry, including its new occurrence count and eligibility flag.
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const PROMOTION_THRESHOLD = 3;

function normalize(s) {
  return String(s || "").trim().toLowerCase();
}

export async function logExperience(candidate, logPath) {
  if (!candidate.pattern || !candidate.root_cause || !candidate.proposed_rule) {
    throw new Error("candidate requires pattern, root_cause, and proposed_rule");
  }
  let log = [];
  try { log = JSON.parse(await fs.readFile(logPath, "utf8")); } catch {}

  const key = normalize(candidate.pattern);
  let entry = log.find((e) => normalize(e.pattern) === key);
  if (entry) {
    entry.occurrences += 1;
    entry.lastSeenAt = new Date().toISOString();
    entry.rootCauses = [...new Set([...(entry.rootCauses || [entry.root_cause]), candidate.root_cause])];
  } else {
    entry = {
      pattern: candidate.pattern,
      root_cause: candidate.root_cause,
      rootCauses: [candidate.root_cause],
      proposed_rule: candidate.proposed_rule,
      occurrences: 1,
      firstSeenAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
      promotedAt: null,
    };
    log.push(entry);
  }
  entry.eligibleForPromotion = entry.occurrences >= PROMOTION_THRESHOLD && !entry.promotedAt;

  await fs.writeFile(logPath, JSON.stringify(log, null, 2));
  return entry;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [candidatePath, logPath] = process.argv.slice(2);
  if (!candidatePath || !logPath) {
    console.error("usage: node scripts/log_experience.mjs <candidate.json> <experience-log.json>");
    process.exit(2);
  }
  const candidate = JSON.parse(await fs.readFile(path.resolve(process.cwd(), candidatePath), "utf8"));
  const entry = await logExperience(candidate, path.resolve(process.cwd(), logPath));
  console.log(JSON.stringify(entry, null, 2));
  if (entry.eligibleForPromotion) {
    console.log(`\n>>> ELIGIBLE FOR PROMOTION (${entry.occurrences} occurrences) — consider appending to slide-rules.md, then set promotedAt.`);
  }
}
