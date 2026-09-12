// reference_pattern_selector.mjs — Reference Pattern Selector, ported from an external
// project's reference-pattern-selector.js (REFERENCE-PATTERN-SELECTOR-V0-SPEC.json, Revision
// 5), initially limited to the 3 families that project's own Selector Holdout rounds 2-3
// scored 10/10 with zero wrong selections (matrix, hierarchy, roadmap-phaseband) — see
// pipeline/reference-patterns/library.json's sourceNote for why those 3 and not the rest of
// that project's library. Library v0.2 (starting with RP-KPI-EXEC-DASHBOARD-01) extends this
// same eligibility-checking core with new, independently-defined patterns/structural checks
// that have no counterpart in the external project — same framework, new registrations.
//
// Deliberate simplification vs the original: the source project's selectPattern() takes a
// separately-computed `visualPlan` (family/variant guessed from ALREADY-AUTHORED, free-text
// content by a Visual Planner that has to infer intent from ambiguous wording) plus this
// slide's Pre-family Semantic IR. This pipeline generates content fresh — an LLM authors the
// Pre-family Semantic IR (elements[]/relationships[]) DIRECTLY against a chosen pattern's own
// useWhen/requiredSemanticRoles/relationshipsRequired contract (Path B: origin="authored", no
// regex inference needed) — so there is no ambiguous free text to classify family/variant
// FROM. `family`/`variant` are simply passed in as what the author intended, and this script's
// real job — faithfully ported, unchanged in substance — is verifying the authored
// elements/relationships ACTUALLY satisfy the intended pattern's eligibility contract, exactly
// the same structural checks the source project validated across 3 real holdout rounds. That
// eligibility check is what's reused; the free-text-classification half is not, because this
// pipeline doesn't have the problem it solves.
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const LIBRARY_PATH = path.join(root, "reference-patterns/library.json");
const REGISTRY_PATH = path.join(root, "reference-patterns/registry.json");

async function loadLibrary() {
  return JSON.parse(await fs.readFile(LIBRARY_PATH, "utf8"));
}
async function loadRegistry() {
  return JSON.parse(await fs.readFile(REGISTRY_PATH, "utf8"));
}

// Which patterns are even candidates for a given (family, variant) — ported verbatim from
// the source project's familyVariantToPatternMap (Revision 5): matrix routes to BOTH
// hero/plain patterns regardless of which variant the author intended, letting the registry's
// own MATRIX_HERO_SHAPE/MATRIX_PLAIN_SHAPE structural checks decide, since which one a slide
// actually satisfies is a fact about the authored content, not the author's stated intent.
const FAMILY_VARIANT_MAP = {
  "matrix|hero": ["RP-MATRIX-HERO-01", "RP-MATRIX-PLAIN-01"],
  "matrix|plain": ["RP-MATRIX-PLAIN-01", "RP-MATRIX-HERO-01"],
  // Badge List is a 3rd, independently-defined quadrant shape (summary + iconed item list +
  // a mandatory insights panel), not cross-routed with hero/plain — its authoring convention
  // (item sub-groups nested under each quadrant's reserved groupId) has no equivalent in
  // Hero/Plain's axis_membership-relationship vocabulary, so there is nothing for those 2
  // patterns' structural checks to even evaluate against Badge List-authored content.
  "matrix|badge-list": ["RP-MATRIX-BADGELIST-01"],
  "hierarchy|standard": ["RP-HIERARCHY-WORKSTREAM-01"],
  "roadmap-phaseband|standard": ["RP-PMI-ROADMAP-01"],
  "kpi-dashboard|standard": ["RP-KPI-EXEC-DASHBOARD-01"],
  "comparison-table|standard": ["RP-COMPARISON-TABLE-01"],
  "decision-ask|standard": ["RP-DECISION-ASK-01"],
  "key-takeaways|standard": ["RP-KEY-TAKEAWAYS-01"],
  "100day-workstream|standard": ["RP-100DAY-WORKSTREAM-01"],
};

