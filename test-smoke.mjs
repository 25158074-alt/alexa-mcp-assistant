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
  console.log('Smoke test passed');
} finally {
  child.kill('SIGTERM');
}
