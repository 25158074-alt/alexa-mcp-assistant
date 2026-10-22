# Alexa+ MCP Assistant

A browser-based Alexa+ experience plus a self-hosted MCP server built with the official Model Context Protocol SDK. The GitHub Pages app is a functional chatbot simulation; it exposes the same Agent Skill concepts through a friendly conversational interface, while the Node server exposes them over Streamable HTTP for MCP clients.

## Features

- Streamable HTTP MCP endpoint at `/mcp`.
- Interactive browser chatbot at `/` with natural-language demo prompts.
- Health endpoint at `/health`.
- Agent Skills stored as readable Markdown under `skills/`.
- Context-aware state through `remember_context` and `get_context`.
- `orchestrate_routine` combines the daily briefing and home-control skills into an auditable routine plan.
- `list_skills`, `get_skill`, `run_skill`, and `get_time` tools.
- Stateless transport, suitable for horizontally scaled deployments.
- Optional Bearer-token or `x-api-key` protection through `MCP_API_KEY`.
- Browser-session context memory, daily briefing, home-control confirmation, and multi-skill routine orchestration.
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

## The Alexa+ experience

The differentiating flow is a context-aware routine rather than a single-turn question-answer wrapper. A caller can save a preference such as a preferred greeting, then ask the assistant to orchestrate a morning routine. The server composes a spoken briefing, prepares a home-device step, applies a confirmation safety gate, and returns an auditable plan. Context is keyed by `contextId` and remains available while the server process is running; no personal data leaves the process.

## Agent Skills

The Markdown files in `skills/` are the source of truth for skill behavior. The MCP tools expose those instructions to a client and provide deterministic demo execution. Add a new skill by adding its Markdown file and catalog entry, then implement its guarded execution in `run_skill`.

## Scope

This repository is an integration starter, not an Alexa account integration. It does not include Amazon credentials, real smart-home control, or access to personal calendar/mail data.
