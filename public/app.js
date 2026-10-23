const PROTOCOL_VERSION = '2025-11-25';
const configuredBackend = String(window.ALEXA_RUNTIME_CONFIG?.backendOrigin ?? '').trim();
const pageBasePath = location.pathname.endsWith('/') ? location.pathname : `${location.pathname}/`;
const pageBase = new URL(pageBasePath, location.origin);
let backendBase = pageBase;
let backendConfigError = '';
if (configuredBackend) {
  try {
    const candidate = new URL(configuredBackend);
    const isLoopback = ['localhost', '127.0.0.1', '[::1]'].includes(candidate.hostname);
    if (candidate.username || candidate.password || candidate.pathname !== '/' || candidate.search || candidate.hash || (candidate.protocol !== 'https:' && !isLoopback)) throw new Error('Use an HTTPS origin with no path or credentials (HTTP is allowed only for localhost).');
    backendBase = new URL(`${candidate.origin}/`);
  } catch (error) { backendConfigError = error.message; }
}
function backendUrl(path) { return new URL(String(path).replace(/^\/+/, ''), backendBase).href; }
const DEMO_URL = backendUrl('/mcp/demo');
const officialSkills = [
  { id: 'create-mcp-app', url: './skills/create-mcp-app.md', source: 'MCP Extensions · create-mcp-app', description: 'This skill should be used when the user asks to create an MCP App, add a UI to an MCP tool, build an interactive MCP view, scaffold an MCP App, or needs guidance on MCP Apps SDK patterns, UI-resource registration, lifecycle, or host integration.' },
  { id: 'migrate-oai-app', url: './skills/migrate-oai-app.md', source: 'MCP Extensions · migrate-oai-app', description: 'This skill should be used when the user asks to migrate from the OpenAI Apps SDK, convert an OpenAI App to MCP, port from window.openai or skybridge, or needs guidance on mapping an OpenAI Apps SDK application to MCP Apps.' },
  { id: 'add-app-to-server', url: './skills/add-app-to-server.md', source: 'MCP Extensions · add-app-to-server', description: 'This skill should be used when the user asks to add an app, UI, view or interactive MCP Apps capability to an existing MCP server that already has tools.' },
  { id: 'convert-web-app', url: './skills/convert-web-app.md', source: 'MCP Extensions · convert-web-app', description: 'This skill should be used when the user asks to add MCP App support to an existing web app while keeping it working standalone, or needs guidance on creating a hybrid web and MCP App.' },
];
const state = {
  servers: [], activeServerId: null, events: [], messages: [], skills: [], currentCapability: 'tools',
  activeView: 'conversation', pendingAction: null, agentTask: null, autoApprove: false, busy: false,
};
let nextRequestId = 1;
let toastTimer;
let voiceOutputEnabled = false;
let speechRecognition = null;
const $ = selector => document.querySelector(selector);
const els = {
  serverList: $('#server-list'), serverCount: $('#server-count'), activeName: $('#active-server-name'), activeIndicator: $('#active-indicator'),
  conversation: $('#conversation-view'), conversationLog: $('#conversation-log'), welcome: $('#welcome'), chatForm: $('#chat-form'), chatInput: $('#chat-input'),
  sendButton: $('#send-button'), voiceInput: $('#voice-input'), voiceOutput: $('#voice-output'), voiceStatus: $('#voice-status'), plannerStatus: $('#planner-status'),
  pendingArea: $('#pending-area'), eventList: $('#event-list'), transportLed: $('#transport-led'), transportLabel: $('#transport-label'),
  inspector: $('#inspector-panel'), connectDialog: $('#connect-dialog'), connectForm: $('#connect-form'), connectError: $('#connect-error'), connectSubmit: $('#connect-submit'),
  capabilities: $('#capabilities-view'), capabilityList: $('#capability-list'), skillsView: $('#skills-view'), skillsLibrary: $('#skill-library'),
  skillDialog: $('#skill-dialog'), skillSourceInput: $('#skill-source-input'), toast: $('#toast'),
};

function activeServer() { return state.servers.find(server => server.id === state.activeServerId) ?? null; }
function shortTime(date = new Date()) { return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(date); }
function showToast(message) {
  els.toast.textContent = String(message);
  els.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove('show'), 2600);
}
function setTransport(status, label) {
  els.transportLed.className = `transport-led${status === 'connected' ? ' active' : status === 'error' ? ' error' : ''}`;
  els.transportLabel.textContent = label;
  els.activeIndicator.className = `status-dot${status === 'connected' ? ' connected' : status === 'error' ? ' error' : ''}`;
}
function stringifySafe(value) {
  try { return JSON.stringify(value, null, 2); } catch { return String(value); }
}
function recordEvent(event) {
  state.events.unshift({ at: new Date(), ...event });
  if (state.events.length > 120) state.events.length = 120;
  renderEvents();
}

function renderServers() {
  els.serverList.replaceChildren();
  for (const server of state.servers) {
    const button = document.createElement('button');
    button.className = `server-item${server.id === state.activeServerId ? ' is-active' : ''}`;
    button.type = 'button';
    button.setAttribute('aria-label', `${server.name}, ${server.status}`);
    const led = document.createElement('span'); led.className = `server-led ${server.status}`;
    const copy = document.createElement('span'); copy.className = 'server-copy';
    const name = document.createElement('strong'); name.textContent = server.name;
    const status = document.createElement('small'); status.textContent = server.status === 'connected' ? `${server.capabilities?.tools?.length ?? 0} tools` : server.status;
    copy.append(name, status); button.append(led, copy);
    if (server.id !== 'demo') {
      const close = document.createElement('span'); close.className = 'server-more'; close.textContent = '×'; close.title = 'Disconnect this server';
      close.addEventListener('click', event => { event.stopPropagation(); disconnectServer(server); });
      button.append(close);
    }
    button.addEventListener('click', () => { state.activeServerId = server.id; renderAll(); if (state.activeView === 'capabilities') renderCapabilities(); if (server.status === 'error') void connectServer(server); });
    els.serverList.append(button);
  }
  els.serverCount.textContent = String(state.servers.length);
  const active = activeServer();
  els.activeName.textContent = active ? active.name : 'No connected server';
  setTransport(active?.status ?? 'idle', active ? (active.status === 'connected' ? `${active.serverInfo?.name ?? active.name} · session active` : active.status === 'error' ? 'Connection needs attention' : active.status) : 'No active MCP connection');
}

function renderEvents() {
  els.eventList.replaceChildren();
  if (!state.events.length) {
    const empty = document.createElement('p'); empty.className = 'empty-events'; empty.textContent = 'Protocol traffic will appear here as you connect and use MCP tools.'; els.eventList.append(empty); return;
  }
  for (const event of state.events) {
    const row = document.createElement('article'); row.className = 'event-entry';
    const line = document.createElement('div'); line.className = 'event-line';
    const dir = document.createElement('span'); dir.className = `event-direction ${event.direction === 'in' ? 'in' : event.direction === 'error' ? 'error' : ''}`; dir.textContent = event.direction === 'in' ? '↓' : event.direction === 'error' ? '!' : '↑';
    const method = document.createElement('span'); method.className = 'event-method'; method.textContent = event.method ?? event.label ?? 'transport';
    const time = document.createElement('span'); time.className = 'event-time'; time.textContent = event.at.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    line.append(dir, method, time); row.append(line);
    const meta = document.createElement('div'); meta.className = 'event-meta';
    if (event.status) meta.append(document.createTextNode(`HTTP ${event.status}`));
    if (event.elapsed != null) meta.append(document.createTextNode(`${event.elapsed} ms`));
    if (event.id != null) meta.append(document.createTextNode(`id ${event.id}`));
    if (event.sessionId) meta.append(document.createTextNode(`session ${event.sessionId.slice(0, 8)}…`));
    if (meta.childNodes.length) row.append(meta);
    if (event.payload !== undefined || event.error) {
      const details = document.createElement('details'); details.className = 'event-detail';
      const summary = document.createElement('summary'); summary.textContent = event.error ? 'View error details' : 'View JSON payload';
      const pre = document.createElement('pre'); pre.textContent = event.error ?? stringifySafe(event.payload);
      details.append(summary, pre); row.append(details);
    }
    els.eventList.append(row);
  }
}