export async function runRegistryConsistencyGate(registry, library) {
  const problems = [];
  const actualHash = crypto.createHash("sha256").update(await fs.readFile(LIBRARY_PATH)).digest("hex");
  if (registry.sourceLibraryPin.sha256 !== actualHash) {
    problems.push(`sourceLibraryPin.sha256 mismatch: registry pins ${registry.sourceLibraryPin.sha256}, actual file hash is ${actualHash}`);
  }
  const libraryIds = new Set(library.patterns.map((p) => p.patternId));
  const registryIds = new Set(Object.keys(registry.patterns));
  for (const id of libraryIds) if (!registryIds.has(id)) problems.push(`patternId ${id} exists in Library but has no Registry entry`);
  for (const id of registryIds) if (!libraryIds.has(id)) problems.push(`patternId ${id} exists in Registry but has no Library entry`);
  const reachable = Object.entries(registry.patterns).filter(([, p]) => p.reachability === "REACHABLE_V0").map(([id]) => id);
  const mapped = new Set(Object.values(FAMILY_VARIANT_MAP).flat());
  for (const id of reachable) if (!mapped.has(id)) problems.push(`pattern ${id} is REACHABLE_V0 but does not appear in FAMILY_VARIANT_MAP`);
  for (const id of mapped) {
    if (!registryIds.has(id)) problems.push(`FAMILY_VARIANT_MAP references unknown pattern ${id}`);
    else if (registry.patterns[id].reachability !== "REACHABLE_V0") problems.push(`FAMILY_VARIANT_MAP references ${id}, but its registry entry is not REACHABLE_V0`);
  }
  if (problems.length) throw new Error("Registry Consistency Gate FAILED:\n" + problems.map((p) => "  - " + p).join("\n"));
  return { pass: true, checkedAt: new Date().toISOString() };
}

function endpointKey(ep) { return ep ? `${ep.kind}:${ep.id}` : null; }
function attrsCanonical(attrs) {
  const a = attrs || {};
  return JSON.stringify(Object.keys(a).sort().map((k) => [k, a[k]]));
}
function relCanonicalTuple(r) {
  return [r.type, endpointKey(r.from), endpointKey(r.to), attrsCanonical(r.attributes), [...(r.sourceIds || [])].sort().join(",")].join("|");
}
function priorityCompare(a, b) {
  const aAuth = a.origin === "authored" ? 0 : 1;
  const bAuth = b.origin === "authored" ? 0 : 1;
  if (aAuth !== bAuth) return aAuth - bAuth;
  const aConf = a.confidence == null ? -1 : a.confidence;
  const bConf = b.confidence == null ? -1 : b.confidence;
  if (aConf !== bConf) return bConf - aConf;
  return relCanonicalTuple(a) < relCanonicalTuple(b) ? -1 : relCanonicalTuple(a) > relCanonicalTuple(b) ? 1 : 0;
}
function matchRelationships(relationships, spec) {
  return relationships.filter((r) => {
    if (r.type !== spec.type) return false;
    if (spec.attributes) {
      for (const k of Object.keys(spec.attributes)) {
        if (!r.attributes || r.attributes[k] !== spec.attributes[k]) return false;
      }
    }
    return true;
  });
}
function selectWitnessesMinCount(matching, min) {
  return [...matching].sort(priorityCompare).slice(0, Math.min(min, matching.length));
}
function selectWitnessesMinimalJointCover(matching, minDistinctFromGroups, minDistinctToTargets) {
  const sorted = [...matching].sort(priorityCompare);
  const witnesses = [];
  const seenFrom = new Set();
  const seenTo = new Set();
  for (const r of sorted) {
    if (seenFrom.size >= minDistinctFromGroups) break;
    const fromKey = endpointKey(r.from);
    if (seenFrom.has(fromKey)) continue;
    const sameGroup = sorted.filter((x) => endpointKey(x.from) === fromKey);
    const preferred = sameGroup.find((x) => !seenTo.has(endpointKey(x.to))) || sameGroup[0];
    witnesses.push(preferred);
    seenFrom.add(fromKey);
    seenTo.add(endpointKey(preferred.to));
  }
  for (const r of sorted) {
    if (seenTo.size >= minDistinctToTargets) break;
    const toKey = endpointKey(r.to);
    if (seenTo.has(toKey) || witnesses.includes(r)) continue;
    witnesses.push(r);
    seenTo.add(toKey);
    seenFrom.add(endpointKey(r.from));
  }
  return witnesses;
}
function evidenceTrustFromWitnesses(allWitnesses) {
  const authored = allWitnesses.filter((w) => w.origin === "authored").length;
  const inferred = allWitnesses.filter((w) => w.origin === "adapter_inferred");
  return {
    authored,
    adapterInferred: inferred.length,
    minInferenceConfidence: inferred.length ? Math.min(...inferred.map((w) => (w.confidence == null ? 1 : w.confidence))) : null,
  };
}

