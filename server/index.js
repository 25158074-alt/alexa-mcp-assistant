import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMcpExpressApp } from '@modelcontextprotocol/express';
import { AgentError, requestAgentDecision } from './agent.js';
import { closeDemoMcp, handleDemoMcp } from './demo-mcp.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(root, 'public');
const port = Number(process.env.PORT ?? 3000);
const previewHost = '3000-ilmi8dxn20af8ke041s5i-67e23569.sg2.manus.computer';
const allowedHosts = [
  'localhost', '127.0.0.1', '[::1]',
  'localhost:3000', '127.0.0.1:3000', '[::1]:3000',
  previewHost,
  ...(process.env.MCP_ALLOWED_HOSTS ?? '').split(',').map(host => host.trim()).filter(Boolean),
];
const agentAllowedOrigins = new Set([
  'https://3000-ilmi8dxn20af8ke041s5i-67e23569.sg2.manus.computer',
  'https://25158074-alt.github.io',
  ...(process.env.AGENT_ALLOWED_ORIGINS ?? '').split(',').map(origin => origin.trim()).filter(Boolean),
]);
const agentRateLimit = new Map();
function hostnameOnly(value) {
  try { return new URL(value.includes('://') ? value : `http://${value}`).hostname; }
  catch { return value; }
}
const allowedHostnames = [...new Set(allowedHosts.map(hostnameOnly))];
const allowedOriginHostnames = [...new Set([
  ...allowedHostnames,
  ...[...agentAllowedOrigins].map(hostnameOnly),
  ...(process.env.MCP_ALLOWED_ORIGINS ?? '').split(',').map(origin => origin.trim()).filter(Boolean).map(hostnameOnly),
])];
const app = createMcpExpressApp({
  host: '0.0.0.0',
  allowedOrigins: allowedOriginHostnames,
  jsonLimit: '1mb',
});
app.set('trust proxy', 1);

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.md': 'text/markdown; charset=utf-8',
};

function requestIsSameOrigin(req) {
  const origin = req.get('origin');
  if (!origin) return true;
  const forwardedHost = req.get('x-forwarded-host')?.split(',')[0].trim();
  const requestHost = (forwardedHost || req.get('host') || '').toLowerCase();
  try {
    return new URL(origin).host.toLowerCase() === requestHost;
  } catch {
    return false;
  }
}

function allowAgentOrigin(req, res) {
  const origin = req.get('origin');
  if (!origin || requestIsSameOrigin(req)) return true;
  if (!agentAllowedOrigins.has(origin)) return false;
  res.set('Access-Control-Allow-Origin', origin)
    .set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    .set('Access-Control-Allow-Headers', 'Accept, Content-Type')
    .set('Vary', 'Origin');
  return true;
}

function consumeAgentRateLimit(req) {
  const key = req.ip || req.socket?.remoteAddress || 'unknown';
  const now = Date.now();
  let bucket = agentRateLimit.get(key);
  if (!bucket || now - bucket.start >= 60_000) bucket = { start: now, count: 0 };
  bucket.count += 1;
  agentRateLimit.set(key, bucket);
  if (agentRateLimit.size > 5000) {
    for (const [address, item] of agentRateLimit) if (now - item.start > 60_000) agentRateLimit.delete(address);
  }
  return bucket.count <= 12;
}

app.options('/api/agent/status', (req, res) => {
  if (!allowAgentOrigin(req, res)) { res.status(403).end(); return; }
  res.status(204).end();
});
app.options('/api/agent/next', (req, res) => {
  if (!allowAgentOrigin(req, res)) { res.status(403).end(); return; }
  res.status(204).end();
});

app.get('/health', (_req, res) => {
  res.set('Cache-Control', 'no-store').json({ ok: true, service: 'alexa-mcp-assistant' });
});

app.get('/api/agent/status', (req, res) => {
  if (!allowAgentOrigin(req, res)) { res.status(403).json({ error: 'This browser origin is not allowed.' }); return; }
  const configured = Boolean(process.env.MANUS_API_URL && process.env.MANUS_API_KEY);
  res.set('Cache-Control', 'no-store').json({
    configured,
    provider: configured ? 'project-managed LLM' : null,
    detail: configured ? 'The server-side model route is configured.' : 'No server-side model provider is configured on this host.',
  });
});

app.post('/api/agent/next', async (req, res) => {
  if (!allowAgentOrigin(req, res)) {
    res.status(403).json({ error: 'Cross-origin requests are not allowed for the agent planner.' });
    return;
  }
  if (!consumeAgentRateLimit(req)) {
    res.set('Retry-After', '60').status(429).json({ error: 'The planner is temporarily rate-limited. Wait a moment and try again.' });
    return;
  }
  try {
    const decision = await requestAgentDecision(req.body ?? {});
    res.set('Cache-Control', 'no-store').json({ decision });
  } catch (error) {
    if (error instanceof AgentError) {
      res.status(error.status).json({ error: error.message, code: error.code });
      return;
    }
    console.error('[agent] Planner failed:', error instanceof Error ? error.name : 'unknown');
    res.status(500).json({ error: 'The agent planner failed unexpectedly. No tool was called.' });
  }
});

app.all('/mcp/demo', async (req, res) => {
  res.set('Cache-Control', 'no-cache, no-transform');
  try {
    await handleDemoMcp(req, res);
  } catch (error) {
    console.error('[mcp] Demo request failed:', error instanceof Error ? error.name : 'unknown');
    if (!res.headersSent) res.status(500).json({ error: 'The demo MCP server encountered an internal error.' });
    else res.end();
  }
});

app.use(async (req, res) => {
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.set('Allow', 'GET, HEAD').status(405).type('text/plain').send('Method not allowed');
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.originalUrl, 'http://localhost').pathname);
  } catch {
    res.status(400).type('text/plain').send('Invalid path');
    return;
  }
  if (pathname === '/') pathname = '/index.html';
  const filePath = path.resolve(publicDir, `.${pathname}`);
  if (!filePath.startsWith(`${publicDir}${path.sep}`)) {
    res.status(403).type('text/plain').send('Forbidden');
    return;
  }

  try {
    const body = await fs.readFile(filePath);
    res.status(200)
      .set('Content-Type', contentTypes[path.extname(filePath)] ?? 'application/octet-stream')
      .set('Cache-Control', 'no-cache')
      .set('X-Content-Type-Options', 'nosniff')
      .set('Referrer-Policy', 'strict-origin-when-cross-origin');
    if (req.method === 'HEAD') res.end();
    else res.end(body);
  } catch {
    res.status(404).set('Cache-Control', 'no-store').type('text/plain').send('Not found');
  }
});

const listener = app.listen(port, '0.0.0.0', () => {
  console.log(`Alexa+ MCP Assistant listening on 0.0.0.0:${port}`);
});

async function shutdown(signal) {
  console.log(`Received ${signal}; closing MCP sessions.`);
  await closeDemoMcp();
  listener.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}
process.once('SIGTERM', () => void shutdown('SIGTERM'));
process.once('SIGINT', () => void shutdown('SIGINT'));
