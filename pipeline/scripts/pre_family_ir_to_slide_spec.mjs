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

const CMP_RESERVED_GROUP_IDS = new Set(["criteria", "recommendation", "comparisonSummary"]);
function isCmpCandidateGroup(groupId) {
  return groupId != null && !CMP_RESERVED_GROUP_IDS.has(groupId);
}
const CMP_SYMBOLS = new Set(["◎", "○", "△", "×"]);

// "◎|中核戦略に合致" -> {symbol:"◎", caption:"中核戦略に合致"} (a symbol is optional: a bare
// caption with no "|" is valid too). Mirrors kpi_dashboard's comma-separated `spark` encoding
// — one element carrying a small structured value, rather than a relationship/sub-group, for
// a leaf-level cell that doesn't need its own identity.
function parseCmpCell(raw, context) {
  const parts = raw.split("|");
  if (parts.length > 2) throw new Error(`comparison_table adapter: ${context} value "${raw}" has more than one "|" separator`);
  if (parts.length === 2) {
    const [symbol, caption] = parts;
    if (!CMP_SYMBOLS.has(symbol)) throw new Error(`comparison_table adapter: ${context} symbol "${symbol}" is not one of ◎/○/△/×`);
    return { symbol, caption };
  }
  return { caption: parts[0] };
}

export function preFamilyIrToComparisonTable({ elements }) {
  const byGroup = elementsByGroupId(elements);

  const criteria = (byGroup.get("criteria") || []).filter((e) => e.semanticRole === "title").map((e) => e.value);
  if (criteria.length < 2) throw new Error(`comparison_table adapter: expected >=2 criteria, found ${criteria.length}`);

  const candidateEntries = [...byGroup.entries()].filter(([gid]) => isCmpCandidateGroup(gid));
  if (candidateEntries.length < 2 || candidateEntries.length > 5) {
    throw new Error(`comparison_table adapter: expected 2-5 candidates, found ${candidateEntries.length}`);
  }
  const candidates = candidateEntries.map(([gid, els]) => {
    const label = findRole(els, "title");
    if (!label) throw new Error(`comparison_table adapter: candidate group "${gid}" has no title (label) element`);
    const valueEls = els.filter((e) => e.semanticRole === "value");
    if (valueEls.length !== criteria.length) {
      throw new Error(`comparison_table adapter: candidate group "${gid}" has ${valueEls.length} value cells, expected ${criteria.length} (one per criterion)`);
    }
    const candidate = { label, cells: valueEls.map((e, i) => parseCmpCell(e.value, `candidate "${gid}" criterion[${i}]`)) };
    if (els.some((e) => e.semanticRole === "title" && e.emphasis === true)) candidate.highlight = true;
    return candidate;
  });

  const result = { comparison: { criteria, candidates } };

  const recEls = byGroup.get("recommendation");
  if (recEls) {
    const label = findRole(recEls, "title");
    if (!label) throw new Error('comparison_table adapter: "recommendation" group has no title (row label) element');
    const cells = candidateEntries.map(([gid, els]) => {
      const raw = findRole(els, "recommendationValue");
      if (raw == null) throw new Error(`comparison_table adapter: candidate group "${gid}" has no recommendationValue (required once a "recommendation" group is authored)`);
      return parseCmpCell(raw, `candidate "${gid}" recommendation`);
    });
    result.comparison.recommendation = { label, cells };
  }

  const summaryEls = byGroup.get("comparisonSummary");
  if (summaryEls) {
    const points = summaryEls.filter((e) => e.semanticRole === "bullets").map((e) => e.value);
    if (points.length) {
      const summary = { points };
      const title = findRole(summaryEls, "title");
      if (title) summary.title = title;
      const conclusion = findRole(summaryEls, "body");
      if (conclusion) {
        summary.conclusion = conclusion;
        const conclusionLabel = findRole(summaryEls, "chartCaption");
        if (conclusionLabel) summary.conclusionLabel = conclusionLabel;
      }
      result.comparisonSummary = summary;
    }
  }

  return result;
}

