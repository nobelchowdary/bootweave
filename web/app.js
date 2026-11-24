'use strict';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const state = {examples:[], report:null, xml:'', filename:'config.xml', selected:null, mode:'recovery', filter:'all', view:'graph', comparison:null, busy:0, graphLayout:'auto', graphDirection:null, graphFingerprint:null, compareSources:{before:null,after:null}, protectedNames:new Set(), editorTarget:'graph', evidence:{raw:null,filename:'',checked:null,checkedFor:null,sequence:0,examples:[],exampleId:null,message:'',error:'',checking:false}};
const ns = 'http://www.w3.org/2000/svg';
let toastTimer;
let analyzeSequence = 0;

function svgElement(tag, attrs = {}, text) {
  const node = document.createElementNS(ns, tag);
  Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
  if (text !== undefined) node.textContent = text;
  return node;
}

function toast(message) {
  $('#toast').textContent = message;
  $('#toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 3500);
}

function showError(message) {
  $('#app-error').textContent = message;
  $('#app-error').hidden = !message;
  $('#editor-error').textContent = message;
  $('#editor-error').hidden = !message || !$('#source-dialog').open;
}

function busy(delta) {
  state.busy = Math.max(0, state.busy + delta);
  document.body.classList.toggle('busy', state.busy > 0);
  ['#analyze-source', '#example-select', '#upload-button', '#compare-before', '#compare-after', '#swap-revisions', '#clear-protected'].forEach((id) => { $(id).disabled = state.busy > 0; });
  $$('[data-import-revision], [data-edit-revision], [data-inspect-revision], [data-protected]').forEach((button) => { button.disabled = state.busy > 0 || (button.hasAttribute('data-inspect-revision') && !state.compareSources[button.dataset.inspectRevision]); });
  $('#run-compare').disabled = state.busy > 0 || !state.compareSources.before || !state.compareSources.after;
  $('#analyze-source').textContent = state.busy ? 'Working…' : state.editorTarget === 'graph' ? 'Analyze configuration' : `Save ${state.editorTarget === 'before' ? 'baseline' : 'candidate'}`;
  $('#run-compare').textContent = state.busy ? 'Working…' : 'Compare revisions';
  $('#clear-protected').disabled = state.busy > 0 || !state.protectedNames.size;
  updateCompareReadiness();
  updateEvidenceControls();
  updateExportButton();
}

async function readXmlFile(file) {
  try {
    // Preserve a UTF-8 BOM as part of the XML bytes used for hash binding.
    return new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}).decode(await file.arrayBuffer());
  } catch (_) {
    throw new Error('The XML file must contain valid UTF-8 text.');
  }
}

async function request(url, payload) {
  const body = payload === undefined ? undefined : JSON.stringify(payload);
  const limit = 4_500_000;
  if (body && new TextEncoder().encode(body).length > limit) throw new Error('The combined request is too large. Use smaller configuration or recording files.');
  const response = await fetch(url, payload === undefined ? {} : {method:'POST', headers:{'Content-Type':'application/json'}, body});
  let result;
  try { result = await response.json(); }
  catch (_) { throw new Error('The host did not return a valid report. Check that the BootWeave server is running.'); }
  if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : result.error?.message || result.message || `The host returned HTTP ${response.status}.`);
  return result;
}

function setView(view) {
  state.view = view;
  document.body.classList.toggle('comparison-view', view === 'compare');
  $('#upload-button').hidden = view === 'compare';
  $('#graph-view').hidden = view !== 'graph';
  $('#compare-view').hidden = view !== 'compare';
  $('#breadcrumb-current').textContent = view === 'graph' ? 'Configuration review' : 'Change review';
  $('#page-title').textContent = view === 'graph' ? 'Configuration review' : 'Change review';
  $('#page-subtitle').textContent = view === 'graph' ? 'Inspect startup dependencies and recovery coupling in QNX SLM XML.' : 'Compare configuration changes before deployment.';
  $$('.nav-item').forEach((button) => { button.classList.toggle('active', button.dataset.view === view); });
  updateExportButton();
}

function updateExportButton() {
  $('#export-label').textContent = state.view === 'graph' && state.evidence.raw ? 'Export bundle' : 'Export report';
  $('#export-button').disabled = state.busy > 0 || !(state.view === 'compare' ? state.comparison : state.report);
}

function invalidateComparison(message = 'Choose two examples above and compare their services, relationships, and findings.') {
  state.comparison = null;
  $('#compare-results').innerHTML = `<div class="compare-placeholder"><svg viewBox="0 0 48 48" aria-hidden="true"><path d="M16 8v32m16-32v32M10 14l6-6 6 6m4 20 6 6 6-6"/></svg><h3>No comparison yet</h3><p>${escapeHtml(message)}</p></div>`;
  updateExportButton();
}

function populateSourceSelect(selectedId) {
  const select = $('#example-select');
  select.replaceChildren();
  state.examples.forEach((example) => {
    const option = document.createElement('option');
    option.value = example.id;
    option.textContent = example.filename || example.name;
    option.title = example.description || example.name;
    select.append(option);
  });
  if (!selectedId || !state.examples.some((example) => example.id === selectedId)) {
    const option = document.createElement('option');
    option.value = '__current';
    option.textContent = state.filename;
    select.append(option);
    select.value = '__current';
  } else select.value = selectedId;
}

function populateCompareSelects() {
  ['before', 'after'].forEach((slot) => {
    const select = $(`#compare-${slot}`);
    const source = state.compareSources[slot];
    select.replaceChildren();
    if (!source) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'Choose a configuration…';
      select.append(option);
    }
    state.examples.forEach((example) => {
      const option = document.createElement('option');
      option.value = example.id;
      option.textContent = `Example: ${example.name || example.filename}`;
      select.append(option);
    });
    if (state.xml) {
      const option = document.createElement('option');
      option.value = '__active';
      option.textContent = `Copy active: ${state.filename}`;
      select.append(option);
    }
    if (source && !source.exampleId) {
      const option = document.createElement('option');
      option.value = '__custom';
      option.textContent = source.filename;
      select.append(option);
    }
    select.value = source ? source.exampleId || '__custom' : '';
    renderRevisionDetails(slot);
  });
  renderProtectedServices();
  updateCompareReadiness();
}

function renderRevisionDetails(slot) {
  const source = state.compareSources[slot];
  const status = $(`#${slot}-status`);
  const detail = $(`#${slot}-detail`);
  if (!source) {
    status.className = 'revision-status';
    status.textContent = 'Not loaded';
    detail.textContent = `Choose an example or import your ${slot === 'before' ? 'baseline' : 'candidate'} XML.`;
    return;
  }
  const errors = source.report.findings.filter((finding) => finding.severity === 'error').length;
  const complete = source.report.analysis_complete && source.report.summary?.valid_graph;
  status.className = `revision-status ${complete ? 'loaded' : 'invalid'}`;
  status.textContent = complete ? 'Loaded' : errors ? `${errors} error${errors === 1 ? '' : 's'}` : 'Incomplete';
  const origin = source.exampleId?.startsWith('native-') ? 'Native demo configuration' : source.exampleId ? 'Authored example' : source.origin === 'snapshot' ? 'Active configuration snapshot' : source.origin === 'edited' ? 'Edited XML' : 'Imported XML';
  detail.innerHTML = `<strong title="${escapeHtml(source.filename)}">${escapeHtml(source.filename)}</strong><span>${origin} · ${source.report.components.length} service${source.report.components.length === 1 ? '' : 's'}</span><code title="${escapeHtml(source.report.source?.sha256 || '')}">SHA-256 ${escapeHtml(source.report.source?.sha256?.slice(0, 16) || 'unavailable')}…</code>`;
}

function updateCompareReadiness() {
  const ready = state.compareSources.before && state.compareSources.after;
  $('#run-compare').disabled = !!state.busy || !ready;
  $('#swap-revisions').disabled = !!state.busy || !ready;
  $('#comparison-ready').textContent = ready ? 'Both revisions loaded independently.' : 'Load both revisions to compare.';
}

