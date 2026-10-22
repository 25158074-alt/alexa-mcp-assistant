# Alexa+ MCP Assistant

A small Alexa+-style MCP server built with the official Model Context Protocol SDK. It exposes Agent Skills over the Streamable HTTP transport and is safe to run as a demo: the home-control skill only prepares plans and never contacts real devices.

## Features

- Streamable HTTP MCP endpoint at `/mcp`.
- Health endpoint at `/health`.
- Agent Skills stored as readable Markdown under `skills/`.
- `list_skills`, `get_skill`, `run_skill`, and `get_time` tools.
- Stateless transport, suitable for horizontally scaled deployments.
- Optional Bearer-token or `x-api-key` protection through `MCP_API_KEY`.
- Origin and DNS-rebinding protections on the MCP transport.

## Run locally

```bash
npm install
cp .env.example .env
npm start
```

The local endpoint is `http://127.0.0.1:3000/mcp`.

Run the smoke test with:

```bash
npm test
```

## MCP client configuration

For an MCP client that supports Streamable HTTP, configure:

```json
{
  "mcpServers": {
    "alexa-plus": {
      "url": "http://127.0.0.1:3000/mcp"
    }
  }
}
```

If `MCP_API_KEY` is set, send `Authorization: Bearer <key>` or `x-api-key: <key>`. For production, set `HOST=0.0.0.0`, use HTTPS at the reverse proxy, set a specific `CORS_ORIGIN`, and configure a strong secret.

## Agent Skills

The Markdown files in `skills/` are the source of truth for skill behavior. The MCP tools expose those instructions to a client and provide deterministic demo execution. Add a new skill by adding its Markdown file and catalog entry, then implement its guarded execution in `run_skill`.

## Scope

This repository is an integration starter, not an Alexa account integration. It does not include Amazon credentials, real smart-home control, or access to personal calendar/mail data.
