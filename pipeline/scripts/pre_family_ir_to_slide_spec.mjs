// pre_family_ir_to_slide_spec.mjs — deterministic conversion from a selected Reference
// Pattern's Pre-family Semantic IR (elements[]/relationships[], origin="authored" — Path B,
// no regex inference) into this project's own SlideSpec slide object. This is the piece that
// did not exist anywhere before this integration: reference_pattern_selector.mjs decides
// ELIGIBILITY (does the content qualify for this pattern), this module decides SHAPE (what
// SlideSpec fields the qualifying content becomes) — for the 3 families in Production
// Integration v1 (see pipeline/reference-patterns/library.json).
//
// Authoring convention this module assumes (documented for whoever authors the Pre-family
// IR, human or LLM — see references/pre-family-ir-authoring.md):
//   matrix:     2 elements with semanticRole="chartTicks", groupId=null — the FIRST authored
//               is the Y axis (vertical), the SECOND is the X axis (horizontal). Each
//               quadrant's groupId is literally one of "top-left"/"top-right"/"bottom-left"/
//               "bottom-right" (not an arbitrary id) — this sidesteps needing to interpret
//               axis_membership's free-text `position` attribute for geometry; that attribute
//               only needs to exist to satisfy the Selector's eligibility contract.
//               Per-quadrant element roles: title/body/secondary(evidence)/label(priority
//               badge when title/body present, else the quadrant's own single-sentence text).
//   hierarchy:  root element has semanticRole="title", groupId=null; each child is its own
//               group (groupId = a stable id), with a "title" element and optional
//               "body"/"bullets" elements, linked to the root via a `contains` relationship
//               {from:{kind:"element",id:rootId}, to:{kind:"group",id:childGroupId}}.
//   roadmap:    each phase is its own group (title/subtitle elements) `contains`-linked to
//               its milestone groups (title/date elements, emphasis optional); milestone
//               groups are additionally linked to each other via `sequence` relationships in
//               chronological order. An optional groupId="outcomes" group (semanticRole=
//               "bullets" elements) becomes the slide-level closing band.
function elementsByGroupId(elements) {
  const m = new Map();
  for (const el of elements) {
    if (el.groupId == null) continue;
    if (!m.has(el.groupId)) m.set(el.groupId, []);
    m.get(el.groupId).push(el);
  }
  return m;
}
function findRole(els, role) {
  return els.find((e) => e.semanticRole === role)?.value;
}

const QUADRANT_POSITIONS = new Set(["top-left", "top-right", "bottom-left", "bottom-right"]);

export function preFamilyIrToMatrixQuadrants({ elements }) {
  const axisEls = elements.filter((e) => e.semanticRole === "chartTicks" && e.groupId == null);
  if (axisEls.length !== 2) {
    throw new Error(`matrix adapter: expected exactly 2 axis (chartTicks, groupId=null) elements, found ${axisEls.length}`);
  }
  const [yAxisEl, xAxisEl] = axisEls;
  const byGroup = elementsByGroupId(elements);
  const quadrants = [];
  for (const [groupId, els] of byGroup) {
    if (!QUADRANT_POSITIONS.has(groupId)) continue;
    const title = findRole(els, "title");
    const body = findRole(els, "body");
    const evidence = findRole(els, "secondary");
    const label = findRole(els, "label");
    const emphasis = els.some((e) => e.emphasis === true);
    const quadrant = { position: groupId };
    if (title || body) {
      if (title) quadrant.title = title;
      if (body) quadrant.body = body;
      if (evidence) quadrant.evidence = evidence;
      if (label) quadrant.priorityLabel = label;
    } else if (label) {
      quadrant.label = label;
    }
    if (emphasis) quadrant.emphasis = true;
    quadrants.push(quadrant);
  }
  if (!quadrants.length) throw new Error("matrix adapter: no element carried a groupId matching a canonical quadrant position (top-left/top-right/bottom-left/bottom-right)");
  return { matrix: { yAxis: yAxisEl.value, xAxis: xAxisEl.value }, quadrants };
}

export function preFamilyIrToIssueTree({ elements, relationships }) {
  const contains = relationships.filter((r) => r.type === "contains");
  const rootEl = elements.find((e) => e.semanticRole === "title" && e.groupId == null);
  if (!rootEl) throw new Error("hierarchy adapter: no root element found (semanticRole='title', groupId=null)");
  const byGroup = elementsByGroupId(elements);
  const childGroupIds = contains
    .filter((r) => r.from?.kind === "element" && r.from.id === rootEl.id && r.to?.kind === "group")
    .map((r) => r.to.id);
  if (childGroupIds.length < 2) throw new Error(`hierarchy adapter: expected >=2 children of the root via 'contains', found ${childGroupIds.length}`);
  // issue_tree's own renderers (HTML recursive + PPTX 2-level) only ever read a branch's
  // `label` (and, for a nested grandchild level this adapter never produces, `children`) —
  // neither displays a body/bullets field today. RP-HIERARCHY-WORKSTREAM-01 lists those as
  // OPTIONAL, so rather than author fields the renderer would silently drop (a content-
  // fidelity violation), this adapter only emits what's actually shown until issue_tree
  // gains a description line per node.
  const branches = childGroupIds.map((gid) => {
    const els = byGroup.get(gid) || [];
    const label = findRole(els, "title");
    if (!label) throw new Error(`hierarchy adapter: child group "${gid}" has no title element`);
    return { label };
  });
  return { tree: { root: rootEl.value, branches } };
}

