import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/server';
import { NodeStreamableHTTPServerTransport } from '@modelcontextprotocol/node';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';
const MCP_API_KEY = process.env.MCP_API_KEY || '';
const skillsDir = path.join(__dirname, 'skills');
const contexts = new Map();

const skillCatalog = [
  {
    name: 'home-control',
    title: 'Home Control',
    description: 'Safely plan a home-device action. This demo returns a plan and never controls a real device.',
    file: 'home-control.md'
  },
  {
    name: 'daily-briefing',
    title: 'Daily Briefing',
    description: 'Compose a concise assistant briefing from user-provided items.',
    file: 'daily-briefing.md'
  }
];

function makeServer() {
  const server = new McpServer({ name: 'alexa-plus-assistant', version: '1.0.0' });

  const getContext = (contextId) => contexts.get(contextId) || { contextId, preferences: {}, notes: [], lastRoutine: null };

  server.registerTool('list_skills', {
    title: 'List Agent Skills',
    description: 'List the Agent Skills available to Alexa+ clients.',
    inputSchema: z.object({})
  }, async () => ({
    content: [{ type: 'text', text: JSON.stringify(skillCatalog, null, 2) }],
    structuredContent: { skills: skillCatalog }
  }));

  server.registerTool('get_skill', {
    title: 'Get Agent Skill',
    description: 'Return the instructions for one named Agent Skill.',
    inputSchema: z.object({ name: z.string().min(1) })
  }, async ({ name }) => {
    const skill = skillCatalog.find((item) => item.name === name);
    if (!skill) {
      return { isError: true, content: [{ type: 'text', text: `Unknown skill: ${name}` }] };
    }
    const instructions = await readFile(path.join(skillsDir, skill.file), 'utf8');
    return {
      content: [{ type: 'text', text: instructions }],
      structuredContent: { ...skill, instructions }
    };
  });

  server.registerTool('run_skill', {
    title: 'Run Agent Skill',
    description: 'Run a safe, deterministic demo Agent Skill using JSON input. The server does not access real devices or accounts.',
    inputSchema: z.object({
      skill: z.enum(['home-control', 'daily-briefing']),
      input: z.record(z.string(), z.unknown()).default({})
    })
  }, async ({ skill, input }) => {
    if (skill === 'home-control') {
      const device = typeof input.device === 'string' ? input.device : 'living-room lights';
      const action = typeof input.action === 'string' ? input.action : 'check status';
      const plan = {
        skill,
        mode: 'demo',
        confirmationRequired: action !== 'check status',
        steps: [`Resolve device: ${device}`, `Prepare action: ${action}`, 'Ask for confirmation before any real-world change'],
        result: `I prepared a demo plan to ${action} for ${device}. No device was contacted.`
      };
      return { content: [{ type: 'text', text: JSON.stringify(plan, null, 2) }], structuredContent: plan };
    }

    const items = Array.isArray(input.items) ? input.items.filter((item) => typeof item === 'string') : [];
    const greeting = typeof input.greeting === 'string' ? input.greeting : 'Good morning';
    const briefing = [greeting + '.', items.length ? `You have ${items.length} item${items.length === 1 ? '' : 's'}:` : 'You have no pending items.', ...items.map((item) => `- ${item}`)].join('\n');
    const result = { skill, briefing, itemCount: items.length };
    return { content: [{ type: 'text', text: briefing }], structuredContent: result };
  });

  server.registerTool('remember_context', {
    title: 'Remember User Context',
    description: 'Save lightweight preferences or notes for a named assistant context. Data stays in this server process and is never sent to a third party.',
    inputSchema: z.object({
      contextId: z.string().min(1).default('default'),
      preference: z.record(z.string(), z.string()).default({}),
      note: z.string().max(500).optional()
    })
  }, async ({ contextId, preference, note }) => {
    const context = getContext(contextId);
    context.preferences = { ...context.preferences, ...preference };
    if (note) context.notes = [...context.notes, note].slice(-20);
    contexts.set(contextId, context);
    const result = { contextId, preferences: context.preferences, noteCount: context.notes.length, persisted: 'process-memory' };
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }], structuredContent: result };
  });

  server.registerTool('get_context', {
    title: 'Get User Context',
    description: 'Retrieve the lightweight preferences and notes saved for an assistant context.',
    inputSchema: z.object({ contextId: z.string().min(1).default('default') })
  }, async ({ contextId }) => {
    const context = getContext(contextId);
    return { content: [{ type: 'text', text: JSON.stringify(context, null, 2) }], structuredContent: context };
  });

  server.registerTool('orchestrate_routine', {
    title: 'Orchestrate Personal Routine',
    description: 'Build a context-aware morning or evening routine by combining the daily-briefing and home-control Agent Skills. It returns a plan and never performs a physical-world action.',
    inputSchema: z.object({
      contextId: z.string().min(1).default('default'),
      routine: z.enum(['morning', 'evening']).default('morning'),
      items: z.array(z.string()).default([]),
      device: z.string().default('living-room lights')
    })
  }, async ({ contextId, routine, items, device }) => {
    const context = getContext(contextId);
    const preferredGreeting = context.preferences.greeting || (routine === 'morning' ? 'Good morning' : 'Good evening');
    const preferredAction = context.preferences[routine + 'Action'] || (routine === 'morning' ? 'check status' : 'check status');
    const briefing = [preferredGreeting + '.', items.length ? `You have ${items.length} priority item${items.length === 1 ? '' : 's'}:` : 'You have no priority items.', ...items.map((item) => `- ${item}`)].join('\n');
    const devicePlan = {
      device,
      action: preferredAction,
      confirmationRequired: preferredAction !== 'check status',
      status: 'planned-only'
    };
    const result = {
      contextId,
      routine,
      steps: [
        { skill: 'daily-briefing', output: briefing },
        { skill: 'home-control', output: devicePlan },
        { skill: 'safety-gate', output: devicePlan.confirmationRequired ? 'Ask for explicit confirmation before any device change.' : 'No confirmation needed for a read-only status check.' }
      ],
      usedPreferences: Object.keys(context.preferences),
      note: 'This demo produces an auditable plan; it does not contact a device.'
    };
    context.lastRoutine = result;
    contexts.set(contextId, context);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }], structuredContent: result };
  });

  server.registerTool('get_time', {
    title: 'Get Current Time',
    description: 'Return the current server time in an optional IANA timezone.',
    inputSchema: z.object({ timezone: z.string().default('UTC') })
  }, async ({ timezone }) => {
    let formatted;
    try {
      formatted = new Intl.DateTimeFormat('en-US', { dateStyle: 'full', timeStyle: 'long', timeZone: timezone }).format(new Date());
    } catch {
      return { isError: true, content: [{ type: 'text', text: `Invalid IANA timezone: ${timezone}` }] };
    }
    return { content: [{ type: 'text', text: formatted }], structuredContent: { timezone, formatted } };
  });

  return server;
}