function renderProtectedServices() {
  const search = $('#protected-search').value.toLowerCase().trim();
  const baselineNames = new Set((state.compareSources.before?.report.components || []).map((component) => component.name));
  const candidateNames = new Set((state.compareSources.after?.report.components || []).map((component) => component.name));
  const names = [...new Set([...baselineNames, ...candidateNames, ...state.protectedNames])].sort();
  const filtered = names.filter((name) => name.toLowerCase().includes(search));
  $('#protected-count').textContent = `${state.protectedNames.size} selected`;
  $('#clear-protected').disabled = !!state.busy || !state.protectedNames.size;
  $('#protected-services').innerHTML = filtered.length ? filtered.map((name) => {
    const absent = !!state.compareSources.after && !candidateNames.has(name);
    return `<label class="protected-service ${absent ? 'absent' : ''}"><input type="checkbox" data-protected value="${escapeHtml(name)}" ${state.protectedNames.has(name) ? 'checked' : ''} ${state.busy ? 'disabled' : ''}><span>${escapeHtml(name)}</span>${absent ? '<small>absent in candidate</small>' : ''}</label>`;
  }).join('') : `<p class="change-empty">${names.length ? 'No services match your search.' : 'Load a revision to select services.'}</p>`;
}

async function setComparisonSource(slot, source) {
  busy(1);
  showError('');
  try {
    const cached = [state.report, state.compareSources.before?.report, state.compareSources.after?.report].find((report) => report?.source?.name === source.filename && ((report === state.report && state.xml === source.xml) || (report === state.compareSources.before?.report && state.compareSources.before.xml === source.xml) || (report === state.compareSources.after?.report && state.compareSources.after.xml === source.xml)));
    const report = cached || await request('/api/analyze', {xml: source.xml, filename: source.filename});
    if (!Array.isArray(report.components) || !Array.isArray(report.findings)) throw new Error('The host returned an incomplete analysis.');
    state.compareSources[slot] = {...source, report};
    invalidateComparison('A revision changed. Run the comparison to review the current baseline and candidate.');
    populateCompareSelects();
    return true;
  } catch (error) {
    populateCompareSelects();
    showError(`Could not load ${slot === 'before' ? 'baseline' : 'candidate'} ${source.filename}: ${error.message} The previously loaded revision has been preserved.`);
    return false;
  } finally {
    busy(-1);
    updateCompareReadiness();
  }
}

async function analyze(xml, filename, exampleId) {
  const sequence = ++analyzeSequence;
  busy(1);
  showError('');
  try {
    const report = await request('/api/analyze', {xml, filename});
    if (sequence !== analyzeSequence) return false;
    if (!report || !Array.isArray(report.components) || !Array.isArray(report.findings)) throw new Error('The report is missing configuration data.');
    state.xml = xml;
    state.filename = filename;
    state.report = report;
    resetEvidenceBinding('Active XML changed. Check the recording against this configuration.');
    if (!report.components.some((component) => component.name === state.selected)) {
      const root = report.components.find((component) => component.dependencies?.length === 0);
      state.selected = report.components.find((component)=>component.name === 'dashboard')?.name || report.components.find((component)=>component.name === 'telemetry')?.name || root?.name || report.components[0]?.name || null;
    }
    populateSourceSelect(exampleId);
    populateCompareSelects();
    renderReport();
    return true;
  } catch (error) {
    showError(`Could not analyze ${filename}: ${error.message || 'The host could not analyze this configuration.'}${state.report ? ` The displayed report is still for ${state.filename}.` : ''}`);
    if (state.report) {
      $('#source-status').className = 'status-chip warning';
      $('#source-status').textContent = 'Previous report';
    }
    return false;
  } finally { busy(-1); }
}

function renderReport() {
  const report = state.report;
  if (!report) return;
  const example = state.examples.find((item)=>item.xml === state.xml);
  const description = (example?.description || example?.name || '').replace(/^Authored example:\s*/i, '');
  $('#source-context').innerHTML = example?.id.startsWith('native-') ? `<span class="source-context-label">Native demo configuration</span><span>${escapeHtml(description)} Recordings are reviewed separately below.</span>` : example ? `<span class="source-context-label">Authored example</span><span>${escapeHtml(description)} Illustrative service binaries; no target run.</span>` : '<span class="source-context-label">Imported source</span><span>Static review of your XML. This view does not execute target processes.</span>';
  const errors = report.findings.filter((finding) => finding.severity === 'error').length;
  const warnings = report.findings.filter((finding) => finding.severity === 'warning').length;
  $('#metric-services').textContent = report.components.length;
  $('#metric-dependencies').textContent = (report.edges || []).length;
  $('#metric-findings').textContent = report.findings.length;
  $('#metric-findings').className = errors ? 'has-error' : warnings ? 'has-warning' : '';
  $('#metric-findings-note').textContent = `${errors} error${errors === 1 ? '' : 's'} · ${warnings} warning${warnings === 1 ? '' : 's'}`;
  $('#metric-hash').textContent = report.source?.sha256 ? `SHA-256 ${report.source.sha256.slice(0,12)}…` : 'Fingerprint unavailable';
  $('#metric-hash').title = report.source?.sha256 || '';
  $('#metric-evidence').textContent = report.analysis_complete ? 'Static' : 'Partial';
  $('#source-status').className = `status-chip ${!report.analysis_complete || errors ? 'error' : warnings ? 'warning' : 'success'}`;
  $('#source-status').textContent = !report.analysis_complete ? 'Incomplete analysis' : errors ? `${errors} error${errors === 1 ? '' : 's'} found` : warnings ? 'Review needed' : 'Checks complete';
  $('#component-count').textContent = String(report.components.length).padStart(2,'0');
  $('#map-count').textContent = `${report.components.length} services`;
  $('#findings-count').textContent = String(report.findings.length).padStart(2,'0');
  updateExportButton();
  renderComponents();
  renderGraph();
  renderInspector();
  renderFindings();
}

function renderComponents() {
  const filter = $('#component-search').value.toLowerCase().trim();
  const components = (state.report?.components || []).filter((component) => component.name.toLowerCase().includes(filter));
  $('#component-list').innerHTML = components.length ? components.map((component) => `<button class="component-item ${component.name === state.selected ? 'selected' : ''}" data-component="${escapeHtml(component.name)}" title="${escapeHtml(component.name)}"><span>${escapeHtml(component.name)}</span><small>${String(component.line || 1).padStart(2,'0')}</small></button>`).join('') : `<p class="sidebar-empty">${filter ? 'No matching services.' : 'No services in this configuration.'}</p>`;
}

function selectComponent(name) {
  if (!state.report?.components.some((component) => component.name === name)) return;
  state.selected = name;
  renderComponents();
  renderGraph({reveal: true});
  renderInspector();
}

function effectiveGraphDirection() {
  return state.graphLayout === 'auto'
    ? ($('#graph-container').clientWidth < 820 ? 'vertical' : 'horizontal')
    : state.graphLayout;
}

function revealSelectedService(center = false) {
  const container = $('#graph-container');
  const node = $$('.graph-node').find((item) => item.dataset.graphComponent === state.selected);
  if (!node) return;
  const bounds = node.getBoundingClientRect();
  const viewport = container.getBoundingClientRect();
  let left = container.scrollLeft;
  let top = container.scrollTop;
  if (center) {
    left += bounds.left - viewport.left - (container.clientWidth - bounds.width) / 2;
    top += bounds.top - viewport.top - (container.clientHeight - bounds.height) / 2;
  } else {
    if (bounds.left < viewport.left + 20) left += bounds.left - viewport.left - 20;
    else if (bounds.right > viewport.right - 20) left += bounds.right - viewport.right + 20;
    if (bounds.top < viewport.top + 20) top += bounds.top - viewport.top - 20;
    else if (bounds.bottom > viewport.bottom - 20) top += bounds.bottom - viewport.bottom + 20;
  }
  container.scrollTo({left: Math.max(0, left), top: Math.max(0, top), behavior: 'auto'});
}