function elementsByGroupId(elements) {
  const m = new Map();
  for (const el of elements) {
    if (el.groupId == null) continue;
    if (!m.has(el.groupId)) m.set(el.groupId, []);
    m.get(el.groupId).push(el);
  }
  return m;
}
function matrixQuadrantGroupSizes(elements, relationships) {
  const axisRels = relationships.filter((r) => r.type === "axis_membership");
  const quadrantGroupIds = [...new Set(axisRels.map((r) => r.from && r.from.id).filter(Boolean))];
  const byGroup = elementsByGroupId(elements);
  return quadrantGroupIds.map((gid) => (byGroup.get(gid) || []).length);
}
function checkMatrixHeroShape(elements, relationships) {
  const sizes = matrixQuadrantGroupSizes(elements, relationships);
  return sizes.length > 0 && sizes.every((n) => n >= 3);
}
function checkMatrixPlainShape(elements, relationships) {
  const sizes = matrixQuadrantGroupSizes(elements, relationships);
  return sizes.length > 0 && sizes.every((n) => n < 3);
}
function checkHierarchySingleRootWith2Children(relationships) {
  const contains = relationships.filter((r) => r.type === "contains");
  if (!contains.length) return { pass: false, reason: "NO_HIERARCHY_ROOT" };
  const fromSet = new Set(contains.map((r) => endpointKey(r.from)));
  const toSet = new Set(contains.map((r) => endpointKey(r.to)));
  const roots = [...fromSet].filter((k) => !toSet.has(k));
  if (roots.length !== 1) return { pass: false, reason: roots.length === 0 ? "NO_HIERARCHY_ROOT" : "MULTIPLE_OR_AMBIGUOUS_ROOTS" };
  const rootKey = roots[0];
  const children = new Set(contains.filter((r) => endpointKey(r.from) === rootKey).map((r) => endpointKey(r.to)));
  return { pass: children.size >= 2, reason: children.size >= 2 ? null : "NO_HIERARCHY_ROOT", rootKey, childCount: children.size };
}
// KPI groups are identified by convention, not by a relationship type (unlike matrix's
// axis_membership or hierarchy/roadmap's contains): any groupId that isn't one of the 2
// reserved container ids ("insights", "trendChart") or a trendChart sub-point ("trendChart-*")
// is a candidate KPI tile. This intentionally keeps KPI tiles as plain siblings with no
// relationship between them — order comes from authoring order (element array position),
// same discipline the hierarchy adapter already relies on for its children when no `sequence`
// is authored.
const KPI_RESERVED_GROUP_IDS = new Set(["insights", "trendChart"]);
function isKpiCandidateGroup(groupId) {
  return groupId != null && !KPI_RESERVED_GROUP_IDS.has(groupId) && !groupId.startsWith("trendChart-");
}
function checkKpiCountInRange(elements, min, max) {
  const byGroup = elementsByGroupId(elements);
  const qualifying = [...byGroup.entries()].filter(([gid, els]) => {
    if (!isKpiCandidateGroup(gid)) return false;
    return els.some((e) => e.semanticRole === "title") && els.some((e) => e.semanticRole === "value");
  });
  return { pass: qualifying.length >= min && qualifying.length <= max, count: qualifying.length };
}

// Comparison-table groups are identified by convention, same idiom as KPI tiles: any group
// that isn't the 2 reserved container ids ("criteria", "recommendation") is a candidate
// column. No relationship type is needed here either — the grid is entirely positional (row
// order = criteria's own array order; a candidate's Nth "value" element answers the Nth
// criterion), same discipline KPI tiles already established for order-without-relationships.
const CMP_RESERVED_GROUP_IDS = new Set(["criteria", "recommendation", "comparisonSummary"]);
function isCmpCandidateGroup(groupId) {
  return groupId != null && !CMP_RESERVED_GROUP_IDS.has(groupId);
}
function checkComparisonShapeValid(elements, minCandidates, maxCandidates, minCriteria) {
  const byGroup = elementsByGroupId(elements);
  const criteriaEls = (byGroup.get("criteria") || []).filter((e) => e.semanticRole === "title");
  if (criteriaEls.length < minCriteria) return { pass: false, reason: `only ${criteriaEls.length} criteria (need >=${minCriteria})` };
  const candidateEntries = [...byGroup.entries()].filter(([gid]) => isCmpCandidateGroup(gid));
  if (candidateEntries.length < minCandidates || candidateEntries.length > maxCandidates) {
    return { pass: false, reason: `${candidateEntries.length} candidates (need ${minCandidates}-${maxCandidates})` };
  }
  for (const [gid, els] of candidateEntries) {
    if (!els.some((e) => e.semanticRole === "title")) return { pass: false, reason: `candidate group "${gid}" has no title (label) element` };
    const values = els.filter((e) => e.semanticRole === "value");
    if (values.length !== criteriaEls.length) {
      return { pass: false, reason: `candidate group "${gid}" has ${values.length} value cells, expected ${criteriaEls.length} (one per criterion)` };
    }
  }
  return { pass: true, candidateCount: candidateEntries.length, criteriaCount: criteriaEls.length };
}