const DECISION_RESERVED_GROUP_IDS = new Set(["recommendation", "nextSteps"]);
function isDecisionCandidateGroup(groupId) {
  return groupId != null && !DECISION_RESERVED_GROUP_IDS.has(groupId);
}
const DECISION_ICON_NAMES = new Set(["org-chart", "bar-chart", "people"]);

export function preFamilyIrToDecisionGroups({ elements }) {
  const byGroup = elementsByGroupId(elements);

  const groupEntries = [...byGroup.entries()].filter(([gid]) => isDecisionCandidateGroup(gid));
  if (groupEntries.length < 2 || groupEntries.length > 4) {
    throw new Error(`decision_page adapter: expected 2-4 decision groups, found ${groupEntries.length}`);
  }
  const decisionGroups = groupEntries.map(([gid, els]) => {
    const number = findRole(els, "number");
    const title = findRole(els, "title");
    const actions = els.filter((e) => e.semanticRole === "bullets").map((e) => e.value);
    if (!number) throw new Error(`decision_page adapter: group "${gid}" has no number element`);
    if (!title) throw new Error(`decision_page adapter: group "${gid}" has no title element`);
    if (!actions.length) throw new Error(`decision_page adapter: group "${gid}" has no action (bullets) elements`);
    const group = { number, title, actions };
    const context = findRole(els, "context");
    if (context) group.context = context;
    const icon = findRole(els, "icon");
    if (icon) {
      if (!DECISION_ICON_NAMES.has(icon)) throw new Error(`decision_page adapter: group "${gid}" icon "${icon}" is not one of ${[...DECISION_ICON_NAMES].join("/")}`);
      group.icon = icon;
    }
    return group;
  });

  const result = { decisionGroups };

  const recEls = byGroup.get("recommendation");
  if (recEls) {
    const text = findRole(recEls, "body");
    if (!text) throw new Error('decision_page adapter: "recommendation" group has no body (recommendation text) element');
    const recommendation = { text };
    const label = findRole(recEls, "title");
    if (label) recommendation.label = label;
    result.recommendation = recommendation;
  }

  const stepsEls = byGroup.get("nextSteps");
  if (stepsEls) {
    const steps = stepsEls.filter((e) => e.semanticRole === "bullets").map((e) => e.value);
    if (steps.length) result.nextSteps = steps;
  }

  return result;
}

const TAKEAWAY_RESERVED_GROUP_IDS = new Set(["insightPanel", "soWhat"]);
function isTakeawayCandidateGroup(groupId) {
  return groupId != null && !TAKEAWAY_RESERVED_GROUP_IDS.has(groupId) && !groupId.startsWith("insightPanel-");
}
const TAKEAWAY_ICON_NAMES = new Set(["bar-chart", "coins", "gear"]);