function addMessage(role, text, meta = {}) {
  const message = { role, text: String(text ?? ''), meta, at: new Date() };
  state.messages.push(message);
  els.welcome.hidden = true;
  const row = document.createElement('article'); row.className = `message-row ${role}`;
  const avatar = document.createElement('span'); avatar.className = 'message-avatar'; avatar.setAttribute('aria-hidden', 'true'); avatar.textContent = role === 'user' ? '●' : '✳';
  const bubble = document.createElement('div'); bubble.className = 'message-bubble';
  const time = document.createElement('div'); time.className = 'message-meta'; time.textContent = role === 'user' ? `You · ${shortTime(message.at)}` : `Alexa+ · ${shortTime(message.at)}`;
  const content = document.createElement('div'); content.textContent = message.text;
  bubble.append(time, content);
  if (meta.toolName) { const tag = document.createElement('span'); tag.className = 'message-tool-label'; const led = document.createElement('span'); led.className = 'mini-led'; tag.append(led, document.createTextNode(`MCP tool · ${meta.toolName}`)); bubble.append(tag); }
  if (role === 'assistant' && ('speechSynthesis' in window) && typeof SpeechSynthesisUtterance !== 'undefined') {
    const speak = document.createElement('button'); speak.type = 'button'; speak.className = 'speak-message'; speak.textContent = '♫'; speak.title = 'Read this reply aloud'; speak.setAttribute('aria-label', 'Read this reply aloud');
    speak.addEventListener('click', () => speakText(message.text)); bubble.append(speak);
  }
  row.append(avatar, bubble); els.conversationLog.append(row); els.conversationLog.scrollTop = els.conversationLog.scrollHeight;
  if (role === 'assistant' && voiceOutputEnabled) queueMicrotask(() => speakText(message.text));
  return row;
}
function addTyping(label = 'Checking the connected server') {
  const row = document.createElement('article'); row.className = 'message-row assistant typing-row';
  const avatar = document.createElement('span'); avatar.className = 'message-avatar'; avatar.textContent = '✳'; avatar.setAttribute('aria-hidden', 'true');
  const typing = document.createElement('div'); typing.className = 'assistant-typing';
  const text = document.createElement('span'); text.textContent = label;
  const dots = document.createElement('span'); dots.className = 'typing-dots'; for (let i = 0; i < 3; i++) dots.append(document.createElement('i'));
  typing.append(text, dots); row.append(avatar, typing); els.conversationLog.append(row); els.conversationLog.scrollTop = els.conversationLog.scrollHeight; return row;
}

function headersFor(server, { initialize = false, accept = 'application/json, text/event-stream' } = {}) {
  const headers = { Accept: accept };
  if (accept.includes('application/json')) headers['Content-Type'] = 'application/json';
  if (server.token) headers.Authorization = `Bearer ${server.token}`;
  if (!initialize && server.sessionId) {
    headers['MCP-Session-Id'] = server.sessionId;
    if (server.protocolVersion) headers['MCP-Protocol-Version'] = server.protocolVersion;
  }
  return headers;
}
function requestEndpoint(server) { return server.url; }
function processServerMessage(server, message) {
  if (message?.method === 'notifications/progress') {
    const detail = message.params?.message || `Progress ${message.params?.progress ?? ''}${message.params?.total ? ` / ${message.params.total}` : ''}`;
    recordEvent({ direction: 'in', method: message.method, id: message.id, sessionId: server.sessionId, payload: message.params });
    const typing = document.querySelector('.typing-row .assistant-typing > span:first-child');
    if (typing) typing.textContent = `MCP server · ${detail}`;
  } else if (message?.method) {
    recordEvent({ direction: 'in', method: message.method, id: message.id, sessionId: server.sessionId, payload: message.params });
  }
}
function parseSseEvents(raw) {
  const events = [];
  const normalized = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  for (const block of normalized.split('\n\n')) {
    if (!block.trim()) continue;
    let id = null; let event = 'message'; let retry = null; const data = [];
    for (const line of block.split('\n')) {
      if (!line || line.startsWith(':')) continue;
      const colon = line.indexOf(':');
      const field = colon < 0 ? line : line.slice(0, colon);
      let value = colon < 0 ? '' : line.slice(colon + 1);
      if (value.startsWith(' ')) value = value.slice(1);
      if (field === 'id') id = value;
      else if (field === 'event') event = value;
      else if (field === 'retry' && /^\d+$/.test(value)) retry = Number(value);
      else if (field === 'data') data.push(value);
    }
    events.push({ id, event, data: data.join('\n'), retry });
  }
  return events;
}
async function consumeSseResponse(response, server, expectedId, { allowResume = true } = {}) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('The server opened an SSE response without a readable body.');
  const decoder = new TextDecoder(); let buffer = ''; let found = null; let streamFailure = null;
  const dispatch = block => {
    const parsed = parseSseEvents(`${block}\n\n`)[0];
    if (!parsed) return;
    if (parsed.id) server.lastEventId = parsed.id;
    if (parsed.retry != null) server.retryDelay = parsed.retry;
    if (!parsed.data) return;
    let message;
    try { message = JSON.parse(parsed.data); } catch { throw new Error('The server sent an SSE event whose data was not JSON-RPC JSON.'); }
    if (message.id === expectedId && (message.result !== undefined || message.error !== undefined)) found = message;
    else processServerMessage(server, message);
  };
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
      let boundary;
      while ((boundary = buffer.search(/\r?\n\r?\n/)) >= 0) {
        const block = buffer.slice(0, boundary);
        const match = buffer.slice(boundary).match(/^\r?\n\r?\n/);
        buffer = buffer.slice(boundary + (match?.[0].length ?? 2));
        dispatch(block);
      }
      if (done) break;
    }
    if (buffer.trim()) dispatch(buffer);
  } catch (error) {
    streamFailure = error;
  } finally { reader.releaseLock(); }
  if (found) return found;
  if (allowResume && server.lastEventId && server.sessionId) {
    recordEvent({ direction: 'system', label: 'SSE stream ended before its response; attempting event replay with GET', sessionId: server.sessionId, payload: { lastEventId: server.lastEventId } });
    const retryDelay = Number.isFinite(server.retryDelay) ? server.retryDelay : 1000;
    if (retryDelay > 0) await new Promise(resolve => setTimeout(resolve, retryDelay));
    try {
      const resumed = await fetch(requestEndpoint(server), {
        method: 'GET', headers: { ...headersFor(server, { accept: 'text/event-stream' }), 'Last-Event-ID': server.lastEventId },
        signal: AbortSignal.timeout(15000),
      });
      recordEvent({ direction: 'in', method: 'GET · resume', status: resumed.status, sessionId: server.sessionId, payload: { lastEventId: server.lastEventId } });
      if (resumed.status === 200 && (resumed.headers.get('content-type') ?? '').includes('text/event-stream')) return consumeSseResponse(resumed, server, expectedId, { allowResume: false });
      if (resumed.status === 405) streamFailure = new Error('The server does not offer GET streams for event replay (HTTP 405).');
      else streamFailure = new Error(`The server could not replay the interrupted stream (HTTP ${resumed.status}).`);
    } catch (error) { streamFailure = error; }
  }
  throw new Error(`The Streamable HTTP response ended without the matching JSON-RPC response.${streamFailure ? ` ${streamFailure.message}` : ''} The inspector has the last SSE event ID; reconnect and retry if needed.`);
}
async function parseRpcResponse(response, server, expectedId, method) {
  const session = response.headers.get('MCP-Session-Id');
  if (session) server.sessionId = session;
  const protocol = response.headers.get('MCP-Protocol-Version');
  if (protocol) server.protocolVersion = protocol;
  const type = (response.headers.get('content-type') ?? '').toLowerCase();
  if (type.includes('text/event-stream')) return consumeSseResponse(response, server, expectedId);
  const body = await response.text();
  if (!body.trim()) {
    if (response.status === 202) return null;
    throw new Error(`The MCP server returned an empty response to ${method} (HTTP ${response.status}).`);
  }
  let rpc;
  try { rpc = JSON.parse(body); } catch { throw new Error(`Expected application/json or text/event-stream from ${method}; received ${type || 'an unknown content type'}.`); }
  if (!response.ok) throw new Error(rpc.error?.message ?? rpc.message ?? `MCP request failed with HTTP ${response.status}.`);
  if (rpc.id !== expectedId && rpc.id != null) throw new Error(`The server replied with JSON-RPC id ${rpc.id}, not ${expectedId}.`);
  recordEvent({ direction: 'in', method, id: rpc.id, status: response.status, sessionId: server.sessionId, payload: rpc });
  return rpc;
}
async function initSession(server) {
  server.status = 'connecting'; renderServers();
  const id = nextRequestId++;
  const request = { jsonrpc: '2.0', id, method: 'initialize', params: { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: 'alexa-plus-web', title: 'Alexa+ MCP Assistant', version: '1.0.0' } } };
  const started = performance.now();
  recordEvent({ direction: 'out', method: 'initialize', id, endpoint: requestEndpoint(server), payload: request });
  let response;
  try {
    response = await fetch(requestEndpoint(server), { method: 'POST', headers: headersFor(server, { initialize: true }), body: JSON.stringify(request), signal: AbortSignal.timeout(30000) });
  } catch (error) {
    recordEvent({ direction: 'error', method: 'initialize', elapsed: Math.round(performance.now() - started), error: error.message });
    throw new Error(error.name === 'TimeoutError' ? 'Initialization timed out.' : 'Could not reach this MCP endpoint. Check the URL, HTTPS/mixed-content rules, CORS permissions and network availability.');
  }
  recordEvent({ direction: 'in', method: 'initialize · HTTP', status: response.status, elapsed: Math.round(performance.now() - started), sessionId: response.headers.get('MCP-Session-Id'), payload: { contentType: response.headers.get('content-type'), protocolVersion: response.headers.get('MCP-Protocol-Version') } });
  const rpc = await parseRpcResponse(response, server, id, 'initialize');
  if (!rpc || rpc.error) throw new Error(rpc?.error?.message ?? 'The server did not return an InitializeResult.');
  const result = rpc.result ?? {};
  if (!result.protocolVersion) throw new Error('The InitializeResult did not include protocolVersion.');
  server.protocolVersion = result.protocolVersion;
  server.serverInfo = result.serverInfo ?? {};
  server.serverCapabilities = result.capabilities ?? {};
  server.lastEventId = server.lastEventId ?? null;
  recordEvent({ direction: 'in', method: 'InitializeResult', id, sessionId: server.sessionId, payload: result });
  const notify = { jsonrpc: '2.0', method: 'notifications/initialized' };
  const notifyStart = performance.now();
  recordEvent({ direction: 'out', method: notify.method, sessionId: server.sessionId, payload: notify });
  const accepted = await fetch(requestEndpoint(server), { method: 'POST', headers: headersFor(server), body: JSON.stringify(notify), signal: AbortSignal.timeout(20000) });
  recordEvent({ direction: accepted.ok ? 'in' : 'error', method: notify.method, status: accepted.status, elapsed: Math.round(performance.now() - notifyStart), sessionId: server.sessionId, ...(accepted.ok ? {} : { error: `Initialized notification was not accepted (HTTP ${accepted.status}).` }) });
  if (accepted.status !== 202 && !accepted.ok) throw new Error(`Initialized notification was rejected (HTTP ${accepted.status}).`);
  return result;
}