function renderGraph({reveal = false} = {}) {
  const container = $('#graph-container');
  const report = state.report;
  const previousScroll = {left: container.scrollLeft, top: container.scrollTop};
  container.replaceChildren();
  container.classList.remove('has-graph');
  $('#clear-selection').hidden = !state.selected;
  $('#center-selected').disabled = !state.selected;
  $('#graph-caption-text').textContent = 'Select a service to inspect its connections';
  if (report && (!report.analysis_complete || !report.summary?.valid_graph)) {
    container.innerHTML = '<div class="empty-state invalid"><span class="empty-symbol">!</span><h3>Dependency map unavailable</h3><p>Resolve the configuration errors or unsupported syntax below before reviewing impact.</p></div>';
    $('#graph-caption-text').textContent = 'Incomplete or invalid configuration';
    $('#center-selected').disabled = true;
    return;
  }
  if (!report?.components?.length) {
    container.innerHTML = '<div class="empty-state"><span class="empty-symbol">⌘</span><h3>No services to display</h3><p>Choose an example or import a QNX SLM configuration.</p></div>';
    return;
  }

  const impact = state.selected ? report.impacts?.[state.selected] : null;
  const affected = new Set(impact ? state.mode === 'startup' ? impact.startup_blocked : impact.coupled : []);
  const possible = new Set(state.mode === 'recovery' ? impact?.possible || [] : []);
  $('#graph-caption-text').textContent = impact
    ? `${state.selected} · ${state.mode === 'startup' ? 'startup impact' : 'session coupling'}`
    : 'Select a service to inspect its connections';

  const names = new Set(report.components.map((component) => component.name));
  let layers = (report.layers || []).map((layer) => layer.filter((name) => names.has(name))).filter((layer) => layer.length);
  const placed = new Set(layers.flat());
  const rest = report.components.filter((component) => !placed.has(component.name)).map((component) => component.name);
  if (rest.length) layers.push(rest);
  if (!layers.length) layers = [report.components.map((component) => component.name)];

  const direction = effectiveGraphDirection();
  const vertical = direction === 'vertical';
  const fingerprint = report.source?.sha256 || state.filename;
  const sameCanvas = state.graphDirection === direction && state.graphFingerprint === fingerprint;
  state.graphDirection = direction;
  state.graphFingerprint = fingerprint;

  // Canvas dimensions are CSS pixels: labels never shrink to fit the viewport.
  const maxRows = Math.max(1, ...layers.map((layer) => layer.length));
  const nodeWidth = 208;
  const nodeHeight = 82;
  const width = vertical ? Math.max(360, maxRows * 248 + 72) : (layers.length - 1) * 300 + nodeWidth + 68;
  const height = vertical ? (layers.length - 1) * 134 + nodeHeight + 88 : Math.max(320, maxRows * 140 + 120);
  const svg = svgElement('svg', {
    class: 'dependency-svg', width, height, viewBox: `0 0 ${width} ${height}`,
    role: 'group',
    'aria-label': `Dependency map with ${report.components.length} services. ${vertical ? 'Top to bottom' : 'Left to right'} layout. Select a service to inspect static coupling.`
  });
  svg.style.width = `${width}px`;
  svg.style.height = `${height}px`;
  svg.style.marginInline = width < container.clientWidth ? 'auto' : '0';
  svg.style.marginTop = `${Math.max(0, (container.clientHeight - height) / 2)}px`;

  const defs = svgElement('defs');
  [['arrow', '#a1b1c2'], ['arrow-active', '#18836b'], ['arrow-possible', '#b58b41']].forEach(([id, color]) => {
    const marker = svgElement('marker', {id, viewBox: '0 0 6 6', refX: 5, refY: 3, markerWidth: 5, markerHeight: 5, orient: 'auto-start-reverse'});
    marker.append(svgElement('path', {d: 'M0 0 6 3 0 6', fill: color, stroke: 'none'}));
    defs.append(marker);
  });
  svg.append(defs);

  const positions = new Map();
  layers.forEach((layer, layerIndex) => {
    const x = 34 + layerIndex * 300;
    const y = 44 + layerIndex * 134;
    svg.append(svgElement('text', {
      x: vertical ? 16 : x + 2,
      y: vertical ? y - 12 : 20,
      class: 'layer-label'
    }, `Layer ${layerIndex + 1}`));
    layer.forEach((name, index) => {
      if (vertical) {
        positions.set(name, {
          x: 36 + (index + .5) * (width - 72) / layer.length - nodeWidth / 2,
          y, layer: layerIndex
        });
      } else {
        positions.set(name, {
          x, y: 64 + (index + .5) * (height - 120) / layer.length - nodeHeight / 2,
          layer: layerIndex
        });
      }
    });
  });

  const outgoing = new Map();
  const incoming = new Map();
  (report.edges || []).forEach((edge) => {
    outgoing.set(edge.source, (outgoing.get(edge.source) || 0) + 1);
    incoming.set(edge.target, (incoming.get(edge.target) || 0) + 1);
  });
  const sourcePorts = new Map();
  const targetPorts = new Map();
  const edgeGroup = svgElement('g');
  const labelGroup = svgElement('g');
  const labelBoxes = [];
  const intersects = (a, b) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

  (report.edges || []).forEach((edge, index) => {
    const from = positions.get(edge.source);
    const to = positions.get(edge.target);
    if (!from || !to) return;
    const sourcePort = (sourcePorts.get(edge.source) || 0) + 1;
    const targetPort = (targetPorts.get(edge.target) || 0) + 1;
    sourcePorts.set(edge.source, sourcePort);
    targetPorts.set(edge.target, targetPort);
    const fromFraction = .25 + .5 * sourcePort / ((outgoing.get(edge.source) || 1) + 1);
    const toFraction = .25 + .5 * targetPort / ((incoming.get(edge.target) || 1) + 1);
    const skipsLayer = to.layer - from.layer > 1;
    let d, labelX, labelY, anchor = 'middle';

    if (vertical) {
      const sx = from.x + nodeWidth * fromFraction;
      const sy = from.y + nodeHeight;
      const ex = to.x + nodeWidth * toFraction;
      const ey = to.y - 5;
      if (skipsLayer) {
        const rail = from.x + nodeWidth / 2 <= width / 2 ? 18 + index % 2 * 12 : width - 18 - index % 2 * 12;
        d = `M${sx} ${sy} C${sx} ${sy + 23} ${rail} ${sy + 23} ${rail} ${sy + 38} L${rail} ${ey - 38} C${rail} ${ey - 23} ${ex} ${ey - 23} ${ex} ${ey}`;
        labelX = (sx + rail) / 2;
        labelY = sy + 20;
      } else {
        const control = (sy + ey) / 2;
        d = `M${sx} ${sy} C${sx} ${control} ${ex} ${control} ${ex} ${ey}`;
        labelX = (sx + ex) / 2 + 7;
        labelY = (sy + ey) / 2 + 3;
        anchor = 'start';
      }
    } else {
      const sx = from.x + nodeWidth;
      const sy = from.y + nodeHeight * fromFraction;
      const ex = to.x - 5;
      const ey = to.y + nodeHeight * toFraction;
      if (skipsLayer) {
        const rail = 49 + index % 2 * 13;
        d = `M${sx} ${sy} C${sx + 28} ${sy} ${sx + 28} ${rail} ${sx + 50} ${rail} L${ex - 50} ${rail} C${ex - 28} ${rail} ${ex - 28} ${ey} ${ex} ${ey}`;
        labelX = (sx + ex) / 2;
        labelY = rail - 7;
      } else {
        const control = (sx + ex) / 2;
        d = `M${sx} ${sy} C${control} ${sy} ${control} ${ey} ${ex} ${ey}`;
        labelX = (sx + ex) / 2;
        labelY = (sy + ey) / 2 - 8;
      }
    }

    const relevantFrom = edge.source === state.selected || affected.has(edge.source) || possible.has(edge.source);
    const relevantTo = affected.has(edge.target) || possible.has(edge.target);
    const highlighted = !!impact && relevantFrom && relevantTo && (state.mode === 'startup' || edge.state !== 'stateless');
    const uncertain = highlighted && (edge.state === 'unspecified' || possible.has(edge.source) || possible.has(edge.target));
    const edgeClass = `graph-edge ${edge.state || 'unspecified'}${highlighted ? uncertain ? ' possible-highlight' : ' highlight' : impact ? ' dimmed' : ''}`;
    const path = svgElement('path', {
      d, class: edgeClass,
      'marker-end': `url(#${highlighted ? uncertain ? 'arrow-possible' : 'arrow-active' : 'arrow'})`
    });
    path.append(svgElement('title', {}, `${edge.source} → ${edge.target}: ${edge.state || 'unspecified'}`));
    edgeGroup.append(path);
    const labelText = edge.state === 'session' ? 'session' : edge.state === 'stateless' ? 'stateless' : 'unspecified';
    const labelWidth = labelText.length * 7.2 + 6;
    // Crossing edges use adjacent label lanes rather than printing over each other.
    const candidates = [0, -14, 14, -28, 28];
    let labelBox;
    for (const offset of candidates) {
      const baseline = labelY + offset;
      if (vertical && (baseline < from.y + nodeHeight + 12 || baseline > Math.min(to.y - 10, from.y + nodeHeight + 40))) continue;
      const box = {x: labelX - (anchor === 'middle' ? labelWidth / 2 : 0) - 3, y: baseline - 12, width: labelWidth, height: 17};
      if (box.y < 10 || box.y + box.height > height - 10) continue;
      if (labelBoxes.some((other) => intersects(box, other))) continue;
      if ([...positions.values()].some((position) => intersects(box, {x: position.x - 4, y: position.y - 4, width: nodeWidth + 8, height: nodeHeight + 8}))) continue;
      labelY = baseline;
      labelBox = box;
      break;
    }
    labelBoxes.push(labelBox || {x: labelX - labelWidth / 2, y: labelY - 12, width: labelWidth, height: 17});
    labelGroup.append(svgElement('text', {
      x: labelX, y: labelY, 'text-anchor': anchor,
      class: `edge-label ${edge.state || 'unspecified'}${highlighted && !uncertain ? ' highlight' : impact && !highlighted ? ' dimmed' : ''}`
    }, labelText));
  });
  svg.append(edgeGroup, labelGroup);

  report.components.forEach((component) => {
    const position = positions.get(component.name);
    if (!position) return;
    const selected = component.name === state.selected;
    const classes = [
      'graph-node', selected ? 'selected' : affected.has(component.name) ? 'coupled' : possible.has(component.name) ? 'possible' : impact ? 'dimmed' : ''
    ].filter(Boolean).join(' ');
    const group = svgElement('g', {
      class: classes, transform: `translate(${position.x},${position.y})`, tabindex: 0,
      role: 'button', 'data-graph-component': component.name,
      'aria-label': `${component.name}, source line ${component.line}. ${selected ? 'Selected service.' : 'Inspect dependencies.'}`,
      'aria-pressed': selected
    });
    group.append(svgElement('title', {}, `${component.name}\n${component.command}\nLine ${component.line}`));
    group.append(svgElement('rect', {class: 'node-card', width: nodeWidth, height: nodeHeight, rx: 6}));
    group.append(svgElement('rect', {class: 'node-type', x: 14, y: 17, width: 6, height: 6, rx: 1.5}));
    group.append(svgElement('text', {class: 'node-name', x: 29, y: 25}, component.name.length > 21 ? `${component.name.slice(0, 20)}…` : component.name));
    const command = component.command || 'No command';
    group.append(svgElement('text', {class: 'node-command', x: 14, y: 48}, command.length > 25 ? `…${command.slice(-24)}` : command));
    group.append(svgElement('text', {class: 'node-line', x: 14, y: 68}, `L${component.line || 1} · ${component.wait?.mode || 'none'}`));
    if (report.findings.some((finding) => finding.component === component.name && finding.severity !== 'info')) {
      group.append(svgElement('circle', {class: 'node-warning', cx: nodeWidth - 16, cy: 65, r: 3}));
    }
    group.addEventListener('click', () => selectComponent(component.name));
    group.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        selectComponent(component.name);
        $$('.graph-node').find((node) => node.dataset.graphComponent === component.name)?.focus({preventScroll: true});
      }
    });
    svg.append(group);
  });

  container.classList.add('has-graph');
  container.append(svg);
  if (sameCanvas) container.scrollTo(previousScroll);
  else container.scrollTo({left: 0, top: 0});
  if (reveal || !sameCanvas) requestAnimationFrame(() => revealSelectedService());
}