// Decision groups are identified by convention, same idiom as KPI tiles / comparison
// candidates: any group that isn't the 2 reserved container ids ("recommendation",
// "nextSteps") is a decision column. Column order = authoring order — no relationship needed.
const DECISION_RESERVED_GROUP_IDS = new Set(["recommendation", "nextSteps"]);
function isDecisionCandidateGroup(groupId) {
  return groupId != null && !DECISION_RESERVED_GROUP_IDS.has(groupId);
}
function checkDecisionCountInRange(elements, min, max) {
  const byGroup = elementsByGroupId(elements);
  const entries = [...byGroup.entries()].filter(([gid]) => isDecisionCandidateGroup(gid));
  if (entries.length < min || entries.length > max) {
    return { pass: false, reason: `${entries.length} decision groups (need ${min}-${max})` };
  }
  for (const [gid, els] of entries) {
    if (!els.some((e) => e.semanticRole === "number")) return { pass: false, reason: `decision group "${gid}" has no number element` };
    if (!els.some((e) => e.semanticRole === "title")) return { pass: false, reason: `decision group "${gid}" has no title element` };
    if (!els.some((e) => e.semanticRole === "bullets")) return { pass: false, reason: `decision group "${gid}" has no action (bullets) elements` };
  }
  return { pass: true, count: entries.length };
}

// Takeaway groups: same positional idiom as decision groups, but with a 3rd reserved
// prefix (insight panel ITEMS, "insightPanel-*") alongside 2 exact reserved ids — unlike
// decision_page's recommendation/nextSteps, insightPanel and soWhat are NOT optional here:
// omitting either is exactly this pattern degenerating into 3 plain cards, which already has
// its own simpler template. No relationship type is needed — insight-panel item order is
// authoring order, same discipline as every other Library v0.2 pattern's sibling lists.
const TAKEAWAY_RESERVED_GROUP_IDS = new Set(["insightPanel", "soWhat"]);
function isTakeawayCandidateGroup(groupId) {
  return groupId != null && !TAKEAWAY_RESERVED_GROUP_IDS.has(groupId) && !groupId.startsWith("insightPanel-");
}
function checkTakeawayShapeValid(elements, min, max) {
  const byGroup = elementsByGroupId(elements);
  const entries = [...byGroup.entries()].filter(([gid]) => isTakeawayCandidateGroup(gid));
  if (entries.length < min || entries.length > max) {
    return { pass: false, reason: `${entries.length} takeaway groups (need ${min}-${max})` };
  }
  for (const [gid, els] of entries) {
    if (!els.some((e) => e.semanticRole === "number")) return { pass: false, reason: `takeaway group "${gid}" has no number element` };
    if (!els.some((e) => e.semanticRole === "category")) return { pass: false, reason: `takeaway group "${gid}" has no category element` };
    if (!els.some((e) => e.semanticRole === "headline")) return { pass: false, reason: `takeaway group "${gid}" has no headline element` };
    if (!els.some((e) => e.semanticRole === "body")) return { pass: false, reason: `takeaway group "${gid}" has no body (supportText) element` };
  }
  const itemEntries = [...byGroup.entries()].filter(([gid]) => gid.startsWith("insightPanel-"));
  if (!itemEntries.length) return { pass: false, reason: "no insightPanel items (insightPanel is mandatory for this pattern, not optional)" };
  for (const [gid, els] of itemEntries) {
    if (!els.some((e) => e.semanticRole === "number")) return { pass: false, reason: `insight item "${gid}" has no number element` };
    if (!els.some((e) => e.semanticRole === "title")) return { pass: false, reason: `insight item "${gid}" has no title element` };
    if (!els.some((e) => e.semanticRole === "body")) return { pass: false, reason: `insight item "${gid}" has no body element` };
  }
  const soWhatEls = byGroup.get("soWhat");
  if (!soWhatEls || !soWhatEls.some((e) => e.semanticRole === "body")) {
    return { pass: false, reason: "no soWhat body element (soWhat is mandatory for this pattern, not optional)" };
  }
  return { pass: true, count: entries.length, insightCount: itemEntries.length };
}

