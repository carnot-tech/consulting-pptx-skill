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
//   kpi-dashboard: each KPI is its own group with title(label)/value elements (required) and
//               optional chartCaption(unit)/secondary(delta)/body(note) elements — 3-5 such
//               groups, siblings with no relationship between them (order = authoring order).
//               An optional groupId="insights" group (semanticRole="bullets" elements, +
//               optional "title" for the panel heading) becomes the closing insights list. An
//               optional groupId="trendChart" group (a "chartCaption" unit element) `contains`-
//               links to its own point sub-groups ("trendChart-p1" etc, each with title+value),
//               ordered via `sequence` relationships between the point groups — same idiom as
//               roadmap's phase/milestone structure, reused deliberately for consistency.
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

const KPI_RESERVED_GROUP_IDS = new Set(["insights", "trendChart"]);
function isKpiCandidateGroup(groupId) {
  return groupId != null && !KPI_RESERVED_GROUP_IDS.has(groupId) && !groupId.startsWith("trendChart-");
}

const KPI_ICON_NAMES = new Set(["bar-chart", "coins", "pie", "cycle"]);

export function preFamilyIrToKpiDashboard({ elements, relationships }) {
  const byGroup = elementsByGroupId(elements);

  const kpis = [...byGroup.entries()]
    .filter(([gid]) => isKpiCandidateGroup(gid))
    .map(([gid, els]) => {
      const label = findRole(els, "title");
      const value = findRole(els, "value");
      if (!label || !value) throw new Error(`kpi_dashboard adapter: group "${gid}" is missing a title or value element`);
      const kpi = { label, value };
      const unit = findRole(els, "chartCaption");
      if (unit) kpi.unit = unit;
      const delta = findRole(els, "secondary");
      if (delta) kpi.delta = delta;
      const note = findRole(els, "body");
      if (note) kpi.note = note;
      const context = findRole(els, "context");
      if (context) kpi.context = context;
      const icon = findRole(els, "icon");
      if (icon) {
        if (!KPI_ICON_NAMES.has(icon)) throw new Error(`kpi_dashboard adapter: group "${gid}" icon "${icon}" is not one of ${[...KPI_ICON_NAMES].join("/")}`);
        kpi.icon = icon;
      }
      const sparkStr = findRole(els, "spark");
      if (sparkStr) {
        const spark = sparkStr.split(",").map((s) => Number(s.trim()));
        if (spark.some((v) => !Number.isFinite(v))) throw new Error(`kpi_dashboard adapter: group "${gid}" spark "${sparkStr}" contains a non-numeric value`);
        if (spark.length >= 2) kpi.spark = spark;
      }
      return kpi;
    });
  if (kpis.length < 3 || kpis.length > 5) {
    throw new Error(`kpi_dashboard adapter: expected 3-5 KPI groups, found ${kpis.length}`);
  }

  const result = { kpis };

  const keyMessage = elements.find((e) => e.semanticRole === "headline" && e.groupId == null)?.value;
  if (keyMessage) result.keyMessage = keyMessage;

  const insightsEls = byGroup.get("insights");
  if (insightsEls) {
    const items = insightsEls.filter((e) => e.semanticRole === "bullets").map((e) => e.value);
    if (items.length) {
      const insights = { items };
      const title = findRole(insightsEls, "title");
      if (title) insights.title = title;
      result.insights = insights;
    }
  }

  const trendEls = byGroup.get("trendChart");
  if (trendEls) {
    const contains = relationships.filter((r) => r.type === "contains" && r.from?.kind === "group" && r.from.id === "trendChart");
    const sequence = relationships.filter((r) => r.type === "sequence");
    const pointGroupIds = contains.map((r) => r.to.id);
    const pointSeq = sequence.filter((r) => pointGroupIds.includes(r.from?.id) && pointGroupIds.includes(r.to?.id));
    const orderedPointIds = pointSeq.length ? topoSort(pointGroupIds, pointSeq) : pointGroupIds;

    const bar1Label = findRole(trendEls, "title");
    const bar2Label = findRole(trendEls, "secondary");
    const lineLabel = findRole(trendEls, "lineLabel");
    if (!bar1Label) throw new Error('kpi_dashboard adapter: trendChart group has no bar1 label ("title" element)');

    const periods = [];
    const bar1Values = [];
    const bar2Values = bar2Label ? [] : null;
    const lineValues = lineLabel ? [] : null;
    orderedPointIds.forEach((pid) => {
      const pEls = byGroup.get(pid) || [];
      const label = findRole(pEls, "title");
      const v1Str = findRole(pEls, "value");
      if (!label || v1Str == null) throw new Error(`kpi_dashboard adapter: trendChart point "${pid}" is missing a title or value element`);
      const v1 = Number(v1Str);
      if (!Number.isFinite(v1)) throw new Error(`kpi_dashboard adapter: trendChart point "${pid}" value "${v1Str}" is not numeric`);
      periods.push(label);
      bar1Values.push(v1);
      if (bar2Values) {
        const v2Str = findRole(pEls, "value2");
        if (v2Str == null) throw new Error(`kpi_dashboard adapter: trendChart point "${pid}" is missing "value2" (trendChart group declared a bar2 label)`);
        const v2 = Number(v2Str);
        if (!Number.isFinite(v2)) throw new Error(`kpi_dashboard adapter: trendChart point "${pid}" value2 "${v2Str}" is not numeric`);
        bar2Values.push(v2);
      }
      if (lineValues) {
        const lvStr = findRole(pEls, "lineValue");
        if (lvStr == null) throw new Error(`kpi_dashboard adapter: trendChart point "${pid}" is missing "lineValue" (trendChart group declared a line label)`);
        const lv = Number(lvStr);
        if (!Number.isFinite(lv)) throw new Error(`kpi_dashboard adapter: trendChart point "${pid}" lineValue "${lvStr}" is not numeric`);
        lineValues.push(lv);
      }
    });

    if (periods.length) {
      const bars = [{ label: bar1Label, values: bar1Values }];
      if (bar2Values) bars.push({ label: bar2Label, values: bar2Values });
      const trendChart = { periods, bars };
      const unit = findRole(trendEls, "chartCaption");
      if (unit) trendChart.unit = unit;
      if (lineValues) {
        const line = { label: lineLabel, values: lineValues };
        const lineUnit = findRole(trendEls, "lineUnit");
        if (lineUnit) line.unit = lineUnit;
        trendChart.line = line;
      }
      result.trendChart = trendChart;
    }
  }

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
  else if (selection.slideSpecShape === "kpiDashboard") body = preFamilyIrToKpiDashboard(preFamilyIR);
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
