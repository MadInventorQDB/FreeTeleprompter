const params = new URLSearchParams(window.location.search);
const view = params.get('view') || 'operator';
const app = document.getElementById('app');
const channel = new BroadcastChannel('free-teleprompter');

const defaultState = {
  scriptId: 'default',
  scriptText: 'Welcome to FreeTeleprompter\n\nThis build supports operator and clean prompter output views.\n\nAdd your script on the left panel.\n\nUse space to pause and resume.',
  isPlaying: false,
  speed: 35,
  offset: 0,
  mirrorPrompter: true,
  mirrorOperator: false,
  fontFamily: 'Inter, system-ui, sans-serif',
  fontSize: 58,
  lineHeight: 1.5,
  paragraphSpacing: 0.7,
  sideMargin: 12,
  guideY: 50,
  guideHeight: 20,
  guideMode: 'band',
  bgColor: '#111111',
  textColor: '#ffffff',
  shadowEnabled: true,
  countdown: 3,
  leadInActive: false,
  cleanFeed: true,
  lastSyncedAt: '',
  googleDocUrl: '',
  syncError: '',
  wakeLockEnabled: false,
};

let state = hydrateState();
let raf = null;
let lastFrame = performance.now();

function hydrateState() {
  const global = readStorage('ft-global') || {};
  const scriptId = global.scriptId || 'default';
  const perScript = readStorage(`ft-script-${scriptId}`) || {};
  return { ...defaultState, ...global, ...perScript, scriptId };
}
function readStorage(key) {
  try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
}
function saveState() {
  localStorage.setItem('ft-global', JSON.stringify({
    scriptId: state.scriptId,
    offset: state.offset,
    speed: state.speed,
    isPlaying: state.isPlaying,
  }));
  localStorage.setItem(`ft-script-${state.scriptId}`, JSON.stringify({
    scriptText: state.scriptText,
    mirrorPrompter: state.mirrorPrompter,
    mirrorOperator: state.mirrorOperator,
    fontFamily: state.fontFamily,
    fontSize: state.fontSize,
    lineHeight: state.lineHeight,
    paragraphSpacing: state.paragraphSpacing,
    sideMargin: state.sideMargin,
    guideY: state.guideY,
    guideHeight: state.guideHeight,
    guideMode: state.guideMode,
    bgColor: state.bgColor,
    textColor: state.textColor,
    shadowEnabled: state.shadowEnabled,
    countdown: state.countdown,
    cleanFeed: state.cleanFeed,
    googleDocUrl: state.googleDocUrl,
    lastSyncedAt: state.lastSyncedAt,
  }));
}
function emit() {
  saveState();
  channel.postMessage({ type: 'state', payload: state });
}
channel.onmessage = (event) => {
  if (event.data?.type === 'state') {
    state = { ...state, ...event.data.payload };
    render();
  }
};
window.addEventListener('storage', () => {
  state = hydrateState();
  render();
});