async function requestRpc(server, method, params = undefined, { safeToReplay = false, recovered = false } = {}) {
  const id = nextRequestId++;
  const message = { jsonrpc: '2.0', id, method, ...(params === undefined ? {} : { params }) };
  const started = performance.now();
  recordEvent({ direction: 'out', method, id, sessionId: server.sessionId, payload: message });
  let response;
  try {
    response = await fetch(requestEndpoint(server), { method: 'POST', headers: headersFor(server), body: JSON.stringify(message), signal: AbortSignal.timeout(45000) });
  } catch (error) {
    recordEvent({ direction: 'error', method, id, elapsed: Math.round(performance.now() - started), error: error.name === 'TimeoutError' ? 'Request timed out.' : 'Browser fetch failed; check CORS, URL, HTTPS and network availability.' });
    throw new Error(error.name === 'TimeoutError' ? `${method} timed out.` : 'The browser could not fetch the MCP server. Check endpoint URL and CORS: allow this origin, POST, and the Accept, Content-Type, Authorization (if used), MCP-Session-Id and MCP-Protocol-Version headers.');
  }
  recordEvent({ direction: 'in', method: `${method} · HTTP`, status: response.status, elapsed: Math.round(performance.now() - started), sessionId: response.headers.get('MCP-Session-Id') ?? server.sessionId, payload: { contentType: response.headers.get('content-type'), lastEventId: server.lastEventId } });
  if (response.status === 404 && server.sessionId && !recovered) {
    const previousSession = server.sessionId;
    server.sessionId = null; server.lastEventId = null; server.status = 'connecting'; renderServers();
    recordEvent({ direction: 'system', label: 'Session expired with HTTP 404; starting a fresh MCP session', sessionId: previousSession });
    await initSession(server);
    server.status = 'connected'; renderServers();
    if (!safeToReplay) throw new Error('The MCP session expired. A new session is active, but this tool call was not replayed because it may have had side effects. Review and try it again.');
    return requestRpc(server, method, params, { safeToReplay: false, recovered: true });
  }
  try {
    const rpc = await parseRpcResponse(response, server, id, method);
    if (rpc?.error) throw new Error(`${rpc.error.message ?? 'MCP error'} (JSON-RPC ${rpc.error.code ?? 'error'}).`);
    recordEvent({ direction: 'in', method, id, elapsed: Math.round(performance.now() - started), status: response.status, sessionId: server.sessionId, payload: rpc });
    return rpc?.result ?? {};
  } catch (error) {
    recordEvent({ direction: 'error', method, id, elapsed: Math.round(performance.now() - started), sessionId: server.sessionId, error: error.message });
    throw error;
  }
}
async function listAll(server, method, key) {
  const results = []; let cursor;
  for (let page = 0; page < 50; page++) {
    const response = await requestRpc(server, method, cursor ? { cursor } : undefined, { safeToReplay: true });
    const items = Array.isArray(response?.[key]) ? response[key] : [];
    results.push(...items);
    cursor = response.nextCursor;
    if (!cursor) return results;
  }
  throw new Error(`${method} exceeded the 50-page capability limit.`);
}
async function discover(server) {
  const [toolList, resourceList, promptList] = await Promise.all([
    listAll(server, 'tools/list', 'tools'), listAll(server, 'resources/list', 'resources'), listAll(server, 'prompts/list', 'prompts'),
  ]);
  server.capabilities = { tools: toolList, resources: resourceList, prompts: promptList };
  return server.capabilities;
}
async function connectServer(server, { initial = false } = {}) {
  server.status = 'connecting'; renderServers(); setTransport('connecting', `Connecting to ${server.name}…`);
  try {
    const info = await initSession(server);
    server.serverInfo = info.serverInfo ?? server.serverInfo;
    await discover(server);
    server.status = 'connected'; state.activeServerId = server.id;
    recordEvent({ direction: 'system', label: `MCP session ready · ${info.protocolVersion}`, sessionId: server.sessionId, payload: { serverInfo: server.serverInfo, serverCapabilities: server.serverCapabilities, tools: server.capabilities.tools.length, resources: server.capabilities.resources.length, prompts: server.capabilities.prompts.length } });
    renderAll(); renderCapabilities();
    if (!initial) addMessage('assistant', `Connected to ${server.serverInfo?.name ?? server.name}. I found ${server.capabilities.tools.length} tool${server.capabilities.tools.length === 1 ? '' : 's'}, ${server.capabilities.resources.length} resource${server.capabilities.resources.length === 1 ? '' : 's'}, and ${server.capabilities.prompts.length} prompt${server.capabilities.prompts.length === 1 ? '' : 's'}. You can browse them under Capabilities.`);
    return true;
  } catch (error) {
    server.status = 'error'; server.error = error.message; renderServers(); setTransport('error', 'MCP connection failed'); recordEvent({ direction: 'error', label: `Connection error · ${server.name}`, sessionId: server.sessionId, error: error.message });
    if (initial) renderCapabilities();
    else { els.connectError.textContent = error.message; els.connectError.hidden = false; }
    return false;
  }
}
async function disconnectServer(server) {
  if (server.sessionId) {
    try {
      recordEvent({ direction: 'out', method: 'DELETE · end session', sessionId: server.sessionId, payload: { method: 'DELETE' } });
      const response = await fetch(requestEndpoint(server), { method: 'DELETE', headers: { 'MCP-Session-Id': server.sessionId, 'MCP-Protocol-Version': server.protocolVersion ?? PROTOCOL_VERSION, ...(server.token ? { Authorization: `Bearer ${server.token}` } : {}) }, signal: AbortSignal.timeout(5000) });
      recordEvent({ direction: response.ok ? 'in' : 'error', method: 'DELETE · end session', status: response.status, sessionId: server.sessionId, ...(response.ok ? {} : { error: `Server returned HTTP ${response.status} to DELETE.` }) });
    } catch (error) { recordEvent({ direction: 'error', method: 'DELETE · end session', sessionId: server.sessionId, error: error.message }); }
  }
  state.servers = state.servers.filter(item => item.id !== server.id);
  if (state.activeServerId === server.id) state.activeServerId = state.servers[0]?.id ?? null;
  renderAll(); renderCapabilities(); showToast('MCP server disconnected.');
}