function pillList(names, className = '') {
  return `<div class="service-pills ${className}">${names.map((name) => `<button class="service-pill" data-component="${escapeHtml(name)}">${escapeHtml(name)}</button>`).join('')}</div>`;
}

function renderInspector() {
  const component = state.report?.components.find((item) => item.name === state.selected);
  const content = $('#inspector-content');
  if (!component) {
    content.innerHTML = '<div class="inspector-placeholder"><div class="eyebrow">Service details</div><h3>Select a service</h3><p>Select a service in the map to explore its startup dependencies and recovery coupling.</p><div class="model-note"><span class="note-title">Static analysis</span>This is a static dependency model. It does not execute a restart or measure target behavior.</div></div>';
    return;
  }
  const impact = state.report.impacts?.[component.name];
  const startup = state.mode === 'startup';
  const affected = (startup ? impact?.startup_blocked : impact?.coupled) || [];
  const possible = impact?.possible || [];
  const wait = component.wait || {mode:'none',value:''};
  const repair = component.repair || {mode:'default'};
  content.innerHTML = `<div class="inspector-header"><div class="inspector-eyebrow">Service details</div><div class="inspector-title"><span class="service-symbol"><svg viewBox="0 0 20 20" aria-hidden="true"><rect x="5" y="5" width="10" height="10" rx="1.5"/><path d="M8 2v3m4-3v3m-4 10v3m4-3v3M2 8h3m-3 4h3m10-4h3m-3 4h3"/></svg></span><h3>${escapeHtml(component.name)}</h3></div><p>${escapeHtml(component.command || 'No command')} · <button class="line-link" data-line="${component.line || 1}">line ${component.line || 1} ↗</button></p></div><div class="inspector-content"><div><div class="inspector-label">${startup ? 'Startup impact' : 'Recovery coupling'}<span class="tiny-badge">Static</span></div>${impact ? `<div class="impact-count">${affected.length}<span>service${affected.length === 1 ? '' : 's'} ${startup ? 'downstream' : 'coupled'}</span></div><p class="impact-explanation">${startup ? 'These services require this prerequisite, directly or through another dependency.' : 'Reachable through explicit session dependencies when a prerequisite is stopped or restarted.'}</p>${affected.length ? pillList(affected) : '<p class="impact-explanation">No services in this configuration share this dependency path.</p>'}` : '<p class="impact-explanation">Impact is unavailable until the configuration is complete and its graph is valid.</p>'}</div>${!startup && possible.length ? `<div><div class="inspector-label">Uncertain coupling<span class="tiny-badge">${possible.length}</span></div><p class="impact-explanation">At least one dependency has no explicit state. Verify its behavior on the target.</p>${pillList(possible,'possible')}</div>` : ''}<div class="inspector-divider"></div><div><div class="property-row"><span>Readiness gate</span><strong>${escapeHtml(wait.mode || 'none')}</strong></div>${wait.value ? `<div class="property-row"><span>Wait value</span><strong>${escapeHtml(wait.value)}</strong></div>` : ''}${wait.timeout_ms != null ? `<div class="property-row"><span>Wait timeout</span><strong>${escapeHtml(wait.timeout_ms)} ms</strong></div>` : ''}<div class="property-row"><span>Repair policy</span><strong>${escapeHtml(repair.mode || 'default')}</strong></div>${repair.backoff_seconds != null ? `<div class="property-row"><span>Restart backoff</span><strong>${escapeHtml(repair.backoff_seconds)} s</strong></div>` : ''}<div class="property-row"><span>Prerequisites</span><strong>${component.dependencies?.length || 0}</strong></div></div>${impact?.critical || component.launch?.includes('critical') ? '<div class="model-note critical-note"><span class="note-title">Critical process</span>This command uses launch="critical". An unexpected process death may crash the system. A local coupling map is not a complete failure model.</div>' : ''}<div class="inspector-divider"></div><div class="model-note"><span class="note-title">Model limits</span>${startup ? 'Downstream startup can be blocked while a prerequisite or its wait condition is unsatisfied. No startup timing is predicted.' : 'Session and stateless describe dependency coupling. Actual recovery also depends on repair policy, SLM options, and runtime state. Manual slmctl operations may differ.'}</div></div>`;
}

function renderFindings() {
  const all = state.report?.findings || [];
  const findings = all.filter((finding) => state.filter === 'all' || finding.severity === state.filter);
  const filename = state.report?.source?.name || state.filename;
  $('#findings-list').innerHTML = findings.length ? findings.map((finding) => {
    const docUrl = /^https:\/\/(?:www\.)?qnx\.com\//.test(finding.doc_url || '') ? finding.doc_url : '';
    return `<article class="finding"><span class="finding-severity ${escapeHtml(finding.severity)}" title="${escapeHtml(finding.severity)}">${finding.severity === 'error' ? '×' : finding.severity === 'warning' ? '!' : 'i'}</span><div><h3>${escapeHtml(finding.title)}<span class="finding-id">${escapeHtml(finding.id)}</span></h3><p>${escapeHtml(finding.detail)}</p>${finding.recommendation ? `<p class="recommendation"><strong>Review:</strong> ${escapeHtml(finding.recommendation)}</p>` : ''}${docUrl ? `<a class="finding-reference" href="${escapeHtml(docUrl)}" target="_blank" rel="noopener noreferrer">SLM reference ↗</a>`:''}</div><button class="finding-source" data-line="${Math.max(1,Number(finding.line) || 1)}" title="Open XML at line ${Math.max(1,Number(finding.line) || 1)}">${escapeHtml(filename)}:${Math.max(1,Number(finding.line) || 1)} ↗</button></article>`;
  }).join('') : `<div class="findings-empty">${all.length ? `No ${state.filter} findings in this configuration.` : state.report?.analysis_complete ? 'No findings from the supported static checks. Validate behavior on your QNX target.' : 'Analysis is incomplete. Review your source before relying on this configuration.'}</div>`;
}

