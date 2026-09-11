// run_pipeline.mjs — the pipeline orchestrator. Runs every DETERMINISTIC stage for the
// requested --mode in order, and stops (without guessing) at the first stage that needs
// semantic judgment, telling Claude exactly what to do and which prompt file to use. This
// script never calls an LLM itself — Claude (following SKILL.md) performs the semantic step,
// writes its result to the path this script names, and re-invokes the orchestrator to
// continue. That split is deliberate: deterministic checks -> code, semantic evaluation -> LLM.
//
// Modes (target architecture, VERBATIM from the design brief):
//   fast:      Ghost Deck -> Mechanical QA -> PPTX
//   standard:  Ghost Deck -> Mechanical QA -> Visual QA -> PPTX                  (default)
//   rigorous:  Ghost Deck -> Storyline Review -> Mechanical QA -> Visual QA ->
//              Fresh-eye Review -> Revision -> Regression QA -> PPTX
//
// Usage:
//   node scripts/run_pipeline.mjs --mode standard --ghost-deck <gd.json> --spec <spec.json> --out-dir <dir>
//   node scripts/run_pipeline.mjs --resume <dir>/pipeline-state.json --input <llm-output.json>
//
// Every run appends one entry to <out-dir>/pipeline-log.json: {stage, startedAt, endedAt,
// durationMs, passed, note}. Aggregate timing/revision-loop-count reporting reads that file.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { parseStorylineReview, parseFreshEyeReview, parseVisualQa } from "./review_output_parser.mjs";

const execFileAsync = promisify(execFile);
const root = fileURLToPath(new URL("..", import.meta.url));

const MODE_STAGES = {
  fast: ["ghost_deck_validate", "mechanical_qa", "pptx_export"],
  standard: ["ghost_deck_validate", "mechanical_qa", "render_screenshots", "visual_qa_llm", "pptx_export"],
  rigorous: [
    "ghost_deck_validate", "storyline_review_llm", "mechanical_qa", "render_screenshots",
    "visual_qa_llm", "fresh_eye_review_llm", "targeted_revision_llm", "regression_qa", "pptx_export",
  ],
};

const LLM_STAGES = new Set(["storyline_review_llm", "visual_qa_llm", "fresh_eye_review_llm", "targeted_revision_llm"]);

async function readJsonIfExists(p) {
  try {
    return JSON.parse(await fs.readFile(p, "utf8"));
  } catch {
    return null;
  }
}

// Was this LLM stage's output already written (from a previous invocation)? Checked BEFORE
// treating a stage as "needs LLM" — without this, re-invoking the orchestrator after Claude
// has already done the review would just stop at the exact same stage again forever, since
// nothing else observes that the hand-off was fulfilled. Each check both confirms the
// expected file exists AND validates it against the same contract review_output_parser.mjs
// enforces, so a malformed review result is treated as "not done yet", not silently accepted.
async function checkLlmStageComplete(stage, ctx) {
  if (stage === "storyline_review_llm") {
    const json = await readJsonIfExists(path.join(ctx.outDir, "storyline-review.json"));
    if (!json) return null;
    const result = parseStorylineReview(json);
    return result.valid ? { passed: true, output: json } : null;
  }
  if (stage === "visual_qa_llm") {
    const json = await readJsonIfExists(path.join(ctx.outDir, "visual-qa.json"));
    if (!json) return null;
    const result = parseVisualQa(json);
    return result.valid ? { passed: true, output: json } : null;
  }
  if (stage === "fresh_eye_review_llm") {
    const json = await readJsonIfExists(path.join(ctx.outDir, "fresh-eye-review.json"));
    if (!json) return null;
    const result = parseFreshEyeReview(json);
    return result.valid ? { passed: true, output: json } : null;
  }
  if (stage === "targeted_revision_llm") {
    // No single review-output contract here (this stage APPLIES prior findings, it doesn't
    // produce new ones) — completion is signaled by the marker file the instructions ask
    // Claude to write after running apply_targeted_revision.mjs (that script's own stdout
    // shape: {patchedSlides, affectedSlides, regressionScope}).
    const json = await readJsonIfExists(path.join(ctx.outDir, "targeted-revision-applied.json"));
    if (!json || !Array.isArray(json.patchedSlides)) return null;
    return { passed: true, output: json };
  }
  return null;
}

