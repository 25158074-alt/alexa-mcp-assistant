import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/client';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

const endpoint = process.env.MCP_SMOKE_URL ?? 'http://127.0.0.1:3000/mcp/demo';
const client = new Client({ name: 'alexa-plus-sdk-smoke', version: '1.0.0' });
const transport = new StreamableHTTPClientTransport(new URL(endpoint));
let negotiatedHeader = '';
const originalFetch = globalThis.fetch;
globalThis.fetch = async (...args) => {
  const response = await originalFetch(...args);
  negotiatedHeader = response.headers.get('MCP-Protocol-Version') ?? negotiatedHeader;
  return response;
};

try {
  await client.connect(transport);
  const version = client.getNegotiatedProtocolVersion();
  assert.ok(version && version >= '2025-11-25', `Unsupported MCP protocol version: ${version}`);

  const { tools } = await client.listTools();
  const names = new Set(tools.map(tool => tool.name));
  for (const expected of ['get_local_time', 'get_calendar_events', 'get_home_status', 'set_home_scene']) {
    assert.ok(names.has(expected), `Missing SDK-registered MCP tool: ${expected}`);
  }

  const calendar = await client.callTool({ name: 'get_calendar_events', arguments: { windowHours: 12 } });
  const calendarText = (calendar.content ?? []).filter(item => item.type === 'text').map(item => item.text).join('\n');
  assert.match(calendarText, /sample calendar/i);
  assert.equal(calendar.isError, undefined);

  const home = await client.callTool({ name: 'get_home_status', arguments: {} });
  const homeText = (home.content ?? []).filter(item => item.type === 'text').map(item => item.text).join('\n');
  assert.match(homeText, /simulated home/i);

  const resource = await client.readResource({ uri: 'demo://home/state' });
  assert.ok(resource.contents?.length, 'Expected simulated home resource contents');
  assert.match(resource.contents[0].text, /"simulated": true/);

  console.log(JSON.stringify({
    endpoint,
    protocolVersion: version,
    responseProtocolHeader: negotiatedHeader || null,
    toolCount: tools.length,
    checkedTools: ['get_calendar_events', 'get_home_status'],
    checkedResource: 'demo://home/state',
    result: 'passed',
  }, null, 2));
} finally {
  globalThis.fetch = originalFetch;
  await client.close().catch(() => {});
}