function updateLineNumbers() {
  const count = $('#source-editor').value.split('\n').length;
  $('#line-numbers').textContent = Array.from({length:count},(_,index)=>index+1).join('\n');
}

function openSource(line = 1, target = 'graph') {
  state.editorTarget = target;
  const source = target === 'graph' ? {filename: state.filename, xml: state.xml} : state.compareSources[target] || {filename: target === 'before' ? 'baseline.xml' : 'candidate.xml', xml: ''};
  $('#editor-error').hidden = true;
  $('#editor-title').textContent = target === 'graph' ? 'Edit configuration' : `Edit ${target === 'before' ? 'baseline' : 'candidate'}`;
  $('#editor-subtitle').textContent = target === 'graph' ? 'QNX 8.0 SLM XML' : 'Saved independently from the other revision.';
  $('#analyze-source').textContent = target === 'graph' ? 'Analyze configuration' : `Save ${target === 'before' ? 'baseline' : 'candidate'}`;
  $('#source-filename').value = source.filename;
  $('#source-editor').value = source.xml;
  updateLineNumbers();
  $('#source-dialog').showModal();
  const editor = $('#source-editor');
  const lines = editor.value.split('\n');
  const clamped = Math.min(Math.max(1,Number(line) || 1),lines.length);
  const start = lines.slice(0,clamped-1).reduce((total,value)=>total+value.length+1,0);
  requestAnimationFrame(() => {
    editor.focus();
    editor.setSelectionRange(start,start + (lines[clamped-1]?.length || 0));
    const lineHeight = parseFloat(getComputedStyle(editor).lineHeight);
    editor.scrollTop = Math.max(0,(clamped-5)*lineHeight);
    $('#line-numbers').scrollTop = editor.scrollTop;
  });
}


async function compare() {
  const before = state.compareSources.before;
  const after = state.compareSources.after;
  if (!before || !after) { toast('Choose two configurations to compare.'); return; }
  invalidateComparison('Comparing the selected revisions…');
  busy(1);
  showError('');
  try {
    const result = await request('/api/compare',{before:before.xml,after:after.xml,before_name:before.filename || before.name,after_name:after.filename || after.name,protected:[...state.protectedNames].sort()});
    if (!result.changes || !result.before || !result.after) throw new Error('The host returned an incomplete comparison.');
    state.comparison = result;
    renderComparison(result);
    updateExportButton();
  } catch(error) {
    invalidateComparison('The comparison could not be completed. Review the host error above, then retry.');
    showError(error.message || 'The revisions could not be compared.');
  }
  finally { busy(-1); }
}

function componentName(item) {
  if (typeof item === 'string') return item;
  return item.name || item.component || item.after?.name || item.before?.name || 'Component';
}

function diffValue(value) {
  if (value === undefined || value === null) return '<span class="diff-not-set">Not set</span>';
  const text = typeof value === 'string' ? value || '(empty)' : JSON.stringify(value, null, 2);
  return `<pre>${escapeHtml(text)}</pre>`;
}

function diffFieldLabel(field) {
  const labels = {command: 'Command', args: 'Arguments', launch: 'Launch options', wait: 'Readiness', repair: 'Repair policy', dependencies: 'Dependencies', properties: 'Other SLM properties'};
  return labels[field] || String(field).replace(/_/g, ' ').replace(/^./, (letter) => letter.toUpperCase());
}

function propertyDiffTable(fields) {
  return `<div class="property-diff-scroll" tabindex="0" aria-label="Property changes"><table class="property-diff-table"><thead><tr><th scope="col">Property</th><th scope="col">Baseline</th><th scope="col">Candidate</th></tr></thead><tbody>${fields.map((field) => `<tr><th scope="row">${escapeHtml(diffFieldLabel(field.field))}</th><td class="before-value">${diffValue(field.before)}</td><td class="after-value">${diffValue(field.after)}</td></tr>`).join('')}</tbody></table></div>`;
}

function protectionResult(result) {
  const policy = result.policy;
  if (!policy) return '';
  const selected = policy.protected || [];
  const violations = policy.violations || [];
  const unknown = policy.unknown_protected || [];
  let title = 'No protected services selected';
  let description = 'This comparison contains no protected-service rules. Select services above and compare again to evaluate new coupling into them.';
  let kind = 'neutral';
  if (!policy.evaluated) {
    title = 'Protection check unavailable';
    description = unknown.length ? 'A selected protected service is absent from the candidate. Review the removal or update the protection selection.' : 'Both configurations must have complete analysis and valid dependency graphs before protection can be evaluated.';
    kind = 'warning';
  } else if (selected.length && violations.length) {
    title = 'New coupling requires review';
    description = `${violations.length} new explicit or uncertain coupling path${violations.length === 1 ? '' : 's'} reach${violations.length === 1 ? 'es' : ''} selected protected services.`;
    kind = 'warning';
  } else if (selected.length && policy.passed) {
    title = 'No new coupling into protected services';
    description = `No new explicit or uncertain coupling was found into the ${selected.length} selected service${selected.length === 1 ? '' : 's'}. This static result does not establish runtime safety.`;
    kind = 'complete';
  }
  return `<section class="policy-result ${kind}" aria-label="Protected-service check"><div class="policy-result-heading"><span class="policy-symbol">${kind === 'warning' ? '!' : '↳'}</span><div><h3>${title}</h3><p>${description}</p></div><span class="policy-selection-count">${selected.length} protected</span></div>${selected.length ? `<div class="policy-selected-names">${selected.map((name) => `<code>${escapeHtml(name)}</code>`).join('')}</div>` : ''}${unknown.length ? `<p class="policy-missing">Absent in candidate: ${unknown.map((name) => `<code>${escapeHtml(name)}</code>`).join(', ')}</p>` : ''}${violations.length ? `<div class="policy-violations">${violations.map((entry) => `<div><code>${escapeHtml(entry.source)} → ${escapeHtml(entry.target)}</code><span>${entry.certainty === 'unspecified-state' ? 'Uncertain dependency state' : 'Explicit session coupling'}</span><p>${escapeHtml((entry.path || [entry.source, entry.target]).join(' → '))}</p></div>`).join('')}</div>` : ''}</section>`;
}