export function preFamilyIrToRoadmapPhases({ elements, relationships }) {
  const contains = relationships.filter((r) => r.type === "contains");
  const sequence = relationships.filter((r) => r.type === "sequence");
  const byGroup = elementsByGroupId(elements);

  // Phases: groups that are the `from` of a group->group contains edge (phase -> milestone).
  // A groupId of "outcomes" is reserved for the optional slide-level closing band (below),
  // never itself a phase.
  const phaseGroupIds = [...new Set(contains.filter((r) => r.from?.kind === "group" && r.from.id !== "outcomes").map((r) => r.from.id))];
  if (!phaseGroupIds.length) throw new Error("roadmap adapter: no phase groups found (need group->group 'contains' edges, phase -> milestones)");

  // Phase order: derive from sequence edges between phase groups when present, else authoring order.
  const phaseSeq = sequence.filter((r) => phaseGroupIds.includes(r.from?.id) && phaseGroupIds.includes(r.to?.id));
  const orderedPhaseIds = phaseSeq.length ? topoSort(phaseGroupIds, phaseSeq) : phaseGroupIds;

  const phases = orderedPhaseIds.map((phaseId) => {
    const phaseEls = byGroup.get(phaseId) || [];
    const title = findRole(phaseEls, "title");
    if (!title) throw new Error(`roadmap adapter: phase group "${phaseId}" has no title element`);
    const subtitle = findRole(phaseEls, "subtitle");
    const milestoneGroupIds = contains.filter((r) => r.from?.id === phaseId && r.to?.kind === "group").map((r) => r.to.id);
    const milestoneSeq = sequence.filter((r) => milestoneGroupIds.includes(r.from?.id) && milestoneGroupIds.includes(r.to?.id));
    const orderedMilestoneIds = milestoneSeq.length ? topoSort(milestoneGroupIds, milestoneSeq) : milestoneGroupIds;
    const milestones = orderedMilestoneIds.map((mid) => {
      const mEls = byGroup.get(mid) || [];
      const mTitle = findRole(mEls, "title");
      if (!mTitle) throw new Error(`roadmap adapter: milestone group "${mid}" has no title element`);
      const milestone = { title: mTitle };
      const date = findRole(mEls, "date");
      if (date) milestone.date = date;
      if (mEls.some((e) => e.emphasis === true)) milestone.emphasis = true;
      return milestone;
    });
    const phase = { title };
    if (subtitle) phase.subtitle = subtitle;
    phase.milestones = milestones;
    return phase;
  });

  const outcomeEls = byGroup.get("outcomes") || [];
  const bullets = outcomeEls.filter((e) => e.semanticRole === "bullets").map((e) => e.value);
  const result = { phases };
  if (bullets.length) result.outcomes = { bullets };
  return result;
}

function topoSort(ids, seqRelationships) {
  const next = new Map();
  const hasIncoming = new Set();
  for (const r of seqRelationships) {
    next.set(r.from.id, r.to.id);
    hasIncoming.add(r.to.id);
  }
  const start = ids.find((id) => !hasIncoming.has(id)) || ids[0];
  const ordered = [start];
  let cur = start;
  while (next.has(cur) && ordered.length < ids.length) {
    cur = next.get(cur);
    if (ordered.includes(cur)) break;
    ordered.push(cur);
  }
  for (const id of ids) if (!ordered.includes(id)) ordered.push(id);
  return ordered;
}

/**
 * @param {{selectedPattern: string, slideSpecTemplate: string, slideSpecShape: string}} selection
 *   - reference_pattern_selector.mjs#selectPattern()'s output (must have eligibility="PASS")
 * @param {{elements: object[], relationships: object[]}} preFamilyIR
 * @param {{title: string, kicker?: string, source?: string, note?: string}} slideMeta
 */
export function preFamilyIrToSlideSpec(selection, preFamilyIR, slideMeta) {
  if (selection.eligibility !== "PASS" || !selection.slideSpecShape) {
    throw new Error(`preFamilyIrToSlideSpec: selection is not eligible (eligibility=${selection.eligibility}) — cannot build a SlideSpec slide from a rejected pattern`);
  }
  let body;
  if (selection.slideSpecShape === "quadrants") body = preFamilyIrToMatrixQuadrants(preFamilyIR);
  else if (selection.slideSpecShape === "tree") body = preFamilyIrToIssueTree(preFamilyIR);
  else if (selection.slideSpecShape === "phases") body = preFamilyIrToRoadmapPhases(preFamilyIR);
  else throw new Error(`preFamilyIrToSlideSpec: no adapter for slideSpecShape "${selection.slideSpecShape}"`);

  return {
    template: selection.slideSpecTemplate,
    title: slideMeta.title,
    ...(slideMeta.kicker ? { kicker: slideMeta.kicker } : {}),
    ...(slideMeta.source ? { source: slideMeta.source } : {}),
    ...(slideMeta.note ? { note: slideMeta.note } : {}),
    ...body,
    _referencePattern: selection.selectedPattern,
  };
}
