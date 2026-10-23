import { randomUUID } from 'node:crypto';
import { NodeStreamableHTTPServerTransport } from '@modelcontextprotocol/node';
import { McpServer, SUPPORTED_PROTOCOL_VERSIONS } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { registerHomeSimulator, simulatorSnapshot } from './home-simulator.js';

const sessions = new Map();
const notes = [
  { note: 'Try the London time tool before your next trip.', createdAt: 'demo starter note' },
];

const allowedOriginSet = new Set([
  'https://3000-ilmi8dxn20af8ke041s5i-67e23569.sg2.manus.computer',
  'https://25158074-alt.github.io',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  ...((process.env.MCP_ALLOWED_ORIGINS ?? '').split(',').map(origin => origin.trim()).filter(Boolean)),
]);
const allowedOriginHosts = [...new Set([...allowedOriginSet].flatMap(origin => {
  try { return [new URL(origin).hostname]; } catch { return []; }
}))];

function textResult(text, structuredContent = undefined, extra = {}) {
  return {
    content: [{ type: 'text', text }],
    ...(structuredContent ? { structuredContent } : {}),
    ...extra,
  };
}

function createDemoServer() {
  const supportedProtocolVersions = [
    '2025-11-25',
    ...SUPPORTED_PROTOCOL_VERSIONS.filter(version => version !== '2025-11-25'),
  ];
  const server = new McpServer(
    { name: 'Alexa+ Sample MCP Server', title: 'Alexa+ Demo', version: '1.1.0' },
    {
      supportedProtocolVersions,
      instructions: 'An SDK-backed sample MCP server. Notes and household state are in-memory simulations and reset when the server restarts; no real calendar, home or third-party account is connected.',
    },
  );

  server.registerTool('get_local_time', {
    title: 'Get local time',
    description: 'Gets the current clock time for an IANA time zone, such as Europe/London. If omitted, uses the app server clock.',
    inputSchema: z.object({ timeZone: z.string().trim().min(1).max(100).optional() }).strict(),
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  }, async ({ timeZone }) => {
    const zone = timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    try {
      const value = new Intl.DateTimeFormat('en', { dateStyle: 'full', timeStyle: 'short', timeZone: zone }).format(new Date());
      return textResult(`It is ${value} in ${zone}. (Live clock time from the demo server.)`, { timeZone: zone, localTime: value });
    } catch {
      return textResult(`“${zone}” is not a valid IANA time zone. Try Europe/London or America/New_York.`, undefined, { isError: true });
    }
  });

  server.registerTool('save_note', {
    title: 'Remember a note',
    description: 'Stores a short note in this server process memory. Ask for the user’s approval before saving.',
    inputSchema: z.object({ note: z.string().trim().min(1).max(500) }).strict(),
    annotations: { destructiveHint: true, idempotentHint: false, openWorldHint: false },
  }, async ({ note }) => {
    const entry = { note, createdAt: new Date().toISOString() };
    notes.push(entry);
    return textResult(`Saved to this demo server’s in-memory notes: “${note}”. Notes reset when the server restarts.`, entry);
  });

  server.registerTool('search_notes', {
    title: 'Search notes',
    description: 'Searches the notes saved in memory by this demo server.',
    inputSchema: z.object({ query: z.string().trim().min(1).max(120) }).strict(),
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  }, async ({ query }) => {
    const matches = notes.filter(item => item.note.toLowerCase().includes(query.toLowerCase()));
    const text = matches.length
      ? `Found ${matches.length} note${matches.length === 1 ? '' : 's'}:\n${matches.map((item, index) => `${index + 1}. ${item.note}`).join('\n')}`
      : `No notes matched “${query}”.`;
    return textResult(text, { query, matches });
  });

  server.registerTool('get_home_briefing', {
    title: 'Get a gentle day plan',
    description: 'Returns a clearly labelled sample day plan. It does not read a real calendar or task service.',
    inputSchema: z.object({ focus: z.string().trim().max(160).optional() }).strict(),
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  }, async ({ focus }) => {
    const today = new Intl.DateTimeFormat('en', { dateStyle: 'full' }).format(new Date());
    const detail = focus ? ` Your focus: ${focus}.` : '';
    return textResult(
      `A gentle sample plan for ${today}:\n1. Pick one thing that matters most.\n2. Make a small start, then take a real break.\n3. Leave a little room for something unexpected.${detail}\n\nThis is a demo plan, not a calendar or external task lookup.`,
      { mode: 'simulated', date: today, focus: focus ?? null },
    );
  });

  registerHomeSimulator(server);

  server.registerResource('saved-notes', 'demo://notes', {
    title: 'Saved notes',
    description: 'Notes kept in memory by this demo server.',
    mimeType: 'text/plain',
  }, async uri => ({
    contents: [{ uri: uri.href, mimeType: 'text/plain', text: notes.map((item, index) => `${index + 1}. ${item.note}`).join('\n') || 'No notes saved yet.' }],
  }));

  server.registerResource('assistant-about', 'demo://assistant/about', {
    title: 'About this demo',
    description: 'A short guide to the Alexa+ sample MCP server and its demo-data boundaries.',
    mimeType: 'text/plain',
  }, async uri => ({
    contents: [{ uri: uri.href, mimeType: 'text/plain', text: 'This server uses the official Model Context Protocol JavaScript SDK and Streamable HTTP transport. Notes and household/calendar results are demonstrations in server memory, not live personal accounts or external services.' }],
  }));

  server.registerResource('home-state', 'demo://home/state', {
    title: 'Simulated home state',
    description: 'Current in-memory demo devices; this is not a real smart-home system.',
    mimeType: 'application/json',
  }, async uri => ({
    contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(simulatorSnapshot(), null, 2) }],
  }));

  server.registerPrompt('plan_my_day', {
    title: 'Plan my day',
    description: 'Suggests a calm plan for the day, with an optional focus.',
    argsSchema: z.object({ focus: z.string().trim().max(160).optional() }).strict(),
  }, ({ focus }) => ({
    description: 'Plan a calm, realistic day without implying access to a calendar.',
    messages: [{ role: 'user', content: { type: 'text', text: `Help me make a gentle plan for today${focus ? `, focusing on ${focus}` : ''}. Keep it realistic, leave room for breaks, and do not claim this prompt checked a calendar.` } }],
  }));

  server.registerPrompt('find_a_note', {
    title: 'Find a note',
    description: 'Searches the demo note store for a phrase.',
    argsSchema: z.object({ query: z.string().trim().min(1).max(120) }).strict(),
  }, ({ query }) => ({
    description: 'Search notes for a phrase.',
    messages: [{ role: 'user', content: { type: 'text', text: `Search the demo server's saved notes for “${query}”.` } }],
  }));

  return server;
}