function renderComparison(result) {
  const changes = result.changes;
  const addedComponents = changes.added_components || [];
  const removedComponents = changes.removed_components || [];
  const changedComponents = changes.changed_components || [];
  const componentDetails = new Map((changes.component_changes || []).map((entry) => [entry.name, entry.fields || []]));
  const addedEdges = changes.added_edges || [];
  const removedEdges = changes.removed_edges || [];
  const resolved = changes.resolved_findings || [];
  const newFindings = changes.new_findings || [];
  const edgeChangeCount = addedEdges.length + removedEdges.length;
  const hasIncomplete = !result.before.analysis_complete || !result.after.analysis_complete || !result.before.summary?.valid_graph || !result.after.summary?.valid_graph;
  const stats = [
    {value: changedComponents.length + addedComponents.length + removedComponents.length, label: 'services changed'},
    {value: edgeChangeCount, label: 'relationship changes'},
    {value: resolved.length, label: 'findings resolved'},
    {value: newFindings.length, label: 'new findings', adverse: newFindings.length > 0}
  ];
  const edgeRow = (edge, added) => `<div class="change-row ${added ? 'added' : 'removed'}"><span class="sign">${added ? '+' : '−'}</span><div><code>${escapeHtml(edge.source)} → ${escapeHtml(edge.target)}</code><p><span class="change-state">${escapeHtml(edge.state || 'unspecified')}</span> · ${added ? 'Added' : 'Removed'} dependency</p></div></div>`;
  const findingRow = (finding, added) => `<div class="change-row ${added ? 'removed' : 'added'}"><span class="sign">${added ? '!' : '✓'}</span><div><code>${escapeHtml(finding.title || finding.id || finding)}</code><p>${escapeHtml(finding.component || 'Configuration')} · ${escapeHtml(finding.severity || 'finding')}${finding.line ? ` · line ${escapeHtml(finding.line)}` : ''}</p></div></div>`;
  const componentRow = (item, kind) => `<div class="change-row ${kind === 'removed' ? 'removed' : 'added'}"><span class="sign">${kind === 'added' ? '+' : '−'}</span><div><code>${escapeHtml(componentName(item))}</code><p>${kind === 'added' ? 'Service added' : 'Service removed'}</p></div></div>`;
  const serviceRows = [...addedComponents.map((item) => componentRow(item, 'added')), ...removedComponents.map((item) => componentRow(item, 'removed'))];
  const propertyRows = changedComponents.map((item) => {
    const name = componentName(item);
    const fields = componentDetails.get(name) || [];
    return `<details class="component-property-diff" ${fields.length && fields.length <= 3 ? 'open' : ''}><summary><code>${escapeHtml(name)}</code><span>${fields.length ? `${fields.length} changed propert${fields.length === 1 ? 'y' : 'ies'}` : 'Properties changed'}</span></summary>${fields.length ? propertyDiffTable(fields) : '<p class="change-empty">Detailed property values are not included in this report.</p>'}</details>`;
  });
  const impactChanges = calculateImpactChanges(result.before, result.after);
  const possibleChanges = calculateImpactChanges(result.before, result.after, 'possible');
  const possiblePaths = changes.new_possible_couplings || [];
  const couplingRows = (items, uncertain = false) => items.map((change) => {
    const paths = uncertain ? possiblePaths.filter((entry) => entry.source === change.name && change.added.includes(entry.target)) : [];
    return `<div class="change-row ${uncertain ? 'uncertain' : ''}"><span class="sign">${uncertain ? '?' : '↳'}</span><div><code>${escapeHtml(change.name)}</code><p>${change.before} → ${change.after} ${uncertain ? 'possibly' : 'explicitly'} coupled services${change.added.length ? ` · added ${escapeHtml(change.added.join(', '))}` : ''}${change.removed.length ? ` · removed ${escapeHtml(change.removed.join(', '))}` : ''}</p>${paths.map((entry) => `<p>Possible path: <code>${escapeHtml((entry.path || [entry.source, entry.target]).join(' → '))}</code></p>`).join('')}</div></div>`;
  }).join('');
  const section = (title, count, body, extraClass = '') => `<section class="panel change-section ${extraClass}"><div class="panel-heading"><h2>${title} <span class="subtle-count">${count}</span></h2></div><div class="change-list">${body}</div></section>`;
  const empty = (text) => `<div class="change-empty">${text}</div>`;
  let sections = section('Dependency changes', edgeChangeCount, edgeChangeCount ? removedEdges.map((edge) => edgeRow(edge, false)).join('') + addedEdges.map((edge) => edgeRow(edge, true)).join('') : empty('No dependencies added or removed.'));
  sections += section('Recovery coupling changes', impactChanges.length, hasIncomplete ? empty('Unavailable for an invalid or incomplete graph.') : impactChanges.length ? couplingRows(impactChanges) : empty('No explicit session coupling changed.'));
  if (possibleChanges.length || possiblePaths.length) sections += section('Possible coupling changes', possibleChanges.length, (hasIncomplete ? empty('Unavailable for an invalid or incomplete graph.') : couplingRows(possibleChanges, true)) + '<p class="compare-source-note">These paths cross an unspecified dependency state. A change in uncertainty is not proof of safer recovery.</p>');
  sections += section('Added and removed services', serviceRows.length, serviceRows.length ? serviceRows.join('') : empty('No services added or removed.'));
  sections += section('Finding changes', resolved.length + newFindings.length, resolved.length + newFindings.length ? resolved.map((finding) => findingRow(finding, false)).join('') + newFindings.map((finding) => findingRow(finding, true)).join('') : empty('No findings added or resolved.'));
  sections += section('Changed service properties', changedComponents.length, propertyRows.length ? propertyRows.join('') : empty('No service properties changed.'), 'property-change-section');

  if (changes.modules) {
    const modules = changes.modules;
    const added = modules.added || [], removed = modules.removed || [], changed = modules.changed || [];
    const moduleRow = (item, kind) => {
      const name = typeof item === 'string' ? item : item.name;
      const definition = typeof item === 'string' ? (kind === 'removed' ? result.before.modules : result.after.modules)?.find((entry) => entry.name === name) : item;
      return `<div class="change-row ${kind === 'removed' ? 'removed' : 'added'}"><span class="sign">${kind === 'removed' ? '−' : '+'}</span><div><code>${escapeHtml(name)}</code><p>Module ${kind}${definition?.members ? ` · ${escapeHtml(definition.members.join(', '))}` : ''}</p></div></div>`;
    };
    const rows = [...added.map((item) => moduleRow(item, 'added')), ...removed.map((item) => moduleRow(item, 'removed')), ...changed.map((item) => `<details class="component-property-diff" open><summary><code>${escapeHtml(item.name)}</code><span>Module changed</span></summary>${propertyDiffTable([{field: 'Module definition', before: item.before, after: item.after}])}</details>`)];
    sections += section('Module changes', rows.length, rows.length ? rows.join('') : empty('No module definitions changed.'), 'property-change-section');
  }

  $('#compare-results').innerHTML = `${hasIncomplete ? '<div class="comparison-warning">One or both configurations have errors or unsupported syntax. This comparison does not establish a valid deployment configuration.</div>' : ''}${protectionResult(result)}<div class="compare-summary">${stats.map((stat) => `<div class="compare-stat ${stat.adverse ? 'adverse' : ''}"><strong>${stat.value}</strong><span>${stat.label}</span></div>`).join('')}</div><div class="change-grid">${sections}</div><p class="compare-source-note">Baseline: ${escapeHtml(result.before.source?.name || 'before.xml')} (${escapeHtml(result.before.source?.sha256?.slice(0, 12) || 'no fingerprint')}) · Candidate: ${escapeHtml(result.after.source?.name || 'after.xml')} (${escapeHtml(result.after.source?.sha256?.slice(0, 12) || 'no fingerprint')}). Static coupling is not measured recovery behavior.</p>`;
}

function calculateImpactChanges(before,after,key = 'coupled') {
  const names = [...new Set([...Object.keys(before.impacts || {}),...Object.keys(after.impacts || {})])].sort();
  return names.map((name)=>{
    const oldCoupled = before.impacts?.[name]?.[key] || [], newCoupled = after.impacts?.[name]?.[key] || [];
    return {name,before:oldCoupled.length,after:newCoupled.length,added:newCoupled.filter((item)=>!oldCoupled.includes(item)),removed:oldCoupled.filter((item)=>!newCoupled.includes(item))};
  }).filter((change)=>change.added.length || change.removed.length);
}

function updateEvidenceControls() {
  const evidence = state.evidence;
  $('#import-evidence').disabled = !!state.busy;
  $('#evidence-example').disabled = !!state.busy;
  $('#check-evidence').disabled = !!state.busy || !evidence.raw || !state.report;
  $('#clear-evidence').disabled = !!state.busy;
  $('#clear-evidence').hidden = !evidence.raw;
}

function resetEvidenceBinding(message = '') {
  state.evidence.sequence += 1;
  state.evidence.checked = null;
  state.evidence.checkedFor = null;
  state.evidence.checking = false;
  state.evidence.message = state.evidence.raw ? message : '';
  renderEvidence();
}

function populateEvidenceExamples() {
  const select = $('#evidence-example');
  select.replaceChildren();
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Choose a captured recording…';
  select.append(placeholder);
  state.evidence.examples.forEach((example) => {
    const option = document.createElement('option');
    option.value = example.id;
    option.textContent = example.name || example.filename || example.id;
    select.append(option);
  });
  if (state.evidence.raw && !state.evidence.exampleId) {
    const option = document.createElement('option');
    option.value = '__imported';
    option.textContent = state.evidence.filename;
    select.append(option);
  }
  select.value = state.evidence.exampleId || (state.evidence.raw ? '__imported' : '');
}

async function loadEvidenceExamples() {
  try {
    const result = await request('/api/evidence/examples');
    state.evidence.examples = (Array.isArray(result) ? result : result.examples || []).filter((entry) => entry && entry.id && entry.evidence);
    populateEvidenceExamples();
  } catch (_) {
    // File import remains available if the optional example endpoint is absent.
  }
}

async function importEvidence(raw, filename, exampleId = null) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('The recording must be a JSON object.');
  state.evidence.raw = raw;
  state.evidence.filename = filename;
  state.evidence.exampleId = exampleId;
  state.evidence.error = '';
  resetEvidenceBinding('Recording imported. Check its configuration binding.');
  populateEvidenceExamples();
  updateExportButton();
  if (state.report) await checkEvidence();
}

