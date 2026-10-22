import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as wait } from 'node:timers/promises';

const port = 3137;
const child = spawn(process.execPath, ['server.mjs'], { env: { ...process.env, HOST: '127.0.0.1', PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
try {
  await wait(700);
  const health = await fetch(`http://127.0.0.1:${port}/health`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { ok: true, service: 'alexa-plus-assistant', version: '1.0.0' });

  const initialize = await fetch(`http://127.0.0.1:${port}/mcp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'smoke-test', version: '1.0.0' } } })
  });
  assert.equal(initialize.status, 200);
  const body = await initialize.text();
  assert.match(body, /alexa-plus-assistant/);
  const client = await import('@modelcontextprotocol/client');
  const mcpClient = new client.Client({ name: 'smoke-client', version: '1.0.0' });
  await mcpClient.connect(new client.StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`)));
  const tools = await mcpClient.listTools();
  assert.ok(tools.tools.some((tool) => tool.name === 'orchestrate_routine'));
  await mcpClient.callTool({ name: 'remember_context', arguments: { contextId: 'smoke', preference: { greeting: 'Hello' } } });
  const routine = await mcpClient.callTool({ name: 'orchestrate_routine', arguments: { contextId: 'smoke', routine: 'morning', items: ['Test the workflow'], device: 'desk lamp' } });
  assert.match(routine.content[0].text, /planned-only/);
  await mcpClient.close();
  console.log('Smoke test passed');
} finally {
  child.kill('SIGTERM');
}