// Matrix Badge List: a 3rd quadrant shape (alongside Hero's title/body/evidence and Plain's
// single-label text) — each quadrant instead holds a short summary plus a list of
// individually-iconed badge items, and the whole slide carries a mandatory right-side
// insights panel plus explicit low/high axis endpoint labels. Deliberately does NOT reuse
// Hero/Plain's axis_membership relationship machinery — Badge List's quadrant groupIds are
// the same 4 canonical position strings, but items nest one level deeper under each
// quadrant's own reserved item-groupId prefix (`${position}-item-*`), which
// axis_membership has no vocabulary for. Reuses kpi_dashboard's "insights" reserved
// group/`bullets`-elements convention verbatim for the insight panel (same field, same shape,
// same semantic purpose — no reason to duplicate it under a new name).
const MATRIX_QUADRANT_POSITIONS = ["top-left", "top-right", "bottom-left", "bottom-right"];
function checkMatrixBadgeListShape(elements) {
  const byGroup = elementsByGroupId(elements);
  for (const pos of MATRIX_QUADRANT_POSITIONS) {
    const els = byGroup.get(pos);
    if (!els) return { pass: false, reason: `missing quadrant group "${pos}"` };
    if (!els.some((e) => e.semanticRole === "number")) return { pass: false, reason: `quadrant "${pos}" has no number element` };
    if (!els.some((e) => e.semanticRole === "title")) return { pass: false, reason: `quadrant "${pos}" has no title (label) element` };
    const itemEntries = [...byGroup.entries()].filter(([gid]) => gid.startsWith(`${pos}-item-`));
    if (!itemEntries.length) return { pass: false, reason: `quadrant "${pos}" has no items (need >=1)` };
    for (const [gid, itemEls] of itemEntries) {
      if (!itemEls.some((e) => e.semanticRole === "title")) return { pass: false, reason: `item "${gid}" has no title element` };
    }
  }
  const axisX = byGroup.get("axisX");
  if (!axisX || !axisX.some((e) => e.semanticRole === "title") || axisX.filter((e) => e.semanticRole === "label").length !== 2) {
    return { pass: false, reason: "axisX group missing its title or its 2 low/high label elements" };
  }
  const axisY = byGroup.get("axisY");
  if (!axisY || !axisY.some((e) => e.semanticRole === "title") || axisY.filter((e) => e.semanticRole === "label").length !== 2) {
    return { pass: false, reason: "axisY group missing its title or its 2 low/high label elements" };
  }
  const insightItems = (byGroup.get("insights") || []).filter((e) => e.semanticRole === "bullets");
  if (!insightItems.length) return { pass: false, reason: "no insights bullets (insights panel is mandatory for this pattern, not optional)" };
  return { pass: true, insightCount: insightItems.length };
}

