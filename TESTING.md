# Testing Instructions

## Prerequisites

- Node.js 20 or newer.
- No accounts, API keys, or paid services are required for the demo.

## Start the project

```bash
npm install
cp .env.example .env
npm start
```

The server listens on `http://127.0.0.1:3000`. There are no login credentials because the local demo is intentionally unauthenticated; set `MCP_API_KEY` before exposing it beyond localhost.

## Automated verification

In a second terminal:

```bash
npm test
```

The smoke test checks `/health`, sends an MCP `initialize` request over Streamable HTTP using protocol `2025-11-25`, and confirms that the server identifies itself as `alexa-plus-assistant`.

## End-to-end MCP client verification

The official SDK client can connect and call the tools:

```bash
node --input-type=module <<'NODE'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
const client = new Client({ name: 'judge-client', version: '1.0.0' });
await client.connect(new StreamableHTTPClientTransport(new URL('http://127.0.0.1:3000/mcp')));
console.log((await client.listTools()).tools.map(t => t.name));
console.log(await client.callTool({
  name: 'remember_context',
  arguments: { contextId: 'judge-demo', preference: { greeting: 'Hello judge' } }
}));
console.log(await client.callTool({
  name: 'orchestrate_routine',
  arguments: { contextId: 'judge-demo', routine: 'morning', items: ['Review the demo'], device: 'desk lamp' }
}));
await client.close();
NODE
```

Expected tools include `list_skills`, `get_skill`, `run_skill`, `remember_context`, `get_context`, `orchestrate_routine`, and `get_time`. The routine result contains an auditable multi-step plan combining the daily briefing and home-control skills. It will say that no physical device was contacted.

## Evaluation scope

This is a free, local, self-contained demo. It does not require Alexa account access, Amazon credentials, third-party personal data, or a physical smart-home device. The home-control workflow is deliberately simulation-only so judges can run it safely and reproduce every result.
