'use strict';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const state = {examples:[], report:null, xml:'', filename:'config.xml', selected:null, mode:'recovery', filter:'all', view:'graph', comparison:null, busy:0, graphLayout:'auto', graphDirection:null, graphFingerprint:null};
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
  ['#analyze-source', '#run-compare', '#example-select', '#upload-button', '#compare-before', '#compare-after'].forEach((id) => { $(id).disabled = state.busy > 0; });
  $('#analyze-source').textContent = state.busy ? 'Analyzing…' : 'Analyze configuration ↗';
  $('#run-compare').textContent = state.busy ? 'Working…' : 'Compare revisions';
  updateExportButton();
}

async function request(url, payload) {
  const response = await fetch(url, payload === undefined ? {} : {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)});
  let result;
  try { result = await response.json(); }
  catch (_) { throw new Error('The host did not return a valid report. Check that the BootWeave server is running.'); }
  if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : result.error?.message || result.message || `The host returned HTTP ${response.status}.`);
  return result;
}

function setView(view) {
  state.view = view;
  $('#graph-view').hidden = view !== 'graph';
  $('#compare-view').hidden = view !== 'compare';
  $('#breadcrumb-current').textContent = view === 'graph' ? 'Configuration review' : 'Change review';
  $('#page-title').textContent = view === 'graph' ? 'Configuration review' : 'Change review';
  $('#page-subtitle').textContent = view === 'graph' ? 'Inspect startup dependencies and recovery coupling in QNX SLM XML.' : 'Compare configuration changes before deployment.';
  $$('.nav-item').forEach((button) => { button.classList.toggle('active', button.dataset.view === view); });
  updateExportButton();
}