export function preFamilyIrToKeyTakeaways({ elements }) {
  const byGroup = elementsByGroupId(elements);

  const takeawayEntries = [...byGroup.entries()].filter(([gid]) => isTakeawayCandidateGroup(gid));
  if (takeawayEntries.length < 2 || takeawayEntries.length > 4) {
    throw new Error(`recommendation_pillars adapter: expected 2-4 takeaway groups, found ${takeawayEntries.length}`);
  }
  const takeaways = takeawayEntries.map(([gid, els]) => {
    const number = findRole(els, "number");
    const category = findRole(els, "category");
    const headline = findRole(els, "headline");
    const supportText = findRole(els, "body");
    if (!number) throw new Error(`recommendation_pillars adapter: group "${gid}" has no number element`);
    if (!category) throw new Error(`recommendation_pillars adapter: group "${gid}" has no category element`);
    if (!headline) throw new Error(`recommendation_pillars adapter: group "${gid}" has no headline element`);
    if (!supportText) throw new Error(`recommendation_pillars adapter: group "${gid}" has no body (supportText) element`);
    const takeaway = { number, category, headline, supportText };
    const icon = findRole(els, "icon");
    if (icon) {
      if (!TAKEAWAY_ICON_NAMES.has(icon)) throw new Error(`recommendation_pillars adapter: group "${gid}" icon "${icon}" is not one of ${[...TAKEAWAY_ICON_NAMES].join("/")}`);
      takeaway.icon = icon;
    }
    const supportLabel = findRole(els, "supportLabel");
    if (supportLabel) takeaway.supportLabel = supportLabel;
    return takeaway;
  });

  const itemEntries = [...byGroup.entries()].filter(([gid]) => gid.startsWith("insightPanel-"));
  if (!itemEntries.length) throw new Error('recommendation_pillars adapter: no insightPanel items found (groupId prefix "insightPanel-") — insightPanel is mandatory for this pattern');
  const items = itemEntries.map(([gid, els]) => {
    const number = findRole(els, "number");
    const title = findRole(els, "title");
    const body = findRole(els, "body");
    if (!number || !title || !body) throw new Error(`recommendation_pillars adapter: insight item "${gid}" is missing number/title/body`);
    return { number, title, body };
  });
  const insightPanel = { items };
  const panelTitle = findRole(byGroup.get("insightPanel") || [], "title");
  if (panelTitle) insightPanel.title = panelTitle;

  const soWhatEls = byGroup.get("soWhat");
  const soWhatText = findRole(soWhatEls || [], "body");
  if (!soWhatText) throw new Error('recommendation_pillars adapter: no "soWhat" group body element found — soWhat is mandatory for this pattern');
  const soWhat = { text: soWhatText };
  const soWhatLabel = findRole(soWhatEls, "title");
  if (soWhatLabel) soWhat.label = soWhatLabel;

  return { takeaways, insightPanel, soWhat };
}

// Matrix Badge List (RP-MATRIX-BADGELIST-01): a 3rd matrix_2x2 quadrant shape, independent of
// Hero's title/body/evidence and Plain's single-label text — each quadrant carries a
// priority number, a label, an optional summary, and a list of individually-iconed badge
// items; each badge item is its own tiny sub-group nested under `${position}-item-*`
// (position is always one of the 4 canonical positions this project's matrix family already
// reserves). The right-side insights panel reuses kpi_dashboard's own "insights" reserved
// group/bullets-elements convention verbatim — same field (`slide.insights`), same shape,
// same semantic purpose, so there is no reason to invent a second name for it here.
const MATRIX_QUADRANT_POSITIONS = ["top-left", "top-right", "bottom-left", "bottom-right"];
const MATRIX_BADGE_ICON_NAMES = new Set(["person", "people", "bar-chart", "laptop", "tag", "cart", "truck"]);

