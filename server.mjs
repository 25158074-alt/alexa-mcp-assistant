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