function setView(view) {
  state.activeView = view;
  for (const tab of document.querySelectorAll('.view-tab')) {
    const active = tab.dataset.view === view; tab.classList.toggle('is-active', active); tab.setAttribute('aria-selected', String(active));
  }
  for (const [key, element] of [['conversation', els.conversation], ['capabilities', els.capabilities], ['skills', els.skillsView]]) {
    const active = key === view; element.hidden = !active; element.classList.toggle('is-active', active);
  }
  $('#view-kicker').textContent = view === 'conversation' ? 'YOUR PERSONAL ASSISTANT' : view === 'capabilities' ? 'CONNECTED SERVER DIRECTORY' : 'INSTRUCTIONS, LOADED ON DEMAND';
  if (view === 'capabilities') renderCapabilities();
}
function renderAll() {
  renderServers(); renderEvents();
  $('#capability-count').textContent = String(activeServer()?.capabilities?.tools?.length ?? 0);
  $('#skills-count').textContent = String(state.skills.length);
  $('#auto-approve').checked = state.autoApprove;
}

function renderCapabilities() {
  const server = activeServer();
  const caps = server?.capabilities ?? { tools: [], resources: [], prompts: [] };
  $('#tools-total').textContent = String(caps.tools?.length ?? 0); $('#resources-total').textContent = String(caps.resources?.length ?? 0); $('#prompts-total').textContent = String(caps.prompts?.length ?? 0);
  $('#capability-count').textContent = String(caps.tools?.length ?? 0);
  els.capabilityList.replaceChildren();
  const items = caps[state.currentCapability] ?? [];
  if (!server || server.status !== 'connected') { const empty = document.createElement('div'); empty.className = 'empty-capabilities'; empty.textContent = server?.error ? `Not connected: ${server.error}` : 'Connect an MCP server to browse its capabilities.'; els.capabilityList.append(empty); return; }
  if (!items.length) { const empty = document.createElement('div'); empty.className = 'empty-capabilities'; empty.textContent = `This server has not listed any ${state.currentCapability}.`; els.capabilityList.append(empty); return; }
  for (const item of items) {
    const card = document.createElement('article'); card.className = 'capability-card';
    const top = document.createElement('div'); top.className = 'capability-card-top';
    const name = document.createElement('strong'); name.className = 'capability-name'; name.textContent = item.name ?? item.uri ?? 'Unnamed capability'; top.append(name);
    const badge = document.createElement('span'); badge.className = 'capability-badge'; badge.textContent = state.currentCapability === 'tools' ? 'TOOL' : state.currentCapability === 'resources' ? 'RESOURCE' : 'PROMPT'; top.append(badge); card.append(top);
    const description = document.createElement('p'); description.className = 'capability-description'; description.textContent = item.description ?? item.title ?? 'No description supplied by the server.'; card.append(description);
    if (state.currentCapability === 'tools') {
      const schema = document.createElement('details'); schema.className = 'schema-details'; const summary = document.createElement('summary'); summary.textContent = 'Input requirements'; const pre = document.createElement('pre'); pre.textContent = stringifySafe(item.inputSchema ?? { type: 'object', properties: {} }); schema.append(summary, pre); card.append(schema);
      const actions = document.createElement('div'); actions.className = 'capability-card-actions'; const tryButton = document.createElement('button'); tryButton.type = 'button'; tryButton.className = 'secondary-button'; tryButton.textContent = 'Try this tool'; tryButton.addEventListener('click', () => prepareTool(item, {})); actions.append(tryButton); card.append(actions);
    } else if (state.currentCapability === 'resources') {
      const details = document.createElement('div'); details.className = 'capability-description'; details.textContent = `${item.uri ?? ''}${item.mimeType ? ` · ${item.mimeType}` : ''}`; card.append(details);
      const actions = document.createElement('div'); actions.className = 'capability-card-actions'; const read = document.createElement('button'); read.type = 'button'; read.className = 'secondary-button'; read.textContent = 'Read resource'; read.addEventListener('click', () => readResource(item)); actions.append(read); card.append(actions);
    } else {
      if (item.arguments?.length) { const args = document.createElement('p'); args.className = 'capability-description'; args.textContent = `Arguments: ${item.arguments.map(arg => `${arg.name}${arg.required ? ' (required)' : ''}`).join(', ')}`; card.append(args); }
      const actions = document.createElement('div'); actions.className = 'capability-card-actions'; const use = document.createElement('button'); use.type = 'button'; use.className = 'secondary-button'; use.textContent = 'Use prompt'; use.addEventListener('click', () => useServerPrompt(item)); actions.append(use); card.append(actions);
    }
    els.capabilityList.append(card);
  }
}