// RP-100DAY-WORKSTREAM-01: a swimlane x phase 2D matrix, not a timeline — independent of
// RP-PMI-ROADMAP-01's contains/sequence shape. Groups are classified by a reserved groupId
// PREFIX (same idiom as this library's other reserved-prefix conventions, e.g.
// RP-KEY-TAKEAWAYS-01's "insightPanel-*"), since — unlike Matrix Badge List's 4 fixed
// canonical positions — there is no small fixed set of literal names to reuse here:
// "workstream-*" / "phase-*" / "activity-*" / "milestone-*". Activities and milestones cross-
// reference their workstream/phase by an explicit authored `workstreamRef`/`phaseRef` element
// (the referenced group's own groupId) rather than by parsing structure out of the groupId
// string, which would be fragile if an author's own workstream/phase id ever contained a
// separator character.
function checkWorkstream100DayShape(elements) {
  const byGroup = elementsByGroupId(elements);
  const groupIds = [...byGroup.keys()];
  const workstreamIds = groupIds.filter((g) => g.startsWith("workstream-"));
  const phaseIds = groupIds.filter((g) => g.startsWith("phase-"));
  const activityIds = groupIds.filter((g) => g.startsWith("activity-"));
  const milestoneIds = groupIds.filter((g) => g.startsWith("milestone-"));

  if (workstreamIds.length < 3 || workstreamIds.length > 5) {
    return { pass: false, reason: `${workstreamIds.length} workstream groups (need 3-5)` };
  }
  for (const gid of workstreamIds) {
    const els = byGroup.get(gid);
    if (!els.some((e) => e.semanticRole === "title")) return { pass: false, reason: `workstream "${gid}" has no title element` };
    if (!els.some((e) => e.semanticRole === "icon")) return { pass: false, reason: `workstream "${gid}" has no icon element (icon is required for this pattern)` };
  }

  if (phaseIds.length !== 3) {
    return { pass: false, reason: `${phaseIds.length} phase groups (need exactly 3 — phase count is fixed for this pattern's v1)` };
  }
  const orders = new Set();
  for (const gid of phaseIds) {
    const els = byGroup.get(gid);
    if (!els.some((e) => e.semanticRole === "title")) return { pass: false, reason: `phase "${gid}" has no title element` };
    const order = els.find((e) => e.semanticRole === "order")?.value;
    if (!["1", "2", "3"].includes(String(order))) return { pass: false, reason: `phase "${gid}" has no valid order element (must be 1, 2, or 3)` };
    if (orders.has(String(order))) return { pass: false, reason: `phase "${gid}" duplicates order ${order} — each of 1/2/3 must be used exactly once` };
    orders.add(String(order));
  }

  const expectedActivityCount = workstreamIds.length * phaseIds.length;
  if (activityIds.length !== expectedActivityCount) {
    return { pass: false, reason: `${activityIds.length} activity groups, expected exactly ${expectedActivityCount} (${workstreamIds.length} workstreams x ${phaseIds.length} phases — 100% coverage, no gaps or duplicates)` };
  }
  const coverage = new Set();
  for (const gid of activityIds) {
    const els = byGroup.get(gid);
    if (!els.some((e) => e.semanticRole === "title")) return { pass: false, reason: `activity "${gid}" has no title element` };
    if (!els.some((e) => e.semanticRole === "icon")) return { pass: false, reason: `activity "${gid}" has no icon element (icon is required for this pattern)` };
    if (!els.some((e) => e.semanticRole === "bullets")) return { pass: false, reason: `activity "${gid}" has no bullets elements (need >=1)` };
    const wsRef = els.find((e) => e.semanticRole === "workstreamRef")?.value;
    const phRef = els.find((e) => e.semanticRole === "phaseRef")?.value;
    if (!wsRef || !workstreamIds.includes(wsRef)) return { pass: false, reason: `activity "${gid}" has no valid workstreamRef (must name an authored workstream group)` };
    if (!phRef || !phaseIds.includes(phRef)) return { pass: false, reason: `activity "${gid}" has no valid phaseRef (must name an authored phase group)` };
    const key = `${wsRef}::${phRef}`;
    if (coverage.has(key)) return { pass: false, reason: `activity "${gid}" duplicates the workstream/phase pair already covered by another activity (cross-assignment error)` };
    coverage.add(key);
  }
  if (coverage.size !== expectedActivityCount) {
    return { pass: false, reason: `only ${coverage.size} of ${expectedActivityCount} workstream x phase combinations are covered by an activity` };
  }

  if (milestoneIds.length !== 3) {
    return { pass: false, reason: `${milestoneIds.length} milestone groups (need exactly 3 for v1 — one per phase)` };
  }
  const milestonePositions = new Set();
  const milestonePhaseRefs = new Set();
  for (const gid of milestoneIds) {
    const els = byGroup.get(gid);
    if (!els.some((e) => e.semanticRole === "label")) return { pass: false, reason: `milestone "${gid}" has no label element` };
    if (!els.some((e) => e.semanticRole === "title")) return { pass: false, reason: `milestone "${gid}" has no title element` };
    const position = els.find((e) => e.semanticRole === "position")?.value;
    if (!["1", "2", "3"].includes(String(position))) return { pass: false, reason: `milestone "${gid}" has no valid position element (must be 1, 2, or 3)` };
    if (milestonePositions.has(String(position))) return { pass: false, reason: `milestone "${gid}" duplicates position ${position} — each of 1/2/3 must be used exactly once` };
    milestonePositions.add(String(position));
    const phRef = els.find((e) => e.semanticRole === "phaseRef")?.value;
    if (!phRef || !phaseIds.includes(phRef)) return { pass: false, reason: `milestone "${gid}" has no valid phaseRef (must name an authored phase group)` };
    if (milestonePhaseRefs.has(phRef)) return { pass: false, reason: `milestone "${gid}" shares a phaseRef with another milestone — each phase gets exactly one milestone` };
    milestonePhaseRefs.add(phRef);
  }

  return { pass: true, workstreamCount: workstreamIds.length, phaseCount: phaseIds.length, activityCount: activityIds.length, milestoneCount: milestoneIds.length };
}

function checkPmiHasEmphasisInSomeGroup(elements, relationships) {
  const groupIds = new Set();
  relationships.filter((r) => r.type === "contains" || r.type === "sequence").forEach((r) => {
    if (r.from) groupIds.add(r.from.id);
    if (r.to) groupIds.add(r.to.id);
  });
  return elements.some((el) => el.groupId != null && groupIds.has(el.groupId) && el.emphasis === true);
}