function parseScript(text) {
  return text.split(/\n\n+/).map((paragraph) => paragraph.trim()).filter(Boolean);
}
function markerLines(text) {
  const lines = text.split('\n');
  const markers = [];
  lines.forEach((line, idx) => {
    if (/^#{1,3}\s/.test(line) || /^\[MARKER\]/i.test(line)) markers.push({ idx, line });
  });
  return markers;
}

function stageTemplate() {
  const paras = parseScript(state.scriptText)
    .map((p) => `<p>${escapeHTML(p)}</p>`)
    .join('');
  return `<div id="scriptStage" class="${shouldMirror() ? 'mirrored' : 'not-mirrored'}" style="--y:${state.offset}px">${paras}</div>`;
}
function shouldMirror() {
  return view === 'prompter' ? state.mirrorPrompter : state.mirrorOperator;
}
function applyVars(root = document.documentElement) {
  root.style.setProperty('--bg', state.bgColor);
  root.style.setProperty('--fg', state.textColor);
  root.style.setProperty('--font-size', `${state.fontSize}px`);
  root.style.setProperty('--line-height', String(state.lineHeight));
  root.style.setProperty('--paragraph-spacing', `${state.paragraphSpacing}em`);
  root.style.setProperty('--side-margin', `${state.sideMargin}vw`);
  root.style.setProperty('--guide-y', String(state.guideY));
  root.style.setProperty('--guide-height', String(state.guideHeight));
  root.style.setProperty('--font-family', state.fontFamily);
  root.style.setProperty('--shadow', state.shadowEnabled ? '0 2px 12px rgba(0,0,0,.65)' : 'none');
}

function prompterMarkup(showOverlay = true) {
  return `
    <section class="prompter-shell ${state.cleanFeed ? 'clean-feed' : ''}" id="prompterRoot">
      <div class="text-track">${stageTemplate()}</div>
      <div class="reading-guide ${state.guideMode === 'line' ? 'center-line' : ''}"></div>
      <div class="operator-overlay">
        <span>${state.isPlaying ? 'Playing' : 'Paused'} • ${state.speed.toFixed(1)} px/s</span>
        ${showOverlay ? '<span>F: fullscreen • M: mirror • Space: play/pause</span>' : ''}
      </div>
    </section>`;
}
function renderPrompter(showOverlay = true) {
  app.innerHTML = prompterMarkup(showOverlay);
  applyVars();
}

function renderOperator() {
  app.innerHTML = `
  <div class="layout">
    <aside class="operator-panel">
      <div class="section">
        <h3>Script</h3>
        <div class="row"><label>Script preset ID</label><input id="scriptId" type="text" value="${escapeHTML(state.scriptId)}" /></div>
        <textarea id="scriptInput">${escapeHTML(state.scriptText)}</textarea>
      </div>
      <div class="section">
        <h3>Playback</h3>
        <div class="row wrap">
          <button class="btn primary" id="startBtn">Start</button>
          <button class="btn" id="pauseBtn">Pause</button>
          <button class="btn" id="resumeBtn">Resume</button>
        </div>
        <div class="row"><label>Speed</label><input id="speed" type="range" min="5" max="220" step="1" value="${state.speed}" /><span class="badge" id="speedLabel">${state.speed.toFixed(0)} px/s</span></div>
        <div class="row wrap"><button class="btn" data-speed="-5">-5%</button><button class="btn" data-speed="-1">-1%</button><button class="btn" data-speed="1">+1%</button><button class="btn" data-speed="5">+5%</button></div>
        <div class="row"><label>Countdown (s)</label><input id="countdown" type="number" min="0" max="20" value="${state.countdown}" /></div>
      </div>
      <div class="section">
        <h3>Jump / Seek</h3>
        <div class="row wrap"><button class="btn" id="back10">Back 10 lines</button><button class="btn" id="markerPrev">Prev marker</button><button class="btn" id="markerNext">Next marker</button></div>
        <input id="seek" class="scrubber" type="range" min="-6000" max="200" step="1" value="${state.offset}" />
      </div>
      <div class="section">
        <h3>Typography + Contrast</h3>
        <div class="row"><label>Font</label><select id="fontFamily"><option ${sel('Inter, system-ui, sans-serif')}>Inter</option><option ${sel('Arial, sans-serif')}>Arial</option><option ${sel('Georgia, serif')}>Georgia</option><option ${sel('"Courier New", monospace')}>Courier</option></select></div>
        <div class="row"><label>Font size</label><input id="fontSize" type="range" min="24" max="160" value="${state.fontSize}" /></div>
        <div class="row"><label>Line spacing</label><input id="lineHeight" type="range" min="1" max="2.5" step="0.05" value="${state.lineHeight}" /></div>
        <div class="row"><label>Paragraph spacing</label><input id="paragraphSpacing" type="range" min="0" max="2" step="0.05" value="${state.paragraphSpacing}" /></div>
        <div class="row"><label>Background</label><input id="bgColor" type="color" value="${state.bgColor}" /></div>
        <div class="row"><label>Text</label><input id="textColor" type="color" value="${state.textColor}" /></div>
        <div class="row"><label>Shadow</label><input id="shadowEnabled" type="checkbox" ${state.shadowEnabled ? 'checked' : ''} /></div>
      </div>
      <div class="section">
        <h3>Framing + Guide</h3>
        <div class="row"><label>Side margins</label><input id="sideMargin" type="range" min="2" max="28" value="${state.sideMargin}" /></div>
        <div class="row"><label>Guide position</label><input id="guideY" type="range" min="10" max="90" value="${state.guideY}" /></div>
        <div class="row"><label>Guide height</label><input id="guideHeight" type="range" min="2" max="45" value="${state.guideHeight}" /></div>
        <div class="row"><label>Guide mode</label><select id="guideMode"><option ${state.guideMode === 'band' ? 'selected' : ''} value="band">Highlight band</option><option ${state.guideMode === 'line' ? 'selected' : ''} value="line">Center line</option></select></div>
      </div>
      <div class="section">
        <h3>Views + Displays</h3>
        <div class="row"><label>Prompter mirrored</label><input id="mirrorPrompter" type="checkbox" ${state.mirrorPrompter ? 'checked' : ''} /></div>
        <div class="row"><label>Operator mirrored</label><input id="mirrorOperator" type="checkbox" ${state.mirrorOperator ? 'checked' : ''} /></div>
        <div class="row"><label>Clean feed</label><input id="cleanFeed" type="checkbox" ${state.cleanFeed ? 'checked' : ''} /></div>
        <div class="row wrap"><button class="btn" id="openPrompter">Open Prompter Window</button><button class="btn" id="openRemote">Open Phone Remote</button></div>
      </div>
      <div class="section">
        <h3>Google Doc sync</h3>
        <div class="row"><label>Doc URL / ID</label><input id="googleDocUrl" type="text" value="${escapeHTML(state.googleDocUrl)}" /></div>
        <div class="row wrap"><button class="btn" id="linkDoc">Link Google Doc</button><button class="btn" id="refreshDoc">Refresh now</button></div>
        <div class="status">Last synced: ${state.lastSyncedAt || 'never'}</div>
        <div class="error">${escapeHTML(state.syncError || '')}</div>
        <div class="badge">Supports publish-to-web and export text endpoint for one-click updates.</div>
      </div>
      <div class="section">
        <h3>Rig reliability</h3>
        <div class="row wrap"><button class="btn" id="wakeLock">Toggle Wake Lock</button><span class="badge">${state.wakeLockEnabled ? 'Wake lock active' : 'Wake lock inactive'}</span></div>
        <div class="badge">Autosave and recovery are enabled in local storage.</div>
      </div>
    </aside>
    <section id="operatorPreview">${prompterMarkup(false)}</section>
  </div>`;

  bindOperatorEvents();
}
function sel(val) { return state.fontFamily === val ? 'selected' : ''; }

function bindOperatorEvents() {
  const map = {
    scriptInput: (e) => setState({ scriptText: e.target.value }),
    scriptId: (e) => {
      const scriptId = (e.target.value || 'default').trim();
      localStorage.setItem('ft-global', JSON.stringify({ ...readStorage('ft-global'), scriptId }));
      state = hydrateState();
      render();
      emit();
    },
    speed: (e) => setState({ speed: Number(e.target.value) }),
    countdown: (e) => setState({ countdown: Number(e.target.value) }),
    seek: (e) => setState({ offset: Number(e.target.value), isPlaying: false }),
    fontFamily: (e) => setState({ fontFamily: e.target.value }),
    fontSize: (e) => setState({ fontSize: Number(e.target.value) }),
    lineHeight: (e) => setState({ lineHeight: Number(e.target.value) }),
    paragraphSpacing: (e) => setState({ paragraphSpacing: Number(e.target.value) }),
    sideMargin: (e) => setState({ sideMargin: Number(e.target.value) }),
    guideY: (e) => setState({ guideY: Number(e.target.value) }),
    guideHeight: (e) => setState({ guideHeight: Number(e.target.value) }),
    guideMode: (e) => setState({ guideMode: e.target.value }),
    bgColor: (e) => setState({ bgColor: e.target.value }),
    textColor: (e) => setState({ textColor: e.target.value }),
    mirrorPrompter: (e) => setState({ mirrorPrompter: e.target.checked }),
    mirrorOperator: (e) => setState({ mirrorOperator: e.target.checked }),
    shadowEnabled: (e) => setState({ shadowEnabled: e.target.checked }),
    cleanFeed: (e) => setState({ cleanFeed: e.target.checked }),
    googleDocUrl: (e) => setState({ googleDocUrl: e.target.value }),
  };
  Object.entries(map).forEach(([id, fn]) => document.getElementById(id)?.addEventListener('input', fn));

  document.getElementById('startBtn').onclick = async () => {
    if (state.countdown > 0) {
      await runCountdown(state.countdown);
    }
    setState({ isPlaying: true });
  };
  document.getElementById('pauseBtn').onclick = () => setState({ isPlaying: false });
  document.getElementById('resumeBtn').onclick = () => setState({ isPlaying: true });
  document.querySelectorAll('[data-speed]').forEach((btn) => {
    btn.onclick = () => {
      const delta = Number(btn.dataset.speed);
      const speed = Math.max(5, Math.min(260, state.speed * (1 + delta / 100)));
      setState({ speed });
    };
  });
  document.getElementById('openPrompter').onclick = () => window.open(`${location.pathname}?view=prompter`, 'prompterWindow');
  document.getElementById('openRemote').onclick = () => window.open(`${location.pathname}?view=remote`, 'remoteWindow');
  document.getElementById('back10').onclick = () => jumpLines(10);
  document.getElementById('markerPrev').onclick = () => jumpMarker(-1);
  document.getElementById('markerNext').onclick = () => jumpMarker(1);
  document.getElementById('linkDoc').onclick = () => linkGoogleDoc();
  document.getElementById('refreshDoc').onclick = () => refreshGoogleDoc();
  document.getElementById('wakeLock').onclick = () => toggleWakeLock();
}

function renderRemote() {
  app.innerHTML = `
    <section class="remote-layout">
      <h2>Phone Remote</h2>
      <p>Open this URL on a phone/tablet on the same network and control playback remotely.</p>
      <div class="section">
        <div class="row wrap"><button class="btn primary" id="rPlay">Play/Pause</button></div>
        <div class="row wrap"><button class="btn" id="rSlower">Slower (-5%)</button><button class="btn" id="rFaster">Faster (+5%)</button></div>
        <div class="row wrap"><button class="btn" id="rBack">Back 10 lines</button><button class="btn" id="rMarker">Next marker</button></div>
      </div>
    </section>`;
  document.getElementById('rPlay').onclick = () => setState({ isPlaying: !state.isPlaying });
  document.getElementById('rSlower').onclick = () => setState({ speed: Math.max(5, state.speed * 0.95) });
  document.getElementById('rFaster').onclick = () => setState({ speed: Math.min(260, state.speed * 1.05) });
  document.getElementById('rBack').onclick = () => jumpLines(10);
  document.getElementById('rMarker').onclick = () => jumpMarker(1);
}

function setState(next) {
  state = { ...state, ...next };
  emit();
  render();
}

function loop(now) {
  const dt = (now - lastFrame) / 1000;
  lastFrame = now;
  if (state.isPlaying) {
    state.offset -= state.speed * dt;
    applyOffset();
    saveState();
    channel.postMessage({ type: 'state', payload: { offset: state.offset, isPlaying: state.isPlaying, speed: state.speed } });
  }
  raf = requestAnimationFrame(loop);
}
function applyOffset() {
  const stage = document.getElementById('scriptStage');
  if (!stage) return;
  stage.style.setProperty('--y', `${state.offset}px`);
}

function jumpLines(count) {
  const estLinePx = state.fontSize * state.lineHeight;
  setState({ offset: state.offset + (count * estLinePx) });
}
function jumpMarker(dir) {
  const lines = state.scriptText.split('\n');
  const markers = markerLines(state.scriptText);
  if (!markers.length) return;
  const estLinePx = state.fontSize * state.lineHeight;
  const currentLine = Math.abs(state.offset) / estLinePx;
  const sorted = markers.map((m) => m.idx).sort((a, b) => a - b);
  let target = sorted[0];
  if (dir > 0) {
    target = sorted.find((ln) => ln > currentLine + 1) ?? sorted[sorted.length - 1];
  } else {
    target = [...sorted].reverse().find((ln) => ln < currentLine - 1) ?? sorted[0];
  }
  setState({ offset: -target * estLinePx });
}

function render() {
  if (view === 'operator') renderOperator();
  if (view === 'prompter') renderPrompter(true);
  if (view === 'remote') renderRemote();
  applyVars();
  applyOffset();
  const speedLabel = document.getElementById('speedLabel');
  if (speedLabel) speedLabel.textContent = `${state.speed.toFixed(0)} px/s`;
}

async function refreshGoogleDoc() {
  try {
    const id = extractDocId(state.googleDocUrl.trim());
    if (!id) throw new Error('Invalid Google Doc URL or ID.');
    const endpoint = `https://docs.google.com/document/d/${id}/export?format=txt`;
    const res = await fetch(endpoint);
    if (!res.ok) throw new Error(`Sync failed (${res.status}). Check sharing/permissions.`);
    const text = await res.text();
    setState({ scriptText: text, lastSyncedAt: new Date().toLocaleString(), syncError: '', googleDocUrl: id });
  } catch (error) {
    setState({ syncError: error.message || 'Unable to sync document.' });
  }
}
function linkGoogleDoc() {
  const id = extractDocId(state.googleDocUrl.trim());
  if (!id) {
    setState({ syncError: 'Enter a valid Google Docs URL or raw doc ID.' });
    return;
  }
  setState({ googleDocUrl: id, syncError: '' });
}
function extractDocId(input) {
  if (!input) return '';
  const direct = input.match(/^[a-zA-Z0-9-_]{20,}$/);
  if (direct) return input;
  const match = input.match(/\/document\/d\/([a-zA-Z0-9-_]+)/);
  return match?.[1] || '';
}

let lock;
async function toggleWakeLock() {
  if (!('wakeLock' in navigator)) {
    setState({ syncError: 'Wake Lock API unavailable in this browser.' });
    return;
  }
  if (lock) {
    await lock.release();
    lock = null;
    setState({ wakeLockEnabled: false, syncError: '' });
    return;
  }
  lock = await navigator.wakeLock.request('screen');
  setState({ wakeLockEnabled: true, syncError: '' });
}

async function runCountdown(seconds) {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;display:grid;place-items:center;background:rgba(0,0,0,.7);z-index:9999;font-size:9vw;';
  document.body.appendChild(overlay);
  for (let i = seconds; i > 0; i -= 1) {
    overlay.textContent = String(i);
    // eslint-disable-next-line no-await-in-loop
    await new Promise((res) => setTimeout(res, 1000));
  }
  overlay.remove();
}

window.addEventListener('keydown', (event) => {
  if (event.target.matches('textarea,input')) return;
  if (event.code === 'Space') { event.preventDefault(); setState({ isPlaying: !state.isPlaying }); }
  if (event.key === 'ArrowUp') setState({ speed: Math.min(260, state.speed * 1.02) });
  if (event.key === 'ArrowDown') setState({ speed: Math.max(5, state.speed * 0.98) });
  if (event.key === 'ArrowLeft') jumpLines(2);
  if (event.key === 'ArrowRight') jumpLines(-2);
  if (event.key.toLowerCase() === 'm') {
    const key = view === 'prompter' ? 'mirrorPrompter' : 'mirrorOperator';
    setState({ [key]: !state[key] });
  }
  if (event.key.toLowerCase() === 'f') document.documentElement.requestFullscreen?.();
});

function escapeHTML(str) {
  return str
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

render();
raf = requestAnimationFrame(loop);
window.addEventListener('beforeunload', () => cancelAnimationFrame(raf));