function applyCors(req, res) {
  const origin = req.headers.origin;
  if (!origin) return true;
  if (!allowedOriginSet.has(origin)) return false;
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Accept, Authorization, Content-Type, Last-Event-ID, MCP-Protocol-Version, MCP-Session-Id');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Type, Last-Event-ID, MCP-Protocol-Version, MCP-Session-Id, Retry-After');
  res.setHeader('Access-Control-Max-Age', '600');
  return true;
}

function sendError(res, status, message) {
  if (res.headersSent) {
    res.end();
    return;
  }
  res.status(status).type('application/json').send(JSON.stringify({ error: message }));
}

export async function handleDemoMcp(req, res) {
  if (!applyCors(req, res)) {
    sendError(res, 403, 'This browser origin is not allowed by the demo MCP server.');
    return;
  }
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const sessionId = req.get('mcp-session-id');
  if (req.method === 'POST' && !sessionId) {
    if (req.body?.method !== 'initialize') {
      sendError(res, 400, 'A new Streamable HTTP session must begin with initialize.');
      return;
    }
    const transport = new NodeStreamableHTTPServerTransport({
      sessionIdGenerator: randomUUID,
      allowedHosts: [
        'localhost', '127.0.0.1', '[::1]',
        'localhost:3000', '127.0.0.1:3000', '[::1]:3000',
        '3000-ilmi8dxn20af8ke041s5i-67e23569.sg2.manus.computer',
        ...(process.env.MCP_ALLOWED_HOSTS ?? '').split(',').map(host => host.trim()).filter(Boolean),
      ],
      enableDnsRebindingProtection: true,
    });
    const server = createDemoServer();
    try {
      await server.connect(transport);
      const session = { transport, server };
      transport.onclose = async () => {
        const closedId = transport.sessionId;
        if (closedId) sessions.delete(closedId);
        await server.close().catch(() => {});
      };
      await transport.handleRequest(req, res, req.body);
      if (transport.sessionId) sessions.set(transport.sessionId, session);
    } catch (error) {
      await server.close().catch(() => {});
      throw error;
    }
    return;
  }

  if (req.method === 'POST' && !req.headers['content-type']?.toLowerCase().includes('application/json')) {
    sendError(res, 415, 'Streamable HTTP POST requests must use application/json.');
    return;
  }
  if (!sessionId || !sessions.has(sessionId)) {
    sendError(res, sessionId ? 404 : 400, sessionId ? 'MCP session not found. Initialize a new session.' : 'This request requires an MCP-Session-Id.');
    return;
  }

  const session = sessions.get(sessionId);
  await session.transport.handleRequest(req, res, req.body);
}

export async function closeDemoMcp() {
  const active = [...sessions.values()];
  sessions.clear();
  await Promise.allSettled(active.map(async ({ server }) => server.close()));
}
