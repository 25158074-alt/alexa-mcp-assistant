# Alexa+ MCP Assistant

A black-and-silver Alexa+-style browser workbench for Model Context Protocol. The local/Node version combines a real server-side LLM planner, an SDK-backed Streamable HTTP MCP server, browser-side MCP client calls, explicit tool approval, an in-memory household/calendar simulator, Agent Skills, and optional browser-native speech controls.

**GitHub Pages can host the static web UI, but it cannot run the Node MCP server or server-side LLM planner.** The Pages UI will therefore show its actual backend status and will not substitute scripted answers. A public LLM/MCP-backed Pages experience requires a separately hosted HTTPS Node backend, which is outside a GitHub-only deployment.

## Alexa+ track

The Alexa+ track permits either a working Agent Skill/self-hosted MCP server using MCP 2025-11-25 or later over Streamable HTTP, or a simulated Alexa+ experience built with agentic tools. This repository exercises the MCP-server path locally using MCP protocol `2025-11-25`; it also provides the browser simulation UI. The project does not claim a public MCP endpoint merely because a static Pages frontend is published.

## Requirements

- Node.js 22 or later
- npm (the repository's committed `package-lock.json` is the install source)
- A managed Model Context Protocol SDK runtime and an OpenAI-compatible model endpoint for the LLM route, supplied through server-only `MANUS_API_URL` and `MANUS_API_KEY` environment variables

No provider key belongs in `public/`, GitHub Actions artifacts, browser storage, a repository commit, or a frontend runtime config.

## Run locally

```bash
npm ci
npm run start:agentic
```

Open `http://localhost:3000`. On a Manus project runtime, the managed model environment is injected for the Node process. Elsewhere, provide the two server variables in the shell/hosting secret store; do not paste them into client configuration. The `public/runtime-config.js` default is intentionally blank for static Pages. For a same-origin local Node server, leave it blank; the UI resolves `/mcp/demo` and `/api/agent/*` against the Node app.

To check the SDK-backed MCP session, tool calls, simulator, and resource:

```bash
MCP_SMOKE_URL=http://127.0.0.1:3000/mcp/demo npm run test:mcp
```

The earlier `server.mjs` implementation and its original `npm start` / `npm test` commands remain in the repository. `npm run start:agentic` starts the added multi-turn LLM workbench backend and SDK demo MCP server on port 3000; `npm run test:mcp` tests that demo endpoint.

To use a real third-party remote Streamable HTTP MCP endpoint from the browser, choose **Connect an MCP server**, use an HTTPS endpoint, and enter an optional bearer token in the connection dialog. Tokens remain in browser memory and are not sent to the LLM planner. A remote server must permit browser CORS from the app origin. Read-only calls are the only calls that the optional safe-read setting can run automatically; state-changing tools always require the review/approval card.

## Demo boundaries

The sample calendar, home state, and in-memory notes are simulations, not live Google/Outlook, weather, smart-home, or other personal-account integrations. They reset when the server restarts. The `set_home_scene` MCP tool makes bounded changes to demo state only, and its MCP tool call must pass the UI's user approval flow. `get_local_time` reads the Node server's clock and supports IANA time zones.

The planner uses the project-managed LLM on the server. Each request includes the user's current message, recent conversation, the active server's advertised tool names/schemas, and actual earlier MCP results. The planner selects one next step; the browser validates it against the current tool listing, then presents or executes it according to the explicit approval policy. Tool responses go back through the LLM for bounded multi-step reasoning. On model, CORS, server, or tool failure, the app reports that failure without falling back to canned responses.

## GitHub Pages

GitHub Pages is configured for legacy branch-root publishing. The repository root `index.html` sends visitors to the static Alexa+ app in `public/`. GitHub Pages does not support the Node server, the SDK Streamable HTTP MCP endpoint, or the server-side LLM API. In Pages-only mode, leave `backendOrigin` blank to get an honest unavailable status; the frontend cannot connect the included localhost demo from a remote browser.

To connect the static frontend to a separately deployed backend, set `public/runtime-config.js` to a public **HTTPS origin only** (no URL path, credentials, query or fragment). The backend must be configured to allow the exact Pages origin in `AGENT_ALLOWED_ORIGINS` and `MCP_ALLOWED_ORIGINS`; that origin must also pass the official SDK host/origin protections. Keep model credentials in the backend's secret store. This configuration is deliberately not set to localhost or any temporary Preview origin in the published static files. **No separate Node host is included in this GitHub Pages deployment.**

## Agent Skills

The Skills panel follows the open `SKILL.md` frontmatter shape (`name`, `description`, Markdown instructions) and loads the four MCP Extensions skills progressively. Skill markdown is displayed as content; scripts are not executed. Their upstream source and license attribution are in `public/skills/NOTICE.md` and `public/skills/LICENSE`.

## Voice

The microphone button uses browser-provided Web Speech recognition, and the optional output toggle uses `speechSynthesis`. This is a browser feature, not an Alexa wake-word/device integration. Support and microphone-permission behavior vary by browser; typing remains available.

## Repository tests

```bash
npm test
node --check server/index.js
node --check server/demo-mcp.js
node --check server/agent.js
node --check server/home-simulator.js
node --check public/app.js
npm run test:mcp
```

The MCP smoke test checks negotiation at `2025-11-25`, tool discovery, sample calendar/home calls, and a simulator resource over the running Streamable HTTP server.
