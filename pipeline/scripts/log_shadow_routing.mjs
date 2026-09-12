// log_shadow_routing.mjs — append-only writer for shadow-routing PREDICTION records (what the
// Reference Pattern Selector would have chosen for a real production slide). Per
// `references/reference-pattern-library-shadow-mode.md`: predictions are immutable once
// written and NEVER carry human judgment — that lives in a separate file
// (`log_shadow_adjudication.mjs`), written later, joined by `recordId`. Keeping the two apart
// is what makes "wrong selection = 0" an objective, unbiased measurement: nobody edits a
// prediction after seeing whether it turned out right.
//
// This module is deliberately pure I/O — the decision of WHETHER a slide is shadow-eligible,
// and the actual Selector call, live in shadow_evaluate_slide.mjs. This file just enforces the
// record shape and the one hard rule: an existing recordId is never overwritten.
//
// Usage: node scripts/log_shadow_routing.mjs <record.json> <shadow-routing-log.json>
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const SHADOW_STATUSES = new Set(["SELECTED", "DEFERRED", "SHADOW_ERROR"]);

function assertRecordShape(record) {
  for (const field of ["recordId", "runId", "deckId", "slideId", "candidateScreen", "production", "shadow", "provenance"]) {
    if (record[field] == null) throw new Error(`shadow routing record missing required field "${field}"`);
  }
  if (typeof record.candidateScreen.reason !== "string" || !record.candidateScreen.reason) {
    throw new Error("shadow routing record.candidateScreen.reason is required");
  }
  if (!record.production.template) throw new Error("shadow routing record.production.template is required");

  const { status, selectedPattern, deferReason, error } = record.shadow;
  if (!SHADOW_STATUSES.has(status)) {
    throw new Error(`shadow routing record.shadow.status must be one of ${[...SHADOW_STATUSES].join("/")}, got ${JSON.stringify(status)}`);
  }
  if (status === "SELECTED" && !selectedPattern) {
    throw new Error('shadow routing record.shadow.status "SELECTED" requires a non-null selectedPattern');
  }
  if (status === "DEFERRED") {
    if (selectedPattern) throw new Error('shadow routing record.shadow.status "DEFERRED" requires selectedPattern to be null');
    if (!deferReason) throw new Error('shadow routing record.shadow.status "DEFERRED" requires a non-null deferReason');
  }
  if (status === "SHADOW_ERROR" && !error) {
    throw new Error('shadow routing record.shadow.status "SHADOW_ERROR" requires a non-null error');
  }
  if (!record.provenance.libraryVersion) throw new Error("shadow routing record.provenance.libraryVersion is required");
}

export async function logShadowRouting(record, logPath) {
  assertRecordShape(record);

  let log = [];
  try { log = JSON.parse(await fs.readFile(logPath, "utf8")); } catch {}

  if (log.some((e) => e.recordId === record.recordId)) {
    throw new Error(`shadow routing record "${record.recordId}" already exists — predictions are immutable, never overwrite one`);
  }

  const stored = {
    recordId: record.recordId,
    timestamp: record.timestamp ?? new Date().toISOString(),
    runId: record.runId,
    deckId: record.deckId,
    slideId: record.slideId,
    candidateScreen: record.candidateScreen,
    production: record.production,
    shadow: record.shadow,
    provenance: record.provenance,
  };
  log.push(stored);

  await fs.mkdir(path.dirname(logPath), { recursive: true });
  await fs.writeFile(logPath, JSON.stringify(log, null, 2));
  return stored;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [recordPath, logPath] = process.argv.slice(2);
  if (!recordPath || !logPath) {
    console.error("usage: node scripts/log_shadow_routing.mjs <record.json> <shadow-routing-log.json>");
    process.exit(2);
  }
  const record = JSON.parse(await fs.readFile(path.resolve(process.cwd(), recordPath), "utf8"));
  const stored = await logShadowRouting(record, path.resolve(process.cwd(), logPath));
  console.log(JSON.stringify(stored, null, 2));
}