async function appendLog(logPath, entry) {
  let log = [];
  try { log = JSON.parse(await fs.readFile(logPath, "utf8")); } catch {}
  log.push(entry);
  await fs.writeFile(logPath, JSON.stringify(log, null, 2));
}

async function runDeterministicStage(stage, ctx) {
  const { outDir, ghostDeckPath, specPath, htmlPath } = ctx;
  const runNode = async (scriptRelPath, args) => {
    try {
      const { stdout } = await execFileAsync("node", [path.join(root, scriptRelPath), ...args]);
      return { passed: true, output: JSON.parse(stdout) };
    } catch (e) {
      let output = null;
      try { output = JSON.parse(e.stdout); } catch {}
      return { passed: false, output, rawError: output ? undefined : String(e.stderr || e.message) };
    }
  };

  if (stage === "ghost_deck_validate") {
    return runNode("scripts/validate_ghost_deck.mjs", [ghostDeckPath]);
  }
  if (stage === "mechanical_qa" || stage === "regression_qa") {
    const args = [specPath];
    if (htmlPath) args.push(htmlPath);
    args.push("-o", path.join(outDir, `${stage}-report.json`));
    return runNode("scripts/run_mechanical_gate.mjs", args);
  }
  if (stage === "render_screenshots") {
    const renderResult = await runNode("scripts/render_spec_to_html.mjs", [specPath, path.join(outDir, "deck.html")]).catch(() => null);
    ctx.htmlPath = path.join(outDir, "deck.html");
    return runNode("scripts/render_html_screenshots.mjs", [ctx.htmlPath, path.join(outDir, "screenshots")]);
  }
  if (stage === "pptx_export") {
    return runNode("scripts/export_spec_to_editable_pptx.mjs", [specPath, path.join(outDir, "deck.pptx")]);
  }
  throw new Error(`unknown deterministic stage: ${stage}`);
}

export async function runPipeline({ mode = "standard", ghostDeckPath, specPath, outDir }) {
  if (!MODE_STAGES[mode]) throw new Error(`unknown mode "${mode}" — expected fast/standard/rigorous`);
  await fs.mkdir(outDir, { recursive: true });
  const logPath = path.join(outDir, "pipeline-log.json");
  const stages = MODE_STAGES[mode];
  const ctx = { outDir, ghostDeckPath, specPath, htmlPath: null };
  const manifest = { mode, stages, completed: [], nextAction: null };

  for (const stage of stages) {
    const startedAt = new Date().toISOString();
    const t0 = Date.now();

    if (LLM_STAGES.has(stage)) {
      const already = await checkLlmStageComplete(stage, ctx);
      if (already) {
        // The hand-off was already fulfilled by a prior invocation (Claude wrote a valid
        // result to the expected path) — record it as completed and fall through to the
        // next stage instead of stopping here again.
        const endedAt = new Date().toISOString();
        await appendLog(logPath, { stage, startedAt, endedAt, durationMs: 0, passed: true, note: "LLM output found from a prior invocation" });
        manifest.completed.push({ stage, passed: true, output: already.output });
        continue;
      }
      // This IS the deliberate hand-off point: the orchestrator stops here rather than
      // fabricating a semantic review. It names the exact prompt file and inputs Claude
      // needs, and the exact path Claude's structured-JSON output should be written to
      // before re-invoking this script to continue past this stage.
      manifest.nextAction = describeNextLlmAction(stage, ctx);
      await appendLog(logPath, { stage, startedAt, endedAt: startedAt, durationMs: 0, passed: null, note: "awaiting LLM step — see manifest.nextAction" });
      return manifest;
    }

    const result = await runDeterministicStage(stage, ctx);
    const endedAt = new Date().toISOString();
    await appendLog(logPath, { stage, startedAt, endedAt, durationMs: Date.now() - t0, passed: result.passed, note: result.passed ? undefined : "see stage report for errors" });
    manifest.completed.push({ stage, passed: result.passed, output: result.output });

    if (!result.passed && (stage === "ghost_deck_validate" || stage === "mechanical_qa" || stage === "regression_qa")) {
      // Critical-error gate: a failed deterministic check blocks the pipeline outright — no
      // stage after this one runs until it's fixed and this script is re-invoked.
      manifest.nextAction = { type: "fix_and_rerun", stage, reason: `${stage} failed — fix the reported errors, then re-run the pipeline from this stage.` };
      return manifest;
    }
  }
  manifest.nextAction = { type: "done" };
  return manifest;
}