function evaluatePattern(patternId, registryEntry, elements, relationships) {
  const evidence = [];
  const failedChecks = [];
  const allWitnesses = [];

  for (const req of registryEntry.requiredRoles || []) {
    const count = elements.filter((e) => e.semanticRole === req.role).length;
    if (count < req.min) failedChecks.push(`requiredRoles: ${req.role} x${req.min} (found ${count})`);
    else evidence.push(`requiredRoles satisfied: ${req.role} x${count} (>= ${req.min})`);
  }

  for (const req of registryEntry.requiredRelationships || []) {
    const matching = matchRelationships(relationships, req);
    if (req.witnessBy === "distinctToTarget" || req.witnessBy === "minimalJointCover") {
      const distinctFrom = new Set(matching.map((r) => endpointKey(r.from))).size;
      const distinctTo = new Set(matching.map((r) => endpointKey(r.to))).size;
      const okFrom = req.minDistinctFromGroups == null || distinctFrom >= req.minDistinctFromGroups;
      const okTo = req.minDistinctToTargets == null || distinctTo >= req.minDistinctToTargets;
      if (!okFrom || !okTo) {
        failedChecks.push(`requiredRelationships: ${req.type} needs minDistinctFromGroups=${req.minDistinctFromGroups}/minDistinctToTargets=${req.minDistinctToTargets}, found ${distinctFrom}/${distinctTo}`);
      } else {
        const witnesses = selectWitnessesMinimalJointCover(matching, req.minDistinctFromGroups || 0, req.minDistinctToTargets || 0);
        allWitnesses.push(...witnesses);
        witnesses.forEach((w) => evidence.push(`${req.type} witness -> ${w.to.id} (origin=${w.origin}, confidence=${w.confidence})`));
      }
    } else {
      const min = req.min || 1;
      if (matching.length < min) {
        failedChecks.push(`requiredRelationships: ${req.type}${req.attributes ? " " + JSON.stringify(req.attributes) : ""} needs >=${min}, found ${matching.length}`);
      } else {
        const witnesses = selectWitnessesMinCount(matching, min);
        allWitnesses.push(...witnesses);
        witnesses.forEach((w) => evidence.push(`${req.type} witness (origin=${w.origin}, confidence=${w.confidence})`));
      }
    }
  }

  for (const checkName of registryEntry.structuralChecks || []) {
    if (checkName === "MATRIX_HERO_SHAPE") {
      if (checkMatrixHeroShape(elements, relationships)) evidence.push("MATRIX_HERO_SHAPE passed");
      else failedChecks.push("MATRIX_HERO_SHAPE failed");
    } else if (checkName === "MATRIX_PLAIN_SHAPE") {
      if (checkMatrixPlainShape(elements, relationships)) evidence.push("MATRIX_PLAIN_SHAPE passed");
      else failedChecks.push("MATRIX_PLAIN_SHAPE failed");
    } else if (checkName === "HIERARCHY_SINGLE_ROOT_WITH_2_CHILDREN") {
      const r = checkHierarchySingleRootWith2Children(relationships);
      if (r.pass) evidence.push(`HIERARCHY_SINGLE_ROOT_WITH_2_CHILDREN passed: root ${r.rootKey} has ${r.childCount} children`);
      else failedChecks.push(`HIERARCHY_SINGLE_ROOT_WITH_2_CHILDREN failed (${r.reason})`);
    } else if (checkName === "PMI_HAS_EMPHASIS_IN_SOME_GROUP") {
      if (checkPmiHasEmphasisInSomeGroup(elements, relationships)) evidence.push("PMI_HAS_EMPHASIS_IN_SOME_GROUP passed");
      else failedChecks.push("PMI_HAS_EMPHASIS_IN_SOME_GROUP failed");
    } else if (checkName === "KPI_COUNT_IN_RANGE") {
      const def = registryEntry.structuralCheckDefinitions?.KPI_COUNT_IN_RANGE || {};
      const min = def.min ?? 3;
      const max = def.max ?? 5;
      const r = checkKpiCountInRange(elements, min, max);
      if (r.pass) evidence.push(`KPI_COUNT_IN_RANGE passed: ${r.count} qualifying KPI groups (${min}-${max})`);
      else failedChecks.push(`KPI_COUNT_IN_RANGE failed: ${r.count} qualifying KPI groups, need ${min}-${max}`);
    } else if (checkName === "COMPARISON_SHAPE_VALID") {
      const def = registryEntry.structuralCheckDefinitions?.COMPARISON_SHAPE_VALID || {};
      const r = checkComparisonShapeValid(elements, def.minCandidates ?? 2, def.maxCandidates ?? 5, def.minCriteria ?? 2);
      if (r.pass) evidence.push(`COMPARISON_SHAPE_VALID passed: ${r.candidateCount} candidates x ${r.criteriaCount} criteria`);
      else failedChecks.push(`COMPARISON_SHAPE_VALID failed: ${r.reason}`);
    } else if (checkName === "DECISION_COUNT_IN_RANGE") {
      const def = registryEntry.structuralCheckDefinitions?.DECISION_COUNT_IN_RANGE || {};
      const r = checkDecisionCountInRange(elements, def.min ?? 2, def.max ?? 4);
      if (r.pass) evidence.push(`DECISION_COUNT_IN_RANGE passed: ${r.count} decision groups`);
      else failedChecks.push(`DECISION_COUNT_IN_RANGE failed: ${r.reason}`);
    } else if (checkName === "TAKEAWAY_SHAPE_VALID") {
      const def = registryEntry.structuralCheckDefinitions?.TAKEAWAY_SHAPE_VALID || {};
      const r = checkTakeawayShapeValid(elements, def.min ?? 2, def.max ?? 4);
      if (r.pass) evidence.push(`TAKEAWAY_SHAPE_VALID passed: ${r.count} takeaways, ${r.insightCount} insight items, soWhat present`);
      else failedChecks.push(`TAKEAWAY_SHAPE_VALID failed: ${r.reason}`);
    } else if (checkName === "MATRIX_BADGELIST_SHAPE") {
      const r = checkMatrixBadgeListShape(elements);
      if (r.pass) evidence.push(`MATRIX_BADGELIST_SHAPE passed: 4 quadrants, ${r.insightCount} insight items`);
      else failedChecks.push(`MATRIX_BADGELIST_SHAPE failed: ${r.reason}`);
    } else if (checkName === "WORKSTREAM_100DAY_SHAPE") {
      const r = checkWorkstream100DayShape(elements);
      if (r.pass) evidence.push(`WORKSTREAM_100DAY_SHAPE passed: ${r.workstreamCount} workstreams x ${r.phaseCount} phases, ${r.activityCount} activities, ${r.milestoneCount} milestones`);
      else failedChecks.push(`WORKSTREAM_100DAY_SHAPE failed: ${r.reason}`);
    } else {
      failedChecks.push(`unknown structuralCheck: ${checkName}`);
    }
  }

  for (const dq of registryEntry.disqualifiers || []) {
    if (dq === "MATRIX_SINGLE_AXIS") {
      const axisRels = relationships.filter((r) => r.type === "axis_membership");
      const distinctTo = new Set(axisRels.map((r) => endpointKey(r.to))).size;
      if (distinctTo < 2) failedChecks.push("disqualifier MATRIX_SINGLE_AXIS fired");
    }
  }

  const eligible = failedChecks.length === 0;
  return { patternId, eligible, evidence, failedChecks, evidenceTrust: evidenceTrustFromWitnesses(allWitnesses) };
}