const MAX_AGENT_STEPS = 4;
function setPlannerStatus(status, text) {
  if (!els.plannerStatus) return;
  els.plannerStatus.dataset.status = status;
  els.plannerStatus.textContent = text;
}
async function refreshPlannerStatus() {
  if (backendConfigError) { setPlannerStatus('error', 'AI planner · invalid backend URL'); return; }
  try {
    const response = await fetch(backendUrl('/api/agent/status'), { cache: 'no-store', signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const status = await response.json();
    setPlannerStatus(status.configured ? 'ready' : 'error', status.configured ? 'AI planner · ready' : 'AI planner · not configured');
  } catch {
    setPlannerStatus('error', 'AI planner · backend unavailable');
  }
}
async function requestNextAgentStep(task) {
  const server = state.servers.find(item => item.id === task.serverId);
  if (!server || server.status !== 'connected') {
    state.agentTask = null;
    addMessage('assistant', 'The MCP server disconnected. I did not call a tool; reconnect and ask again.');
    return;
  }
  state.busy = true; setComposerBusy(true); setPlannerStatus('busy', 'AI agent · planning');
  const typing = addTyping(task.stepsTaken ? 'Reviewing the actual tool result' : 'Thinking through your request');
  let decision = null;
  try {
    const conversation = state.messages.slice(-12).map(item => ({ role: item.role, content: item.text.slice(0, 3000) }));
    const tools = (server.capabilities?.tools ?? []).map(tool => ({
      name: tool.name,
      title: tool.title,
      description: String(tool.description ?? '').slice(0, 1000),
      inputSchema: tool.inputSchema ?? { type: 'object', properties: {} },
      annotations: tool.annotations ? {
        readOnlyHint: Boolean(tool.annotations.readOnlyHint),
        destructiveHint: Boolean(tool.annotations.destructiveHint),
      } : undefined,
    }));
    const response = await fetch(backendUrl('/api/agent/next'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ conversation, userMessage: task.userMessage, tools, completedCalls: task.completedCalls, stepsTaken: task.stepsTaken, maxSteps: MAX_AGENT_STEPS }),
      signal: AbortSignal.timeout(40000),
    });
    const raw = await response.text();
    let payload;
    try { payload = JSON.parse(raw); }
    catch { throw new Error(response.status === 404 ? 'This host has no LLM backend. GitHub Pages serves static files only; no scripted fallback was used.' : `The LLM backend returned an unreadable response (HTTP ${response.status}).`); }
    if (!response.ok) throw new Error(payload.error ?? `The LLM backend returned HTTP ${response.status}.`);
    decision = payload.decision;
    if (!decision || !['call', 'clarify', 'answer'].includes(decision.action)) throw new Error('The LLM backend returned an invalid agent decision. No tool was called.');
    recordEvent({ direction: 'system', label: `LLM decision · ${decision.action}`, payload: { action: decision.action, step: task.stepsTaken + 1 } });
    setPlannerStatus('ready', 'AI planner · ready');
  } catch (error) {
    recordEvent({ direction: 'error', label: 'LLM planner unavailable', error: error.message });
    setPlannerStatus('error', 'AI planner · unavailable');
    addMessage('assistant', `I could not reach the real LLM planner: ${error.message}\nNo scripted answer was substituted, and no tool was called.`);
  } finally {
    typing.remove(); state.busy = false; setComposerBusy(false);
  }
  if (!decision) { state.agentTask = null; return; }
  if (decision.action === 'answer' || decision.action === 'clarify') {
    state.agentTask = null;
    addMessage('assistant', decision.message);
    return;
  }
  const tool = server.capabilities.tools.find(item => item.name === decision.toolName);
  if (!tool) {
    state.agentTask = null;
    addMessage('assistant', `The planner selected “${String(decision.toolName)}”, which is not listed by the active MCP server. No tool was called.`);
    return;
  }
  prepareTool(tool, decision.arguments ?? {}, { agentTaskId: task.id, serverId: task.serverId, explanation: decision.message, step: task.stepsTaken + 1 });
}
function requiredFields(tool) { return Array.isArray(tool.inputSchema?.required) ? tool.inputSchema.required : []; }
function missingFields(tool, args) { return requiredFields(tool).filter(key => args[key] === undefined || args[key] === null || args[key] === ''); }
function prepareTool(tool, args, agentMeta = {}) {
  if (!tool) { addMessage('assistant', 'I could not match that request to a tool on the active server. Browse Capabilities to see what it can do, or connect a different MCP server.'); return; }
  const missing = missingFields(tool, args);
  if (missing.length) {
    if (agentMeta.agentTaskId) { state.agentTask = null; addMessage('assistant', `The planner left out a required argument (${missing[0]}). Nothing was called; please restate the request with that detail.`); return; }
    requestToolFollowup(tool, args, missing); return;
  }
  const pending = { kind: 'approve', serverId: agentMeta.serverId ?? state.activeServerId, tool, args: { ...args }, ...agentMeta };
  if (state.autoApprove && tool.annotations?.readOnlyHint === true && tool.annotations?.destructiveHint !== true) { void executeTool(pending); return; }
  state.pendingAction = pending; renderPending(); els.pendingArea.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
function requestToolFollowup(tool, args, missing) {
  state.pendingAction = { kind: 'fill', serverId: state.activeServerId, tool, args: { ...args }, missing: [...missing] };
  const field = missing[0]; const schema = tool.inputSchema?.properties?.[field] ?? {};
  addMessage('assistant', schema.description ? `What should I use for ${field}? ${schema.description}` : `What should I use for ${field}?`);
  renderFillCard(tool, field, schema);
}
function makeSchemaControl(schema, field, value) {
  let control;
  if (Array.isArray(schema.enum)) {
    control = document.createElement('select');
    const empty = document.createElement('option'); empty.value = ''; empty.textContent = `Choose ${field}`; control.append(empty);
    for (const optionValue of schema.enum) { const option = document.createElement('option'); option.value = String(optionValue); option.textContent = String(optionValue); control.append(option); }
  } else if (schema.type === 'boolean') {
    control = document.createElement('select'); for (const [val, text] of [['', `Choose ${field}`], ['true', 'Yes'], ['false', 'No']]) { const option = document.createElement('option'); option.value = val; option.textContent = text; control.append(option); }
  } else if (schema.type === 'string' && (schema.maxLength > 160 || schema.format === 'textarea')) control = document.createElement('textarea');
  else { control = document.createElement('input'); control.type = schema.type === 'number' || schema.type === 'integer' ? 'number' : 'text'; if (schema.minimum != null) control.min = schema.minimum; if (schema.maximum != null) control.max = schema.maximum; }
  control.name = field; control.placeholder = schema.description ?? `Enter ${field}`;
  if (value !== undefined && value !== null) control.value = String(value);
  return control;
}
function renderFillCard(tool, field, schema) {
  els.pendingArea.replaceChildren();
  const card = document.createElement('div'); card.className = 'pending-card';
  const head = document.createElement('div'); head.className = 'pending-head'; head.textContent = 'One detail before I can continue'; card.append(head);
  const copy = document.createElement('p'); copy.className = 'pending-copy'; copy.textContent = `Tool · ${tool.name}`; card.append(copy);
  const fields = document.createElement('div'); fields.className = 'pending-fields'; const label = document.createElement('label'); label.textContent = field;
  const control = makeSchemaControl(schema, field); label.append(control); fields.append(label); card.append(fields);
  const actions = document.createElement('div'); actions.className = 'pending-actions';
  const submit = document.createElement('button'); submit.className = 'primary-button'; submit.type = 'button'; submit.textContent = 'Use this detail';
  submit.addEventListener('click', () => { if (control.value === '') { control.focus(); return; } void acceptToolField(control.value); });
  const cancel = document.createElement('button'); cancel.className = 'secondary-button'; cancel.type = 'button'; cancel.textContent = 'Cancel'; cancel.addEventListener('click', clearPending);
  actions.append(submit, cancel); card.append(actions); els.pendingArea.append(card); control.focus();
}
function renderPromptFill(prompt, field, schema) {
  state.pendingAction = { kind: 'prompt-fill', serverId: state.activeServerId, prompt, args: state.pendingAction?.args ?? {}, missing: state.pendingAction?.missing ?? [field], field };
  els.pendingArea.replaceChildren();
  const card = document.createElement('div'); card.className = 'pending-card';
  const head = document.createElement('div'); head.className = 'pending-head'; head.textContent = 'One detail for this prompt'; card.append(head);
  const copy = document.createElement('p'); copy.className = 'pending-copy'; copy.textContent = `Prompt · ${prompt.name}`; card.append(copy);
  const fields = document.createElement('div'); fields.className = 'pending-fields'; const label = document.createElement('label'); label.textContent = field; const control = makeSchemaControl(schema, field); label.append(control); fields.append(label); card.append(fields);
  const actions = document.createElement('div'); actions.className = 'pending-actions'; const submit = document.createElement('button'); submit.className = 'primary-button'; submit.type = 'button'; submit.textContent = 'Use this detail'; submit.addEventListener('click', () => { if (control.value !== '') void acceptPromptField(control.value); });
  const cancel = document.createElement('button'); cancel.className = 'secondary-button'; cancel.type = 'button'; cancel.textContent = 'Cancel'; cancel.addEventListener('click', clearPending); actions.append(submit, cancel); card.append(actions); els.pendingArea.append(card); control.focus();
}
function convertField(value, schema) {
  if (schema.type === 'number' || schema.type === 'integer') { const number = Number(value); return Number.isFinite(number) ? number : value; }
  if (schema.type === 'boolean') return value === 'true';
  return value;
}
async function acceptToolField(value) {
  const pending = state.pendingAction; if (!pending || pending.kind !== 'fill') return;
  const field = pending.missing[0]; const schema = pending.tool.inputSchema?.properties?.[field] ?? {};
  pending.args[field] = convertField(value, schema); pending.missing.shift();
  if (pending.missing.length) { const next = pending.missing[0]; const nextSchema = pending.tool.inputSchema?.properties?.[next] ?? {}; addMessage('assistant', nextSchema.description ? `And what should I use for ${next}? ${nextSchema.description}` : `What should I use for ${next}?`); renderFillCard(pending.tool, next, nextSchema); return; }
  state.pendingAction = null; els.pendingArea.replaceChildren(); prepareTool(pending.tool, pending.args);
}
async function acceptPromptField(value) {
  const pending = state.pendingAction; if (!pending || pending.kind !== 'prompt-fill') return;
  const field = pending.missing[0]; pending.args[field] = value; pending.missing.shift();
  if (pending.missing.length) { const next = pending.missing[0]; const arg = pending.prompt.arguments?.find(item => item.name === next) ?? {}; renderPromptFill(pending.prompt, next, arg); return; }
  state.pendingAction = null; els.pendingArea.replaceChildren(); await fetchPrompt(pending.prompt, pending.args);
}
function clearPending() { state.pendingAction = null; els.pendingArea.replaceChildren(); }
function renderPending() {
  els.pendingArea.replaceChildren();
  const pending = state.pendingAction; if (!pending || pending.kind !== 'approve') return;
  const card = document.createElement('div'); card.className = 'pending-card';
  const head = document.createElement('div'); head.className = 'pending-head'; const icon = document.createElement('span'); icon.textContent = '◈'; head.append(icon, document.createTextNode(pending.step ? `Agent step ${pending.step} of ${MAX_AGENT_STEPS} · review before I run this` : 'Review before I run this')); card.append(head);
  const copy = document.createElement('p'); copy.className = 'pending-copy'; copy.textContent = pending.explanation ? `${pending.explanation} Check the arguments before sending them to the connected MCP server.` : 'This request will be sent to the connected MCP server. Check the arguments below.'; card.append(copy);
  const tool = document.createElement('div'); tool.className = 'pending-tool'; tool.textContent = pending.tool.name; card.append(tool);
  const args = document.createElement('pre'); args.className = 'pending-args'; args.textContent = stringifySafe(pending.args); card.append(args);
  const actions = document.createElement('div'); actions.className = 'pending-actions';
  const approve = document.createElement('button'); approve.type = 'button'; approve.className = 'primary-button'; approve.textContent = 'Approve & run'; approve.addEventListener('click', () => { const selected = { ...pending, args: { ...pending.args } }; clearPending(); void executeTool(selected); });
  const reject = document.createElement('button'); reject.type = 'button'; reject.className = 'danger-button'; reject.textContent = 'Reject'; reject.addEventListener('click', () => { const wasAgent = Boolean(state.agentTask && state.agentTask.id === pending.agentTaskId); clearPending(); if (wasAgent) state.agentTask = null; addMessage('assistant', 'No tool was run and no change was made. You can ask me to revise the plan.'); });
  actions.append(approve, reject); card.append(actions); els.pendingArea.append(card);
}
function toolText(result) {
  const content = Array.isArray(result?.content) ? result.content : [];
  const texts = content.filter(item => item?.type === 'text' && typeof item.text === 'string').map(item => item.text);
  if (texts.length) return texts.join('\n\n');
  if (result?.structuredContent) return stringifySafe(result.structuredContent);
  return stringifySafe(result ?? {});
}
async function executeTool(pending) {
  const server = state.servers.find(item => item.id === pending.serverId);
  if (!server || server.status !== 'connected') { addMessage('assistant', 'That MCP server is no longer connected. Reconnect it and try again.'); return; }
  const agentTask = state.agentTask?.id === pending.agentTaskId ? state.agentTask : null;
  state.busy = true; setComposerBusy(true); const typing = addTyping(`Sending ${pending.tool.name} to ${server.name}`);
  let continueAgent = false;
  try {
    const result = await requestRpc(server, 'tools/call', { name: pending.tool.name, arguments: pending.args }, { safeToReplay: false });
    typing.remove();
    const resultText = toolText(result);
    const prefix = result?.isError ? 'The tool returned an error: ' : '';
    addMessage('assistant', `${prefix}${resultText}`, { toolName: pending.tool.name });
    if (agentTask) {
      agentTask.completedCalls.push({ toolName: pending.tool.name, arguments: pending.args, isError: Boolean(result?.isError), result: resultText });
      agentTask.stepsTaken += 1;
      continueAgent = true;
    }
  } catch (error) {
    typing.remove(); addMessage('assistant', `The tool call did not complete: ${error.message}\nNothing was automatically retried. You can review the inspector and reconnect if needed.`);
    if (agentTask) state.agentTask = null;
  } finally { state.busy = false; setComposerBusy(false); }
  if (continueAgent && state.agentTask === agentTask) await requestNextAgentStep(agentTask);
}
async function readResource(resource) {
  const server = activeServer(); if (!server || server.status !== 'connected') return showToast('Connect a server first.');
  state.busy = true; setComposerBusy(true); setView('conversation'); const typing = addTyping(`Reading ${resource.name ?? resource.uri}`);
  try { const result = await requestRpc(server, 'resources/read', { uri: resource.uri }, { safeToReplay: true }); typing.remove(); const text = result.contents?.map(item => item.text ?? stringifySafe(item)).join('\n\n') ?? stringifySafe(result); addMessage('assistant', text, { toolName: resource.name ?? resource.uri }); }
  catch (error) { typing.remove(); addMessage('assistant', `I couldn't read that resource: ${error.message}`); }
  finally { state.busy = false; setComposerBusy(false); }
}
async function fetchPrompt(prompt, args) {
  const server = activeServer(); if (!server || server.status !== 'connected') return showToast('Connect a server first.');
  state.busy = true; setComposerBusy(true); const typing = addTyping(`Loading prompt ${prompt.name}`);
  try {
    const result = await requestRpc(server, 'prompts/get', { name: prompt.name, arguments: args }, { safeToReplay: true });
    typing.remove(); const text = result.messages?.map(message => message.content?.text ?? '').filter(Boolean).join('\n\n') ?? '';
    if (!text) { addMessage('assistant', `The server returned the prompt “${prompt.name}” without text.`); return; }
    els.chatInput.value = text; resizeComposer(); setView('conversation'); els.chatInput.focus(); addMessage('assistant', `The “${prompt.name}” prompt is ready in your message box. Review it, then send when you’re ready.`);
  } catch (error) { typing.remove(); addMessage('assistant', `I couldn't load that prompt: ${error.message}`); }
  finally { state.busy = false; setComposerBusy(false); }
}
function useServerPrompt(prompt) {
  const missing = (prompt.arguments ?? []).filter(argument => argument.required && !argument.default);
  if (missing.length) {
    const field = missing[0]; state.pendingAction = { kind: 'prompt-fill', serverId: state.activeServerId, prompt, args: {}, missing: missing.map(item => item.name) };
    setView('conversation'); addMessage('assistant', field.description ? `What should I use for ${field.name}? ${field.description}` : `What should I use for ${field.name}?`); renderPromptFill(prompt, field.name, field); return;
  }
  void fetchPrompt(prompt, {});
}

function renderFillForPendingText(pending) {
  const field = pending.missing[0]; const schema = pending.tool.inputSchema?.properties?.[field] ?? {};
  pending.args[field] = convertField(pending.userReply, schema); pending.missing.shift(); delete pending.userReply;
  if (pending.missing.length) {
    state.pendingAction = pending; const next = pending.missing[0]; const nextSchema = pending.tool.inputSchema?.properties?.[next] ?? {};
    addMessage('assistant', nextSchema.description ? `What should I use for ${next}? ${nextSchema.description}` : `And what should I use for ${next}?`); renderFillCard(pending.tool, next, nextSchema);
  } else { state.pendingAction = null; els.pendingArea.replaceChildren(); prepareTool(pending.tool, pending.args); }
}
async function handleUserMessage(text) {
  const trimmed = text.trim(); if (!trimmed || state.busy) return;
  els.welcome.hidden = true; addMessage('user', trimmed); els.chatInput.value = ''; resizeComposer();
  const pending = state.pendingAction;
  if (pending?.kind === 'fill') { pending.userReply = trimmed; renderFillForPendingText(pending); return; }
  if (pending?.kind === 'prompt-fill') {
    const field = pending.missing[0]; pending.args[field] = trimmed; pending.missing.shift();
    if (pending.missing.length) { const next = pending.missing[0]; const arg = pending.prompt.arguments?.find(item => item.name === next) ?? {}; addMessage('assistant', arg.description ? `And what should I use for ${next}? ${arg.description}` : `What should I use for ${next}?`); renderPromptFill(pending.prompt, next, arg); }
    else { state.pendingAction = null; els.pendingArea.replaceChildren(); await fetchPrompt(pending.prompt, pending.args); }
    return;
  }
  if (pending?.kind === 'approve') { addMessage('assistant', 'There’s a tool call waiting for your review. Approve or reject it first, then I’ll continue with your new request.'); return; }
  const server = activeServer();
  if (!server || server.status !== 'connected') { addMessage('assistant', 'I don’t have a connected MCP server yet. Choose “Connect an MCP server” or reconnect the demo, then ask again.'); return; }
  const task = { id: crypto.randomUUID(), serverId: server.id, userMessage: trimmed, completedCalls: [], stepsTaken: 0 };
  state.agentTask = task;
  await requestNextAgentStep(task);
}
function setComposerBusy(busy) { els.sendButton.disabled = busy; els.chatInput.disabled = busy; els.voiceInput.disabled = busy || !speechRecognition; els.sendButton.setAttribute('aria-label', busy ? 'Assistant is working' : 'Send message'); }
function resizeComposer() { els.chatInput.style.height = 'auto'; els.chatInput.style.height = `${Math.min(els.chatInput.scrollHeight, 116)}px`; }

function speakText(text) {
  if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') {
    els.voiceStatus.textContent = 'Spoken output is not available in this browser. You can still read the response on screen.';
    return;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(String(text).slice(0, 4000));
  utterance.lang = navigator.language || 'en-US';
  window.speechSynthesis.speak(utterance);
}

function initVoiceControls() {
  const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
  if (Recognition) {
    speechRecognition = new Recognition();
    speechRecognition.lang = navigator.language || 'en-US';
    speechRecognition.continuous = false;
    speechRecognition.interimResults = true;
    let listening = false;
    speechRecognition.onstart = () => {
      listening = true; els.voiceInput.setAttribute('aria-pressed', 'true'); els.voiceInput.setAttribute('aria-label', 'Stop voice input');
      els.voiceStatus.textContent = 'Listening. Your speech is transcribed by the browser; review the text before sending.';
    };
    speechRecognition.onresult = event => {
      const transcript = Array.from(event.results).map(item => item[0]?.transcript ?? '').join('').trim();
      els.chatInput.value = transcript; resizeComposer();
    };
    speechRecognition.onerror = event => {
      const denied = event.error === 'not-allowed' || event.error === 'service-not-allowed';
      els.voiceStatus.textContent = denied ? 'Microphone permission was denied. Type your message instead.' : `Voice input stopped (${event.error ?? 'speech error'}). You can type instead.`;
    };
    speechRecognition.onend = () => {
      listening = false; els.voiceInput.setAttribute('aria-pressed', 'false'); els.voiceInput.setAttribute('aria-label', 'Start voice input');
      if (els.chatInput.value.trim()) els.voiceStatus.textContent = 'Dictation ready. Review the transcript, then choose Send.';
    };
    els.voiceInput.addEventListener('click', () => {
      if (state.busy) return;
      try { if (listening) speechRecognition.stop(); else speechRecognition.start(); }
      catch { els.voiceStatus.textContent = 'Voice input could not start. Check microphone permission or type your message.'; }
    });
  } else {
    els.voiceInput.disabled = true;
    els.voiceStatus.textContent = 'Speech input is not supported in this browser. Type your message instead.';
  }

  const outputAvailable = 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
  els.voiceOutput.disabled = !outputAvailable;
  if (!outputAvailable) els.voiceOutput.title = 'Spoken output is not supported in this browser';
  els.voiceOutput.addEventListener('click', () => {
    voiceOutputEnabled = !voiceOutputEnabled;
    els.voiceOutput.setAttribute('aria-pressed', String(voiceOutputEnabled));
    els.voiceOutput.lastElementChild.textContent = voiceOutputEnabled ? 'Voice on' : 'Voice off';
    if (!voiceOutputEnabled) window.speechSynthesis.cancel();
    showToast(voiceOutputEnabled ? 'Browser voice replies enabled.' : 'Browser voice replies disabled.');
  });
  setComposerBusy(state.busy);
}

function parseSkill(markdown, source) {
  const text = String(markdown ?? '').replace(/^\uFEFF/, '');
  const match = text.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/);
  if (!match) throw new Error('Could not find YAML frontmatter between opening and closing --- lines.');
  const lines = match[1].split(/\r?\n/); const fields = {}; let lastMultiline = null;
  for (const line of lines) {
    if (/^\s/.test(line) && lastMultiline) { fields[lastMultiline] += `${fields[lastMultiline] ? '\n' : ''}${line.trim()}`; continue; }
    lastMultiline = null;
    const entry = line.match(/^([a-z][a-z0-9-]*):\s*(.*)$/i);
    if (!entry) continue;
    let value = entry[2].trim();
    if (value === '>' || value === '|') { fields[entry[1]] = ''; lastMultiline = entry[1]; continue; }
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    fields[entry[1]] = value;
  }
  const name = fields.name ?? ''; const description = fields.description ?? '';
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) || name.length > 64) throw new Error('Skill name must use lowercase letters/numbers and single hyphens, up to 64 characters.');
  if (!description.trim() || description.length > 1024) throw new Error('Skill description is required and must be at most 1024 characters.');
  const body = text.slice(match[0].length).trim();
  return { id: name, name, description, instructions: body, metadata: fields, source, official: false };
}
function loadOfficialSkills() {
  state.skills = officialSkills.map(skill => ({ ...skill, name: skill.id, instructions: '', metadata: {}, official: true, loaded: false, sourceUrl: `https://github.com/modelcontextprotocol/ext-apps/blob/main/plugins/mcp-apps/skills/${skill.id}/SKILL.md` }));
  renderSkills(); renderAll();
}
function renderSkills() {
  els.skillsLibrary.replaceChildren();
  if (!state.skills.length) { const empty = document.createElement('p'); empty.className = 'empty-capabilities'; empty.textContent = 'No skills loaded yet. Add an Agent Skill markdown file to begin.'; els.skillsLibrary.append(empty); }
  for (const skill of state.skills) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'skill-card';
    const glyph = document.createElement('span'); glyph.className = 'skill-glyph'; glyph.textContent = '✳';
    const copy = document.createElement('span'); copy.className = 'skill-card-copy'; const name = document.createElement('strong'); name.textContent = skill.name; const description = document.createElement('span'); description.textContent = skill.description;
    copy.append(name, description); const arrow = document.createElement('span'); arrow.className = 'skill-card-arrow'; arrow.textContent = skill.loadError ? '!' : '↗'; button.append(glyph, copy, arrow); button.addEventListener('click', () => openSkill(skill)); els.skillsLibrary.append(button);
  }
  $('#skills-count').textContent = String(state.skills.length);
}
async function openSkill(skill) {
  $('#skill-dialog-title').textContent = skill.name;
  $('#skill-dialog-description').textContent = skill.description;
  const source = $('#skill-dialog-source'); source.replaceChildren(); source.append(document.createTextNode(`${skill.source ?? 'Imported skill'}${skill.metadata?.license ? ` · ${skill.metadata.license}` : ''} · `));
  const link = document.createElement('a'); link.href = skill.sourceUrl ?? '#'; link.target = '_blank'; link.rel = 'noreferrer'; link.textContent = skill.sourceUrl ? 'View source' : 'Imported content'; source.append(link);
  els.skillDialog.showModal();
  const instructions = $('#skill-instructions');
  if (skill.official && !skill.loaded && !skill.loadError) {
    instructions.textContent = 'Loading this skill’s instructions…';
    try {
      const response = await fetch(skill.url, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const parsed = parseSkill(await response.text(), skill.source);
      if (parsed.name !== skill.name) throw new Error('The skill file name does not match its catalog entry.');
      Object.assign(skill, parsed, { id: skill.name, official: true, loaded: true, sourceUrl: skill.sourceUrl, url: skill.url });
      $('#skill-dialog-description').textContent = skill.description;
      instructions.textContent = skill.instructions || 'This skill file has no instruction body.';
      renderSkills();
    } catch (error) {
      skill.loadError = true;
      instructions.textContent = `Could not load the official SKILL.md (${error.message}). Use the source link to inspect it, or try again after reopening the skill.`;
    }
    return;
  }
  instructions.textContent = skill.instructions || (skill.loadError ? 'The official SKILL.md could not be loaded. Check the source link or try again after the server is reachable.' : 'This skill file has no instruction body.');
}
function importSkillText(text, source) {
  try {
    const skill = parseSkill(text, source); const existing = state.skills.findIndex(item => item.name === skill.name);
    if (existing >= 0) state.skills.splice(existing, 1, skill); else state.skills.push(skill);
    renderSkills(); els.skillSourceInput.value = ''; showToast(`Loaded Agent Skill “${skill.name}”.`); return true;
  } catch (error) { showToast(error.message); return false; }
}

function openConnectDialog() {
  els.connectError.hidden = true; els.connectError.textContent = ''; els.connectForm.dataset.serverId = '';
  $('#server-name').value = ''; $('#server-url').value = ''; $('#server-token').value = ''; els.connectSubmit.textContent = 'Connect'; els.connectDialog.showModal(); $('#server-name').focus();
}
function validateEndpoint(raw) {
  let url;
  try { url = new URL(raw); } catch { throw new Error('Enter a complete MCP endpoint URL.'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('The MCP endpoint must use http:// or https://.');
  if (url.username || url.password) throw new Error('Do not put credentials inside the endpoint URL; use the token field instead.');
  if (location.protocol === 'https:' && url.protocol === 'http:') throw new Error('This page is HTTPS, so browsers block insecure HTTP server connections. Use an HTTPS endpoint.');
  return url.href;
}

async function readResourceFromCard(resource) { await readResource(resource); }
function setCapabilityTab(key) {
  state.currentCapability = key;
  for (const tab of document.querySelectorAll('.capability-tab')) { const active = tab.dataset.capability === key; tab.classList.toggle('is-active', active); tab.setAttribute('aria-selected', String(active)); }
  renderCapabilities();
}
function connectDemo() {
  const existing = state.servers.find(item => item.id === 'demo');
  if (existing?.status === 'connected') { state.activeServerId = existing.id; renderAll(); setView('conversation'); showToast('The demo MCP server is already connected.'); return; }
  const server = existing ?? { id: 'demo', name: 'Alexa+ Demo', url: DEMO_URL, status: 'connecting', token: '', capabilities: { tools: [], resources: [], prompts: [] } };
  if (!existing) state.servers.unshift(server);
  state.activeServerId = server.id; void connectServer(server, { initial: !state.messages.length });
}
async function reconnectDemo() {
  const existing = state.servers.find(item => item.id === 'demo');
  if (existing?.sessionId) {
    try { await fetch(requestEndpoint(existing), { method: 'DELETE', headers: { 'MCP-Session-Id': existing.sessionId }, signal: AbortSignal.timeout(4000) }); } catch { /* a stale session is safe to replace */ }
  }
  const replacement = { id: 'demo', name: 'Alexa+ Demo', url: DEMO_URL, status: 'connecting', token: '', capabilities: { tools: [], resources: [], prompts: [] } };
  state.servers = [replacement, ...state.servers.filter(item => item.id !== 'demo')]; state.activeServerId = 'demo';
  renderAll(); void connectServer(replacement); showToast('Opening a fresh demo MCP session…');
}

els.chatForm.addEventListener('submit', event => { event.preventDefault(); void handleUserMessage(els.chatInput.value); });
els.chatInput.addEventListener('input', resizeComposer);
els.chatInput.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); els.chatForm.requestSubmit(); } });
for (const button of document.querySelectorAll('.suggestion')) button.addEventListener('click', () => void handleUserMessage(button.dataset.prompt ?? ''));
for (const tab of document.querySelectorAll('.view-tab')) tab.addEventListener('click', () => setView(tab.dataset.view));
for (const tab of document.querySelectorAll('.capability-tab')) tab.addEventListener('click', () => setCapabilityTab(tab.dataset.capability));
$('#auto-approve').addEventListener('change', event => { state.autoApprove = event.target.checked; showToast(state.autoApprove ? 'Auto-approve enabled for this session.' : 'Tool approvals are back on.'); });
$('#open-connect').addEventListener('click', openConnectDialog);
$('#reconnect-demo').addEventListener('click', reconnectDemo);
$('#refresh-capabilities').addEventListener('click', async () => { const server = activeServer(); if (!server || server.status !== 'connected') return showToast('Connect a server first.'); try { await discover(server); renderServers(); renderCapabilities(); showToast('Capabilities refreshed.'); } catch (error) { showToast(error.message); } });
$('#toggle-inspector').addEventListener('click', () => { els.inspector.hidden = !els.inspector.hidden; });
$('#close-inspector').addEventListener('click', () => { els.inspector.hidden = true; });
$('#clear-events').addEventListener('click', () => { state.events = []; renderEvents(); });
$('.dialog-close').addEventListener('click', () => els.connectDialog.close());
$('.dialog-cancel').addEventListener('click', () => els.connectDialog.close());
$('.skill-dialog-close').addEventListener('click', () => els.skillDialog.close());