function describeNextLlmAction(stage, ctx) {
  const base = { type: "llm_review_required", stage };
  if (stage === "storyline_review_llm") {
    return { ...base, promptFile: "references/storyline-review-prompt.md", input: ctx.ghostDeckPath, writeResultTo: path.join(ctx.outDir, "storyline-review.json"), instructions: "Run the Storyline Review per the prompt file, isolated from Creator reasoning. Write its structured JSON output to writeResultTo, apply any accepted fixes to the Ghost Deck, then re-invoke run_pipeline.mjs." };
  }
  if (stage === "visual_qa_llm") {
    return { ...base, promptFile: "references/visual-qa-prompt.md", input: path.join(ctx.outDir, "screenshots"), writeResultTo: path.join(ctx.outDir, "visual-qa.json"), instructions: "Review each screenshot per the prompt file. Write structured JSON findings to writeResultTo, then re-invoke run_pipeline.mjs." };
  }
  if (stage === "fresh_eye_review_llm") {
    // deck.pptx does not exist yet at this point in the stage order (pptx_export is the
    // LAST stage, after this one) — deck.html (written by render_screenshots, which always
    // runs before this stage in every mode) is what actually exists to hand the reviewer.
    // content-review-prompt.md explicitly accepts HTML/PDF/PPTX, so this is within contract.
    return { ...base, promptFile: "references/content-review-prompt.md", input: path.join(ctx.outDir, "deck.html"), writeResultTo: path.join(ctx.outDir, "fresh-eye-review.json"), instructions: "Hand the deck to an ISOLATED reviewer (no internal reasoning, template names, or self-assessed weaknesses). Write structured JSON findings to writeResultTo, then re-invoke run_pipeline.mjs." };
  }
  if (stage === "targeted_revision_llm") {
    return {
      ...base,
      writeResultTo: path.join(ctx.outDir, "targeted-revision-applied.json"),
      instructions: `For every accepted/modified finding (log dispositions via scripts/log_review_disposition.mjs first), build a patches.json and run scripts/apply_targeted_revision.mjs -o ${ctx.specPath}, then write that command's own JSON stdout to writeResultTo (this file's presence is what tells the orchestrator this stage is done) before re-invoking run_pipeline.mjs to run Regression QA. If there were zero accepted/modified findings, still write writeResultTo as {"patchedSlides":[],"affectedSlides":[],"regressionScope":[]} so the pipeline can proceed.`,
    };
  }
  return base;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const get = (flag, def) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : def; };
  const mode = get("--mode", "standard");
  const ghostDeckPath = get("--ghost-deck");
  const specPath = get("--spec");
  const outDir = get("--out-dir", "generated/pipeline-run");
  if (!ghostDeckPath || !specPath) {
    console.error("usage: node scripts/run_pipeline.mjs --mode fast|standard|rigorous --ghost-deck <gd.json> --spec <spec.json> --out-dir <dir>");
    process.exit(2);
  }
  const manifest = await runPipeline({ mode, ghostDeckPath, specPath, outDir });
  console.log(JSON.stringify(manifest, null, 2));
}