export function preFamilyIrToMatrixBadgeList({ elements }) {
  const byGroup = elementsByGroupId(elements);

  const quadrants = MATRIX_QUADRANT_POSITIONS.map((position) => {
    const els = byGroup.get(position);
    if (!els) throw new Error(`matrix_2x2 badge-list adapter: missing quadrant group "${position}"`);
    const number = findRole(els, "number");
    const label = findRole(els, "title");
    if (!number) throw new Error(`matrix_2x2 badge-list adapter: quadrant "${position}" has no number element`);
    if (!label) throw new Error(`matrix_2x2 badge-list adapter: quadrant "${position}" has no title (label) element`);
    const quadrant = { position, number, label };
    const summary = findRole(els, "body");
    if (summary) quadrant.summary = summary;
    if (els.some((e) => e.emphasis === true)) quadrant.emphasis = true;

    const itemPrefix = `${position}-item-`;
    const itemEntries = [...byGroup.entries()].filter(([gid]) => gid.startsWith(itemPrefix));
    if (!itemEntries.length) throw new Error(`matrix_2x2 badge-list adapter: quadrant "${position}" has no items (groupId prefix "${itemPrefix}")`);
    quadrant.items = itemEntries.map(([gid, itemEls]) => {
      const title = findRole(itemEls, "title");
      if (!title) throw new Error(`matrix_2x2 badge-list adapter: item "${gid}" has no title element`);
      const item = { title };
      const icon = findRole(itemEls, "icon");
      if (icon) {
        if (!MATRIX_BADGE_ICON_NAMES.has(icon)) throw new Error(`matrix_2x2 badge-list adapter: item "${gid}" icon "${icon}" is not one of ${[...MATRIX_BADGE_ICON_NAMES].join("/")}`);
        item.icon = icon;
      }
      if (itemEls.some((e) => e.semanticRole === "title" && e.emphasis === true)) item.emphasis = true;
      return item;
    });
    return quadrant;
  });

  const axisXEls = byGroup.get("axisX");
  const axisYEls = byGroup.get("axisY");
  if (!axisXEls) throw new Error('matrix_2x2 badge-list adapter: no "axisX" group found');
  if (!axisYEls) throw new Error('matrix_2x2 badge-list adapter: no "axisY" group found');
  const axisXTitle = findRole(axisXEls, "title");
  const axisYTitle = findRole(axisYEls, "title");
  if (!axisXTitle) throw new Error('matrix_2x2 badge-list adapter: "axisX" group has no title element');
  if (!axisYTitle) throw new Error('matrix_2x2 badge-list adapter: "axisY" group has no title element');
  // Order preserved from authoring order (elements[] array position), same discipline as
  // every other Library v0.2 pattern's sibling lists — first authored = low, second = high.
  const [xLow, xHigh] = axisXEls.filter((e) => e.semanticRole === "label");
  const [yLow, yHigh] = axisYEls.filter((e) => e.semanticRole === "label");
  if (!xLow || !xHigh) throw new Error('matrix_2x2 badge-list adapter: "axisX" group needs exactly 2 label elements (low, then high)');
  if (!yLow || !yHigh) throw new Error('matrix_2x2 badge-list adapter: "axisY" group needs exactly 2 label elements (low, then high)');
  const matrix = {
    xAxis: axisXTitle,
    yAxis: axisYTitle,
    xAxisLow: xLow.value,
    xAxisHigh: xHigh.value,
    yAxisLow: yLow.value,
    yAxisHigh: yHigh.value,
  };

  const insightEls = byGroup.get("insights") || [];
  const insightItems = insightEls.filter((e) => e.semanticRole === "bullets").map((e) => e.value);
  if (!insightItems.length) throw new Error('matrix_2x2 badge-list adapter: no "insights" bullets found — the insights panel is mandatory for this pattern');
  const insights = { items: insightItems };
  const insightsTitle = findRole(insightEls, "title");
  if (insightsTitle) insights.title = insightsTitle;

  return { quadrants, matrix, insights };
}

// RP-100DAY-WORKSTREAM-01: a swimlane x phase 2D matrix — independent of RP-PMI-ROADMAP-01's
// contains/sequence timeline shape (see reference_pattern_selector.mjs's own comment on
// checkWorkstream100DayShape for why). Groups are classified by reserved groupId PREFIX
// ("workstream-*"/"phase-*"/"activity-*"/"milestone-*"); each group's own groupId becomes its
// `id` in the output. Activities/milestones cross-reference their workstream/phase via an
// authored `workstreamRef`/`phaseRef` element (the referenced group's groupId), not by parsing
// the activity/milestone's own groupId string.
const WORKSTREAM_ICON_NAMES = new Set(["people", "coins", "person", "bar-chart"]);
const ACTIVITY_ICON_NAMES = new Set(["target", "search", "org-chart", "gear", "trending-up", "handshake", "document", "bar-chart"]);