els.connectForm.addEventListener('submit', async event => {
  event.preventDefault(); els.connectError.hidden = true;
  const name = $('#server-name').value.trim() || 'MCP server';
  let url;
  try { url = validateEndpoint($('#server-url').value.trim()); }
  catch (error) { els.connectError.textContent = error.message; els.connectError.hidden = false; return; }
  let server = state.servers.find(item => item.id === els.connectForm.dataset.serverId);
  if (!server) {
    server = { id: crypto.randomUUID(), name, url, token: $('#server-token').value, status: 'connecting', capabilities: { tools: [], resources: [], prompts: [] } };
    state.servers.push(server); els.connectForm.dataset.serverId = server.id;
  } else { server.name = name; server.url = url; server.token = $('#server-token').value; server.sessionId = null; server.lastEventId = null; }
  state.activeServerId = server.id; els.connectSubmit.disabled = true; els.connectSubmit.textContent = 'Connecting…';
  renderAll(); const connected = await connectServer(server);
  els.connectSubmit.disabled = false; els.connectSubmit.textContent = connected ? 'Connected' : 'Try again';
  if (connected) { els.connectDialog.close(); els.connectForm.reset(); els.connectForm.dataset.serverId = ''; els.connectSubmit.textContent = 'Connect'; }
});

$('#import-skill').addEventListener('click', () => {
  const text = els.skillSourceInput.value.trim(); if (!text) return showToast('Paste a SKILL.md file first.');
  importSkillText(text, 'Pasted SKILL.md');
});
$('#skill-file').addEventListener('change', async event => {
  const file = event.target.files?.[0]; if (!file) return;
  if (file.size > 1_000_000) { showToast('Skill files must be smaller than 1 MB.'); event.target.value = ''; return; }
  importSkillText(await file.text(), file.name); event.target.value = '';
});

for (const tab of document.querySelectorAll('.capability-tab')) tab.setAttribute('aria-selected', String(tab.classList.contains('is-active')));
renderAll(); renderCapabilities(); renderSkills();
initVoiceControls();
void refreshPlannerStatus();
const demo = { id: 'demo', name: 'Alexa+ Demo', url: DEMO_URL, status: 'connecting', token: '', capabilities: { tools: [], resources: [], prompts: [] } };
state.servers.push(demo); state.activeServerId = demo.id;
void connectServer(demo, { initial: true });
loadOfficialSkills();