function updateExportButton() {
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
  const beforeValue = $('#compare-before').value;
  const afterValue = $('#compare-after').value;
  ['#compare-before', '#compare-after'].forEach((id) => {
    const select = $(id);
    select.replaceChildren();
    state.examples.forEach((example) => {
      const option = document.createElement('option');
      option.value = example.id;
      option.textContent = example.name || example.filename;
      select.append(option);
    });
    if (state.xml) {
      const option = document.createElement('option');
      option.value = '__current';
      option.textContent = `Current: ${state.filename}`;
      select.append(option);
    }
  });
  const preferredBefore = state.examples.find((item) => /risky|baseline|before/i.test(item.id))?.id || state.examples[0]?.id || '__current';
  const preferredAfter = state.examples.find((item) => /revised|fixed|after/i.test(item.id))?.id || state.examples[1]?.id || '__current';
  $('#compare-before').value = beforeValue && [...$('#compare-before').options].some((option) => option.value === beforeValue) ? beforeValue : preferredBefore;
  $('#compare-after').value = afterValue && [...$('#compare-after').options].some((option) => option.value === afterValue) ? afterValue : preferredAfter;
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
    if (!report.components.some((component) => component.name === state.selected)) {
      const root = report.components.find((component) => component.dependencies?.length === 0);
      state.selected = report.components.find((component)=>component.name === 'dashboard')?.name || root?.name || report.components[0]?.name || null;
    }
    populateSourceSelect(exampleId);
    populateCompareSelects();
    invalidateComparison('The active configuration has changed. Compare the selected revisions to generate a fresh review.');
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
  $('#source-context').innerHTML = example ? `<span class="source-context-label">Authored example</span><span>${escapeHtml(description)} Illustrative service binaries; no target run.</span>` : '<span class="source-context-label">Imported source</span><span>Static review of your XML. No target process has been executed.</span>';
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

function openSource(line = 1) {
  $('#editor-error').hidden = true;
  $('#source-filename').value = state.filename;
  $('#source-editor').value = state.xml;
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

function comparisonSource(id) {
  if (id === '__current') return {xml:state.xml, filename:state.filename, name:state.filename};
  return state.examples.find((example)=>example.id === id);
}

async function compare() {
  const before = comparisonSource($('#compare-before').value);
  const after = comparisonSource($('#compare-after').value);
  if (!before || !after) { toast('Choose two configurations to compare.'); return; }
  invalidateComparison('Comparing the selected revisions…');
  busy(1);
  showError('');
  try {
    const result = await request('/api/compare',{before:before.xml,after:after.xml,before_name:before.filename || before.name,after_name:after.filename || after.name});
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

function renderComparison(result) {
  const changes = result.changes;
  const addedComponents = changes.added_components || [], removedComponents = changes.removed_components || [], changedComponents = changes.changed_components || [];
  const addedEdges = changes.added_edges || [], removedEdges = changes.removed_edges || [], resolved = changes.resolved_findings || [], newFindings = changes.new_findings || [];
  const edgeChangeCount = addedEdges.length + removedEdges.length;
  const stats = [
    {value:changedComponents.length + addedComponents.length + removedComponents.length, label:'services changed'},
    {value:edgeChangeCount,label:'relationship changes'},
    {value:resolved.length,label:'findings resolved'},
    {value:newFindings.length,label:'new findings',adverse:newFindings.length > 0}
  ];
  const edgeRow = (edge,added) => `<div class="change-row ${added?'added':'removed'}"><span class="sign">${added?'+':'−'}</span><div><code>${escapeHtml(edge.source)} → ${escapeHtml(edge.target)}</code><p><span class="change-state">${escapeHtml(edge.state || 'unspecified')}</span> · ${added?'Added':'Removed'} dependency</p></div></div>`;
  const findingRow = (finding,added) => `<div class="change-row ${added?'removed':'added'}"><span class="sign">${added?'!':'✓'}</span><div><code>${escapeHtml(finding.title || finding.id || finding)}</code><p>${escapeHtml(finding.component || 'Configuration')} · ${escapeHtml(finding.severity || 'finding')}${finding.line ? ` · line ${escapeHtml(finding.line)}`:''}</p></div></div>`;
  const componentRow = (item,kind) => `<div class="change-row ${kind==='removed'?'removed':'added'}"><span class="sign">${kind==='added'?'+':kind==='removed'?'−':'~'}</span><div><code>${escapeHtml(componentName(item))}</code><p>${kind === 'changed' ? 'Component properties changed' : kind === 'added' ? 'Service added' : 'Service removed'}</p></div></div>`;
  const allServiceRows = [...addedComponents.map((item)=>componentRow(item,'added')),...removedComponents.map((item)=>componentRow(item,'removed')),...changedComponents.map((item)=>componentRow(item,'changed'))];
  const hasIncomplete = !result.before.analysis_complete || !result.after.analysis_complete || !result.before.summary?.valid_graph || !result.after.summary?.valid_graph;
  const impactChanges = calculateImpactChanges(result.before,result.after);
  $('#compare-results').innerHTML = `${hasIncomplete ? '<div class="comparison-warning">One or both configurations have errors or unsupported syntax. This comparison does not establish a valid deployment configuration.</div>':''}<div class="compare-summary">${stats.map((stat)=>`<div class="compare-stat ${stat.adverse?'adverse':''}"><strong>${stat.value}</strong><span>${stat.label}</span></div>`).join('')}</div><div class="change-grid"><section class="panel change-section"><div class="panel-heading"><h2>Dependency changes <span class="subtle-count">${edgeChangeCount}</span></h2></div><div class="change-list">${edgeChangeCount ? removedEdges.map((edge)=>edgeRow(edge,false)).join('') + addedEdges.map((edge)=>edgeRow(edge,true)).join('') : '<div class="change-empty">No dependency changes.</div>'}</div></section><section class="panel change-section"><div class="panel-heading"><h2>Recovery coupling changes <span class="subtle-count">${impactChanges.length}</span></h2></div><div class="change-list">${hasIncomplete ? '<div class="change-empty">Unavailable for an invalid or incomplete graph.</div>' : impactChanges.length ? impactChanges.map((change)=>`<div class="change-row"><span class="sign">↳</span><div><code>${escapeHtml(change.name)}</code><p>${change.before} → ${change.after} explicitly coupled services${change.added.length?` · added ${escapeHtml(change.added.join(', '))}`:''}${change.removed.length?` · removed ${escapeHtml(change.removed.join(', '))}`:''}</p></div></div>`).join('') : '<div class="change-empty">No explicit session coupling changed.</div>'}</div></section><section class="panel change-section"><div class="panel-heading"><h2>Service changes <span class="subtle-count">${allServiceRows.length}</span></h2></div><div class="change-list">${allServiceRows.length ? allServiceRows.join('') : '<div class="change-empty">No service properties changed.</div>'}</div></section><section class="panel change-section"><div class="panel-heading"><h2>Finding changes <span class="subtle-count">${resolved.length+newFindings.length}</span></h2></div><div class="change-list">${resolved.length+newFindings.length ? resolved.map((finding)=>findingRow(finding,false)).join('')+newFindings.map((finding)=>findingRow(finding,true)).join('') : '<div class="change-empty">No findings added or resolved.</div>'}</div></section></div><p class="compare-source-note">Compared ${escapeHtml(result.before.source?.name || 'before.xml')} (${escapeHtml(result.before.source?.sha256?.slice(0,10)||'no fingerprint')}) → ${escapeHtml(result.after.source?.name || 'after.xml')} (${escapeHtml(result.after.source?.sha256?.slice(0,10)||'no fingerprint')}). Coupling changes describe static reachability over explicit session edges, not measured recovery behavior.</p>`;

  const possibleChanges = calculateImpactChanges(result.before,result.after,'possible');
  const possiblePaths = changes.new_possible_couplings || [];
  if (possibleChanges.length || possiblePaths.length) {
    const rows = possibleChanges.map((change) => {
      const paths = possiblePaths.filter((entry)=>entry.source === change.name && change.added.includes(entry.target));
      return `<div class="change-row uncertain"><span class="sign">?</span><div><code>${escapeHtml(change.name)}</code><p>${change.before} → ${change.after} possibly coupled services${change.added.length ? ` · added ${escapeHtml(change.added.join(', '))}` : ''}${change.removed.length ? ` · removed ${escapeHtml(change.removed.join(', '))}` : ''}</p>${paths.map((entry)=>`<p>Possible path: <code>${escapeHtml((entry.path || [entry.source,entry.target]).join(' → '))}</code></p>`).join('')}</div></div>`;
    }).join('');
    $('#compare-results .change-grid').insertAdjacentHTML('beforeend',`<section class="panel change-section"><div class="panel-heading"><h2>Possible coupling changes <span class="subtle-count">${possibleChanges.length}</span></h2></div><div class="change-list">${hasIncomplete ? '<div class="change-empty">Unavailable for an invalid or incomplete graph.</div>' : rows}<p class="compare-source-note">These paths cross an unspecified dependency state. A change in uncertainty is not proof of safer recovery; verify the intended contract on QNX.</p></div></section>`);
  }
}

function calculateImpactChanges(before,after,key = 'coupled') {
  const names = [...new Set([...Object.keys(before.impacts || {}),...Object.keys(after.impacts || {})])].sort();
  return names.map((name)=>{
    const oldCoupled = before.impacts?.[name]?.[key] || [], newCoupled = after.impacts?.[name]?.[key] || [];
    return {name,before:oldCoupled.length,after:newCoupled.length,added:newCoupled.filter((item)=>!oldCoupled.includes(item)),removed:oldCoupled.filter((item)=>!newCoupled.includes(item))};
  }).filter((change)=>change.added.length || change.removed.length);
}

function exportReport() {
  const report = state.view === 'compare' ? state.comparison : state.report;
  if (!report) return;
  const blob = new Blob([JSON.stringify(report,null,2)+'\n'],{type:'application/json'});
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = state.view === 'compare' && state.comparison ? 'bootweave-comparison.json' : `${state.filename.replace(/\.xml$/i,'')}-report.json`;
  anchor.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  toast('Report exported with source fingerprint.');
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
$('#analyze-source').addEventListener('click',async()=>{
  const xml = $('#source-editor').value;
  const filename = $('#source-filename').value.trim() || 'config.xml';
  const matching = state.examples.find((item)=>item.xml===xml && item.filename===filename);
  const loaded = await analyze(xml,filename,matching?.id);
  if (loaded) {$('#source-dialog').close();setView('graph');toast(state.report.analysis_complete ? 'Configuration analyzed.' : 'Analysis is incomplete. Review the findings.');}
  else toast('Analysis failed. Your source is preserved in the editor.');
});
$('#upload-button').addEventListener('click',()=>$('#file-input').click());
$('#file-input').addEventListener('change',async(event)=>{
  const file = event.target.files[0];
  if (!file) return;
  if (file.size > 1024 * 1024) {showError('Choose a configuration smaller than 1 MiB.');event.target.value='';return;}
  try {const xml=await file.text();await analyze(xml,file.name);setView('graph');}
  catch(error) {showError(error.message || 'The configuration file could not be read.');}
  event.target.value='';
});
$('#run-compare').addEventListener('click',compare);
$('#compare-before').addEventListener('change',()=>invalidateComparison('The selected revisions have changed. Run the comparison to see their differences.'));
$('#compare-after').addEventListener('change',()=>invalidateComparison('The selected revisions have changed. Run the comparison to see their differences.'));
$('#export-button').addEventListener('click',exportReport);

async function init() {
  renderInspector();
  busy(1);
  try {
    const result = await request('/api/examples');
    state.examples = Array.isArray(result) ? result : result.examples || [];
    if (!state.examples.length) {populateSourceSelect();populateCompareSelects();return;}
    const initial = state.examples.find((example)=>/risky|baseline|before/i.test(example.id)) || state.examples[0];
    populateSourceSelect(initial.id);
    populateCompareSelects();
    await analyze(initial.xml,initial.filename || `${initial.id}.xml`,initial.id);
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