export function preFamilyIrToWorkstream100Day({ elements }) {
  const byGroup = elementsByGroupId(elements);
  const groupIds = [...byGroup.keys()];
  const workstreamGroupIds = groupIds.filter((g) => g.startsWith("workstream-"));
  const phaseGroupIds = groupIds.filter((g) => g.startsWith("phase-"));
  const activityGroupIds = groupIds.filter((g) => g.startsWith("activity-"));
  const milestoneGroupIds = groupIds.filter((g) => g.startsWith("milestone-"));

  const workstreams = workstreamGroupIds.map((gid) => {
    const els = byGroup.get(gid);
    const title = findRole(els, "title");
    const icon = findRole(els, "icon");
    if (!title) throw new Error(`workstream_100day adapter: workstream "${gid}" has no title element`);
    if (!icon) throw new Error(`workstream_100day adapter: workstream "${gid}" has no icon element (icon is required for this pattern)`);
    if (!WORKSTREAM_ICON_NAMES.has(icon)) throw new Error(`workstream_100day adapter: workstream "${gid}" icon "${icon}" is not one of ${[...WORKSTREAM_ICON_NAMES].join("/")}`);
    const workstream = { id: gid, title, icon };
    const subtitle = findRole(els, "subtitle");
    if (subtitle) workstream.subtitle = subtitle;
    return workstream;
  });

  const phases = phaseGroupIds
    .map((gid) => {
      const els = byGroup.get(gid);
      const title = findRole(els, "title");
      if (!title) throw new Error(`workstream_100day adapter: phase "${gid}" has no title element`);
      const order = parseInt(findRole(els, "order"), 10);
      if (!Number.isInteger(order) || order < 1 || order > 3) throw new Error(`workstream_100day adapter: phase "${gid}" has no valid order element (must be 1-3)`);
      const phase = { id: gid, title, order };
      const subtitle = findRole(els, "subtitle");
      if (subtitle) phase.subtitle = subtitle;
      return phase;
    })
    .sort((a, b) => a.order - b.order);

  const activities = activityGroupIds.map((gid) => {
    const els = byGroup.get(gid);
    const title = findRole(els, "title");
    const icon = findRole(els, "icon");
    if (!title) throw new Error(`workstream_100day adapter: activity "${gid}" has no title element`);
    if (!icon) throw new Error(`workstream_100day adapter: activity "${gid}" has no icon element (icon is required for this pattern)`);
    if (!ACTIVITY_ICON_NAMES.has(icon)) throw new Error(`workstream_100day adapter: activity "${gid}" icon "${icon}" is not one of ${[...ACTIVITY_ICON_NAMES].join("/")}`);
    const bullets = els.filter((e) => e.semanticRole === "bullets").map((e) => e.value);
    if (!bullets.length) throw new Error(`workstream_100day adapter: activity "${gid}" has no bullets elements`);
    const workstreamId = findRole(els, "workstreamRef");
    const phaseId = findRole(els, "phaseRef");
    if (!workstreamId) throw new Error(`workstream_100day adapter: activity "${gid}" has no workstreamRef element`);
    if (!phaseId) throw new Error(`workstream_100day adapter: activity "${gid}" has no phaseRef element`);
    return { workstreamId, phaseId, title, bullets, icon };
  });

  const milestones = milestoneGroupIds
    .map((gid) => {
      const els = byGroup.get(gid);
      const label = findRole(els, "label");
      const title = findRole(els, "title");
      if (!label) throw new Error(`workstream_100day adapter: milestone "${gid}" has no label element`);
      if (!title) throw new Error(`workstream_100day adapter: milestone "${gid}" has no title element`);
      const position = parseInt(findRole(els, "position"), 10);
      if (!Number.isInteger(position) || position < 1 || position > 3) throw new Error(`workstream_100day adapter: milestone "${gid}" has no valid position element (must be 1-3)`);
      const phaseId = findRole(els, "phaseRef");
      if (!phaseId) throw new Error(`workstream_100day adapter: milestone "${gid}" has no phaseRef element`);
      const milestone = { phaseId, position, label, title };
      const body = findRole(els, "body");
      if (body) milestone.body = body;
      return milestone;
    })
    .sort((a, b) => a.position - b.position);

  return { workstreams, phases, activities, milestones };
}

// RP-OPERATING-MODEL-01: a left-to-right cascade of independently-sized stage columns — see
// reference_pattern_selector.mjs's own comment on checkOperatingModelCascadeShape for why this
// is NOT a uniform grid like RP-100DAY-WORKSTREAM-01. Stages are classified by reserved
// groupId prefix "stage-"; each stage's own cards are classified by a prefix parameterized on
// THAT stage's own groupId (`${stageGroupId}-card-`) — the same nesting idiom
// RP-MATRIX-BADGELIST-01 uses for badge items nested under an author-chosen quadrant groupId.
const OPERATING_MODEL_CARD_ICON_NAMES = new Set(["building", "pin", "people", "diamond", "truck", "bar-chart", "person", "org-chart", "gear", "document"]);