/**
 * @param {{family: string, variant: string}} intent - what the author (LLM) intended to
 *   produce, e.g. {family:"matrix", variant:"hero"}. Not inferred — stated directly, since
 *   this pipeline authors content against a chosen pattern rather than classifying free text.
 * @param {{elements: object[], relationships: object[]}} preFamilyIR
 */
export async function selectPattern(intent, preFamilyIR) {
  const library = await loadLibrary();
  const registry = await loadRegistry();
  await runRegistryConsistencyGate(registry, library);
  const libraryById = new Map(library.patterns.map((p) => [p.patternId, p]));

  const mapKey = `${intent.family}|${intent.variant}`;
  const consideredIds = FAMILY_VARIANT_MAP[mapKey] || [];
  const out = {
    selectedPattern: null,
    eligibility: "NOT_CONSIDERED",
    evidence: [],
    rejectedCandidates: [],
    slideSpecTemplate: null,
    slideSpecShape: null,
  };
  if (!consideredIds.length) return out;

  const elements = preFamilyIR.elements || [];
  const relationships = preFamilyIR.relationships || [];
  const results = consideredIds.map((id) => evaluatePattern(id, registry.patterns[id], elements, relationships));
  const eligibleResults = results.filter((r) => r.eligible);
  results.filter((r) => !r.eligible).forEach((r) => out.rejectedCandidates.push({ patternId: r.patternId, reason: r.failedChecks.join("; ") }));

  if (!eligibleResults.length) {
    out.eligibility = "FAIL";
    return out;
  }
  eligibleResults.sort((a, b) => b.evidenceTrust.authored - a.evidenceTrust.authored);
  const chosen = eligibleResults[0];
  const libEntry = libraryById.get(chosen.patternId);

  out.eligibility = "PASS";
  out.selectedPattern = chosen.patternId;
  out.evidence = chosen.evidence;
  out.slideSpecTemplate = libEntry?.slideSpecTemplate || null;
  out.slideSpecShape = libEntry?.slideSpecShape || null;
  return out;
}