async function checkEvidence() {
  const evidence = state.evidence;
  if (!evidence.raw || !state.report) return;
  const raw = evidence.raw;
  const xml = state.xml;
  const sequence = ++evidence.sequence;
  evidence.checked = null;
  evidence.checkedFor = null;
  evidence.error = '';
  evidence.checking = true;
  evidence.message = 'Checking the recording against the active XML…';
  renderEvidence();
  busy(1);
  try {
    const checked = await request('/api/evidence', {xml, evidence: raw});
    if (sequence !== evidence.sequence || raw !== evidence.raw || xml !== state.xml) return;
    if (!['matched', 'mismatch', 'incomplete', 'invalid'].includes(checked.status) || !Array.isArray(checked.issues) || !Array.isArray(checked.observations)) throw new Error('The host returned an incomplete recording check.');
    if (checked.status === 'matched' && (checked.configuration_matches !== true || checked.configuration_sha256 !== state.report.source?.sha256)) throw new Error('The recording check is not bound to the active XML report.');
    evidence.checked = checked;
    evidence.checkedFor = state.report.source?.sha256 || null;
    evidence.message = '';
  } catch (error) {
    if (sequence === evidence.sequence) {
      evidence.error = error.message || 'The recording could not be checked.';
      evidence.message = 'Recording retained. No current configuration binding has been established.';
    }
  } finally {
    if (sequence === evidence.sequence) evidence.checking = false;
    busy(-1);
    renderEvidence();
  }
}

function renderEvidence() {
  const evidence = state.evidence;
  const checked = evidence.checkedFor && evidence.checkedFor === state.report?.source?.sha256 ? evidence.checked : null;
  const badge = $('#evidence-status');
  badge.className = `evidence-status ${checked?.status === 'matched' ? 'bound' : checked ? 'attention' : ''}`;
  badge.textContent = evidence.checking ? 'Checking hash…' : !evidence.raw ? 'No recording' : !checked ? 'Not checked' : ({matched: 'XML hash matched', mismatch: 'XML hash mismatch', incomplete: 'Incomplete recording', invalid: 'Invalid recording'})[checked.status];
  $('#evidence-error').hidden = !evidence.error;
  $('#evidence-error').textContent = evidence.error;
  updateEvidenceControls();
  if (!evidence.raw) {
    $('#evidence-content').innerHTML = '<p class="evidence-empty">No recording loaded. Static analysis remains available without a recording.</p>';
    return;
  }
  const fileRow = `<div class="evidence-source-row"><span>Imported file</span><code>${escapeHtml(evidence.filename)}</code><span class="evidence-origin">Origin not authenticated</span></div>`;
  if (!checked) {
    $('#evidence-content').innerHTML = `${fileRow}<p class="evidence-empty">${escapeHtml(evidence.message || 'Check this recording against the active XML before associating observations with it.')}</p>`;
    return;
  }
  const environment = checked.environment || {};
  const experiment = checked.experiment || {};
  const issues = checked.issues.length ? `<ul class="evidence-issues">${checked.issues.map((issue) => `<li>${escapeHtml(issue)}</li>`).join('')}</ul>` : '';
  const hash = `<dl class="evidence-facts"><div><dt>Active XML SHA-256</dt><dd><code>${escapeHtml(checked.configuration_sha256 || 'Unavailable')}</code></dd></div><div><dt>Recorded SHA-256</dt><dd><code>${escapeHtml(checked.recorded_sha256 || 'Unavailable')}</code></dd></div>${environment.qnx_uname ? `<div><dt>Recorded environment</dt><dd>${escapeHtml(environment.qnx_uname)}</dd></div>` : ''}${environment.slm_build_id ? `<div><dt>Recorded SLM build</dt><dd><code>${escapeHtml(environment.slm_build_id)}</code></dd></div>` : ''}${experiment.operation ? `<div><dt>Recorded operation</dt><dd><code>${escapeHtml(experiment.operation)}</code> · ${escapeHtml(experiment.subject || '')}</dd></div>` : ''}${experiment.trigger ? `<div><dt>Recorded trigger</dt><dd>${escapeHtml(experiment.trigger)}</dd></div>` : ''}</dl>`;
  const observationTable = checked.observations.length ? `<div class="evidence-table-scroll" tabindex="0" aria-label="Imported component observations"><table class="evidence-table"><thead><tr><th scope="col">Service</th><th scope="col">Before instance</th><th scope="col">After instance</th><th scope="col">Restart recorded</th><th scope="col">Heartbeats before / after</th></tr></thead><tbody>${checked.observations.map((entry) => `<tr><th scope="row">${escapeHtml(entry.component)}</th><td><code>${escapeHtml(entry.before_instance)}</code></td><td><code>${escapeHtml(entry.after_instance)}</code></td><td>${entry.restarted === true ? 'Yes' : 'No'}</td><td>${escapeHtml(entry.heartbeats_before)} / ${escapeHtml(entry.heartbeats_after)}</td></tr>`).join('')}</tbody></table></div>` : '';
  const ipc = Array.isArray(checked.ipc_observations) ? checked.ipc_observations : [];
  const counterRange = (first, last) => `${escapeHtml(first)} <span aria-hidden="true">→</span><span class="visually-hidden"> to </span> ${escapeHtml(last)}`;
  const ipcTable = ipc.length ? `<section class="ipc-counter-section" aria-label="Recorded IPC counters"><h3>Recorded IPC counters</h3><p>First → last within each recorded window. Counters may reset after a restart; these samples do not prove continuous availability.</p><div class="evidence-table-scroll" tabindex="0" aria-label="Imported IPC counters by recording window"><table class="evidence-table ipc-counter-table"><thead><tr><th scope="col">Service</th><th scope="col">Window</th><th scope="col">Successful IPC counter</th><th scope="col">Error counter</th><th scope="col">Sample counter</th></tr></thead><tbody>${ipc.map((entry) => `<tr><th scope="row">${escapeHtml(entry.component)}</th><td><span class="ipc-window" title="Recorded sequence ${escapeHtml(entry.first_sequence)} to ${escapeHtml(entry.last_sequence)}">${entry.window === 'before' ? 'Before' : 'After'}</span></td><td class="counter-range">${counterRange(entry.first_ipc_successes, entry.last_ipc_successes)}</td><td class="counter-range">${counterRange(entry.first_ipc_errors, entry.last_ipc_errors)}</td><td class="counter-range">${counterRange(entry.first_sample, entry.last_sample)}</td></tr>`).join('')}</tbody></table></div></section>` : '';
  const recordedObservations = observationTable + ipcTable;
  const observations = checked.status === 'matched' ? recordedObservations : recordedObservations ? `<details class="unbound-observations"><summary>Imported observations · not matched to active XML</summary>${recordedObservations}</details>` : '';
  $('#evidence-content').innerHTML = `${fileRow}${issues}${hash}${observations}`;
}

function exportReport() {
  let report = state.view === 'compare' ? state.comparison : state.report;
  if (!report) return;
  let filename = state.view === 'compare' ? 'bootweave-comparison.json' : `${state.filename.replace(/\.xml$/i, '')}-report.json`;
  if (state.view === 'graph' && state.evidence.raw) {
    const check = state.evidence.checkedFor === state.report.source?.sha256 ? state.evidence.checked : null;
    report = {
      schema: 'bootweave.review-bundle.v1',
      static_report: state.report,
      recording: {filename: state.evidence.filename, raw: state.evidence.raw, check},
      notice: check ? 'Imported recording; origin is not authenticated. Static analysis and recorded observations are separate.' : 'The imported recording has no current configuration binding check.'
    };
    filename = 'bootweave-review-bundle.json';
  }
  const blob = new Blob([JSON.stringify(report, null, 2) + '\n'], {type: 'application/json'});
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast(state.view === 'graph' && state.evidence.raw ? 'Review bundle exported with recording provenance.' : 'Report exported with source fingerprints.');
}