const app = express();
app.disable('x-powered-by');
app.use(cors({ origin: process.env.CORS_ORIGIN || true, exposedHeaders: ['Mcp-Session-Id'] }));
app.use(express.json({ limit: '1mb' }));

app.get('/', (_req, res) => res.type('html').send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Alexa+ MCP Assistant</title>
<style>body{font-family:system-ui,sans-serif;max-width:760px;margin:4rem auto;padding:0 1.25rem;color:#17202a;background:#f7f9fb}main{background:white;padding:2.5rem;border-radius:18px;box-shadow:0 8px 30px #17202a18}h1{margin-top:0;color:#146c94}code{background:#eef4f7;padding:.2rem .4rem;border-radius:5px}a{color:#146c94}li{margin:.7rem 0}.badge{display:inline-block;padding:.35rem .65rem;border-radius:999px;background:#dff5e8;color:#146c50;font-size:.85rem}</style></head>
<body><main><span class="badge">MCP 2025-11-25 · Streamable HTTP</span><h1>Alexa+ MCP Assistant</h1><p>A context-aware Agent Skills demo that orchestrates daily briefings and safe home-control plans.</p><h2>Try the service</h2><ul><li><a href="/health"><code>/health</code></a> — service status</li><li><code>/mcp</code> — Streamable HTTP MCP endpoint for compatible clients</li></ul><p>The demo is plan-only: it never contacts or changes a real device.</p></main></body></html>`));
app.get('/health', (_req, res) => res.json({ ok: true, service: 'alexa-plus-assistant', version: '1.0.0' }));

app.all('/mcp', async (req, res) => {
  if (MCP_API_KEY && req.get('authorization') !== `Bearer ${MCP_API_KEY}` && req.get('x-api-key') !== MCP_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const server = makeServer();
  const transport = new NodeStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableDnsRebindingProtection: true,
    allowedHosts: [HOST, 'localhost', `${HOST}:${PORT}`, `localhost:${PORT}`]
  });
  res.on('close', () => { void transport.close().catch(() => {}); });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error('MCP request failed:', error);
    if (!res.headersSent) res.status(500).json({ error: 'MCP request failed' });
  }
});

app.listen(PORT, HOST, () => {
  console.log(`Alexa+ MCP server listening at http://${HOST}:${PORT}`);
  console.log(`Streamable HTTP endpoint: http://${HOST}:${PORT}/mcp`);
});

export { app, makeServer, skillCatalog };