export function preFamilyIrToOperatingModelCascade({ elements }) {
  const byGroup = elementsByGroupId(elements);
  const groupIds = [...byGroup.keys()];
  const stageIds = [];
  for (const el of elements) {
    if (el.groupId != null && el.groupId.startsWith("stage-") && !el.groupId.includes("-card-") && !stageIds.includes(el.groupId)) stageIds.push(el.groupId);
  }

  const stages = stageIds.map((gid) => {
    const els = byGroup.get(gid);
    const number = findRole(els, "number");
    const title = findRole(els, "title");
    const question = findRole(els, "question");
    if (!number) throw new Error(`operating_model_cascade adapter: stage "${gid}" has no number element`);
    if (!title) throw new Error(`operating_model_cascade adapter: stage "${gid}" has no title element`);
    if (!question) throw new Error(`operating_model_cascade adapter: stage "${gid}" has no question element`);

    const cardPrefix = `${gid}-card-`;
    const cardIds = groupIds.filter((g) => g.startsWith(cardPrefix));
    if (!cardIds.length) throw new Error(`operating_model_cascade adapter: stage "${gid}" has no cards`);
    const cards = cardIds.map((cardGid) => {
      const cardEls = byGroup.get(cardGid);
      const cardTitle = findRole(cardEls, "title");
      const body = findRole(cardEls, "body");
      const icon = findRole(cardEls, "icon");
      if (!cardTitle) throw new Error(`operating_model_cascade adapter: card "${cardGid}" has no title element`);
      if (!body) throw new Error(`operating_model_cascade adapter: card "${cardGid}" has no body element`);
      if (!icon) throw new Error(`operating_model_cascade adapter: card "${cardGid}" has no icon element`);
      if (!OPERATING_MODEL_CARD_ICON_NAMES.has(icon)) throw new Error(`operating_model_cascade adapter: card "${cardGid}" icon "${icon}" is not one of ${[...OPERATING_MODEL_CARD_ICON_NAMES].join("/")}`);
      return { title: cardTitle, body, icon };
    });

    return { id: gid, number, title, question, cards };
  });

  const keyMessageEls = byGroup.get("keyMessage") || [];
  const headline = findRole(keyMessageEls, "headline");
  if (!headline) throw new Error('operating_model_cascade adapter: no "keyMessage" group headline element found');
  const checklist = keyMessageEls.filter((e) => e.semanticRole === "bullets").map((e) => e.value);
  if (!checklist.length) throw new Error('operating_model_cascade adapter: no "keyMessage" checklist bullets found');
  const keyMessageBand = { headline, checklist };
  const label = findRole(keyMessageEls, "label");
  if (label) keyMessageBand.label = label;

  return { cascadeStages: stages, keyMessageBand };
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
  else if (selection.slideSpecShape === "comparisonTable") body = preFamilyIrToComparisonTable(preFamilyIR);
  else if (selection.slideSpecShape === "decisionGroups") body = preFamilyIrToDecisionGroups(preFamilyIR);
  else if (selection.slideSpecShape === "keyTakeaways") body = preFamilyIrToKeyTakeaways(preFamilyIR);
  else if (selection.slideSpecShape === "matrixBadgeList") body = preFamilyIrToMatrixBadgeList(preFamilyIR);
  else if (selection.slideSpecShape === "workstream100day") body = preFamilyIrToWorkstream100Day(preFamilyIR);
  else if (selection.slideSpecShape === "operatingModelCascade") body = preFamilyIrToOperatingModelCascade(preFamilyIR);
  else throw new Error(`preFamilyIrToSlideSpec: no adapter for slideSpecShape "${selection.slideSpecShape}"`);

  return {
    template: selection.slideSpecTemplate,
    title: slideMeta.title,
    ...(slideMeta.kicker ? { kicker: slideMeta.kicker } : {}),
    ...(slideMeta.subtitle ? { subtitle: slideMeta.subtitle } : {}),
    ...(slideMeta.source ? { source: slideMeta.source } : {}),
    ...(slideMeta.note ? { note: slideMeta.note } : {}),
    ...body,
    _referencePattern: selection.selectedPattern,
  };
}