$$('.nav-item').forEach((button)=>button.addEventListener('click',()=>setView(button.dataset.view)));
$$('[data-mode]').forEach((button)=>button.addEventListener('click',()=>{
  state.mode = button.dataset.mode;
  $$('[data-mode]').forEach((item)=>{item.classList.toggle('active',item === button);item.setAttribute('aria-pressed',item === button);});
  renderGraph();
  renderInspector();
}));
$$('[data-filter]').forEach((button)=>button.addEventListener('click',()=>{
  state.filter = button.dataset.filter;
  $$('[data-filter]').forEach((item)=>item.classList.toggle('active',item===button));
  renderFindings();
}));
$('#component-search').addEventListener('input',renderComponents);
document.addEventListener('click',(event)=>{
  const component = event.target.closest('[data-component]');
  if (component) {setView('graph');selectComponent(component.dataset.component);}
  const line = event.target.closest('[data-line]');
  if (line) openSource(line.dataset.line);
});
$('#graph-layout').addEventListener('change', (event) => {
  state.graphLayout = event.target.value;
  renderGraph({reveal: true});
});
$('#center-selected').addEventListener('click', () => revealSelectedService(true));
$('#clear-selection').addEventListener('click',()=>{state.selected=null;renderComponents();renderGraph();renderInspector();});
$('#example-select').addEventListener('change',async(event)=>{
  const example = state.examples.find((item)=>item.id===event.target.value);
  if (example) {
    const previousId = state.examples.find((item)=>item.xml===state.xml && item.filename===state.filename)?.id || '__current';
    const loaded = await analyze(example.xml,example.filename || `${example.id}.xml`,example.id);
    if (!loaded) populateSourceSelect(previousId);
  }
});
$('#edit-source').addEventListener('click',()=>openSource());
$('#close-source').addEventListener('click',()=>$('#source-dialog').close());
$('#source-dialog').addEventListener('click',(event)=>{if (event.target === $('#source-dialog')) {const bounds=event.target.getBoundingClientRect();if(event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom) event.target.close();}});
$('#source-editor').addEventListener('input',updateLineNumbers);
$('#source-editor').addEventListener('scroll',()=>{$('#line-numbers').scrollTop=$('#source-editor').scrollTop;});
$('#source-editor').addEventListener('keydown',(event)=>{
  if (event.key === 'Tab') {
    event.preventDefault();
    const editor = event.target;
    editor.setRangeText('  ',editor.selectionStart,editor.selectionEnd,'end');
    updateLineNumbers();
  }
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {event.preventDefault();$('#analyze-source').click();}
});
$('#analyze-source').addEventListener('click', async () => {
  const xml = $('#source-editor').value;
  const filename = $('#source-filename').value.trim() || (state.editorTarget === 'before' ? 'baseline.xml' : state.editorTarget === 'after' ? 'candidate.xml' : 'config.xml');
  const matching = state.examples.find((item) => item.xml === xml && item.filename === filename);
  const target = state.editorTarget;
  const loaded = target === 'graph'
    ? await analyze(xml, filename, matching?.id)
    : await setComparisonSource(target, {xml, filename, origin: 'edited', exampleId: matching?.id || null});
  if (loaded) {
    $('#source-dialog').close();
    setView(target === 'graph' ? 'graph' : 'compare');
    toast(target === 'graph' ? state.report.analysis_complete ? 'Configuration analyzed.' : 'Analysis is incomplete. Review the findings.' : `${target === 'before' ? 'Baseline' : 'Candidate'} saved. The other revision is unchanged.`);
  } else toast('Could not save. Your XML is preserved in the editor.');
});
$('#upload-button').addEventListener('click',()=>$('#file-input').click());
$('#file-input').addEventListener('change',async(event)=>{
  const file = event.target.files[0];
  if (!file) return;
  if (file.size > 1024 * 1024) {showError('Choose a configuration smaller than 1 MiB.');event.target.value='';return;}
  try {const xml=await readXmlFile(file);await analyze(xml,file.name);setView('graph');}
  catch(error) {showError(error.message || 'The configuration file could not be read.');}
  event.target.value='';
});
$('#run-compare').addEventListener('click', compare);
['before', 'after'].forEach((slot) => {
  $(`#compare-${slot}`).addEventListener('change', async (event) => {
    const id = event.target.value;
    if (id === '__custom' || !id) return;
    const source = id === '__active'
      ? {xml: state.xml, filename: state.filename, origin: 'snapshot', exampleId: null}
      : state.examples.find((example) => example.id === id);
    if (source) await setComparisonSource(slot, {...source, exampleId: id === '__active' ? null : id, origin: id === '__active' ? 'snapshot' : 'example'});
  });
  $(`[data-import-revision="${slot}"]`).addEventListener('click', () => $(`#revision-file-${slot}`).click());
  $(`[data-edit-revision="${slot}"]`).addEventListener('click', () => openSource(1, slot));
  $(`[data-inspect-revision="${slot}"]`).addEventListener('click', async () => {
    const source = state.compareSources[slot];
    if (source && await analyze(source.xml, source.filename, source.exampleId)) setView('graph');
  });
  $(`#revision-file-${slot}`).addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      if (file.size > 1024 * 1024) throw new Error('Choose XML smaller than 1 MiB.');
      await setComparisonSource(slot, {xml: await readXmlFile(file), filename: file.name, origin: 'imported', exampleId: null});
    } catch (error) { showError(error.message || 'The XML file could not be read.'); }
    finally { event.target.value = ''; }
  });
});
$('#swap-revisions').addEventListener('click', () => {
  [state.compareSources.before, state.compareSources.after] = [state.compareSources.after, state.compareSources.before];
  invalidateComparison('Revisions swapped. Run the comparison to review this direction of change.');
  populateCompareSelects();
});
$('#protected-search').addEventListener('input', renderProtectedServices);
$('#protected-services').addEventListener('change', (event) => {
  if (!event.target.matches('[data-protected]')) return;
  if (event.target.checked) state.protectedNames.add(event.target.value);
  else state.protectedNames.delete(event.target.value);
  $('#protected-count').textContent = `${state.protectedNames.size} selected`;
  $('#clear-protected').disabled = !state.protectedNames.size;
  invalidateComparison('Protected services changed. Run the comparison to evaluate these selections.');
});
$('#clear-protected').addEventListener('click', () => {
  state.protectedNames.clear();
  renderProtectedServices();
  invalidateComparison('Protected services changed. Run the comparison to evaluate these selections.');
});
$('#import-evidence').addEventListener('click', () => $('#evidence-file').click());
$('#check-evidence').addEventListener('click', checkEvidence);
$('#clear-evidence').addEventListener('click', () => {
  state.evidence.raw = null;
  state.evidence.filename = '';
  state.evidence.exampleId = null;
  state.evidence.error = '';
  resetEvidenceBinding();
  populateEvidenceExamples();
  updateExportButton();
});
$('#evidence-example').addEventListener('change', async (event) => {
  const example = state.evidence.examples.find((entry) => entry.id === event.target.value);
  if (example) {
    try { await importEvidence(example.evidence, example.filename || `${example.id}.json`, example.id); }
    catch (error) { state.evidence.error = error.message; renderEvidence(); }
  } else populateEvidenceExamples();
});
$('#evidence-file').addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  resetEvidenceBinding('A new recording was selected. No current binding check is available.');
  try {
    if (file.size > 2 * 1024 * 1024) throw new Error('Choose a recording JSON file smaller than 2 MiB.');
    let raw;
    try { raw = JSON.parse(await file.text()); }
    catch (_) { throw new Error('The recording file is not valid JSON. The previous imported file, if any, has been retained.'); }
    await importEvidence(raw, file.name);
  } catch (error) {
    state.evidence.error = error.message || 'The recording file could not be read.';
    renderEvidence();
  } finally { event.target.value = ''; }
});

$('#export-button').addEventListener('click',exportReport);

async function init() {
  renderInspector();
  renderEvidence();
  loadEvidenceExamples();
  busy(1);
  try {
    const result = await request('/api/examples');
    state.examples = Array.isArray(result) ? result : result.examples || [];
    if (!state.examples.length) {populateSourceSelect();populateCompareSelects();return;}
    const initial = state.examples.find((example)=>/risky|baseline|before/i.test(example.id)) || state.examples[0];
    populateSourceSelect(initial.id);
    populateCompareSelects();
    await analyze(initial.xml,initial.filename || `${initial.id}.xml`,initial.id);
    const baseline = state.examples.find((example) => example.id === 'native-revised') || state.examples.find((example) => /revised|fixed|before/i.test(example.id)) || initial;
    await setComparisonSource('before', {...baseline, exampleId: baseline.id, origin: 'example'});
    const candidate = state.examples.find((example) => example.id === 'native-risky') || state.examples.find((example) => /risky|after/i.test(example.id)) || state.examples[1] || initial;
    await setComparisonSource('after', {...candidate, exampleId: candidate.id, origin: 'example'});
  } catch(error) {
    $('#example-select').innerHTML = '<option value="">Import a configuration</option>';
    showError(`${error.message} Start the local host server, then refresh this page.`);
  } finally {busy(-1);}
}
const graphResizeObserver = new ResizeObserver(() => {
  if (state.report && state.view === 'graph' && state.graphLayout === 'auto' && effectiveGraphDirection() !== state.graphDirection) {
    renderGraph({reveal: true});
  }
});
graphResizeObserver.observe($('#graph-container'));
init();
