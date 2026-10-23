# Alexa+ MCP Assistant — implementation plan

## Product and implementation

Create a web-based Alexa+-style conversational assistant that is genuinely agent-driven: each user turn is planned by the project-managed LLM, tool decisions are checked against live MCP capabilities, and approved calls are sent to a real Streamable HTTP server. The Node.js/Express backend exposes `/mcp/demo` using `@modelcontextprotocol/server`, `@modelcontextprotocol/node`, and Zod 4; `/api/agent/next` calls the OpenAI-compatible project LLM using `MANUS_API_URL` and `MANUS_API_KEY` only on the server. Never expose platform keys or send a remote MCP bearer token to the model. Keep user-provided remote server calls in the browser, with optional bearer credentials held in memory. Show clear CORS, model, authentication, transport, and protocol failures rather than falling back to scripted replies.

The client will issue JSON-RPC 2.0 messages with POST and both required response media types in `Accept`; initialize and negotiate capabilities, send `notifications/initialized`, carry `MCP-Session-Id`, and handle JSON as well as SSE responses. It will enumerate tools, resources, and prompts; invoke tools through `tools/call`; retain the last SSE event ID for reconnect attempts; attempt one fresh initialization when an existing session returns 404; and send DELETE when a session is explicitly disconnected. The demo server will exercise this request lifecycle and provide deterministic tools, resources, and prompts.

The assistant will send recent conversation context, the active server's tool descriptions and schemas, and verified prior tool results to the LLM to request one next action (`call`, `clarify`, or `answer`). Validate each proposed tool name and argument object against the current server capabilities before rendering a proposal; never execute model-produced content as code. Ask for clarification when required arguments are missing. Show arguments and results, require explicit approval for every tool call by default, allow the existing user-controlled auto-approve option, and bound a single user request to four tool calls. Keep the model loop multi-turn by re-planning after each actual tool result. The inspector captures JSON-RPC method, direction, status, duration, session, and error details while never logging authorization headers or model credentials.

The demo server will expose an explicitly labelled in-memory household simulator: sample calendar events, a home-status snapshot, and a bounded `set_home_device` tool for safe demo devices. These are not live calendar, weather, or smart-home accounts; state-changing simulator calls go through the same MCP approval card and visibly update the connected server's returned state. Add browser voice input through the Web Speech API and user-triggered speech output through speech synthesis, with accessible unsupported-browser and permission-denied fallbacks.

Agent Skills will follow the supplied MCP Extensions catalog and the open Agent Skills `SKILL.md` format: parse YAML frontmatter for required `name` and `description`, display metadata and Markdown instructions progressively, and make official MCP Extensions skills available from their published materials. Imported skill content is reference text, not executable instructions; scripts are never run.

Use `@modelcontextprotocol/client` for an SDK-based end-to-end check against the running demo endpoint; include the requested `@modelcontextprotocol/ext-apps` dependency without claiming an MCP Apps host unless implemented. Negotiate MCP `2025-11-25` or later, preserve tools, resources, prompts and session handling, and route the browser's approved calls to the connected server.

The user previously requested GitHub-only delivery. The existing `25158074-alt/alexa-mcp-assistant` repository is public and Pages is configured for branch-root publishing; do not change visibility. A root redirect sends visitors to the static frontend in `public/`. The GitHub integration lacks Pages write permission to switch this existing site to Actions mode. GitHub Pages cannot run the Node.js MCP server or server-side LLM proxy, so keep the client honest about unavailable backend endpoints and never present a Pages URL as a live MCP endpoint. A durable public MCP endpoint and model-backed Pages experience require a backend host outside GitHub; do not deploy there without explicit authorization.

## Project structure

- `server/index.js` — Express application, static files, health route, LLM endpoint, and MCP demo route.
- `server/demo-mcp.js` — SDK-backed MCP Streamable HTTP tools, resources, and prompts, validated with Zod.
- `server/agent.js` — server-only LLM request, bounded agent planning, JSON parsing, and MCP capability/argument validation.
- `server/home-simulator.js` — explicitly simulated calendar and household device state.
- `scripts/mcp-smoke.js` — SDK client smoke test for demo initialization and capability/tool calls.
- `public/index.html` — accessible application shell.
- `public/styles.css` — responsive conversational workspace and inspector styles.
- `public/app.js` — multi-turn LLM planning, actual MCP calls and approvals, browser conversation context, voice controls, capability browser, skills UI, and inspector.
- `public/skills/` — source files for the four official MCP Extensions Agent Skills, if available from the project's official linked materials.
  - `public/manus-routes.json` — static route declaration.
  - `app.config.ts` — project logo URL for checkpoint metadata.
- `package.json`, `pnpm-lock.yaml`, and `pnpm-workspace.yaml` — pinned toolchain, requested MCP SDK dependencies, and explicit install-script policy.
- `.github/workflows/pages.yml` — GitHub Pages workflow for the static frontend only, when the private-repository plan permits it.
- `README.md` and `SUBMISSION_KIT.md` — judge setup, project description, product-feedback draft, and remaining submission checklist.

## Design

- **Reference adaptation:** Use the supplied Vesper.ai page's black canvas, Inter / Instrument Serif pairing, and restrained liquid-metal treatment as a visual reference, not as product copy or IA. The frontend remains the Alexa+ MCP workspace, not a Vesper.ai landing page.

- **Design movement:** A dark, precision-made voice workbench with subtle chrome cues rather than a generic sci-fi dashboard.
- **Core principles:** Keep the conversation primary; make protocol state inspectable; make side effects explicit; use black and silver without obscuring affordances.
- **Color philosophy:** Pure black canvas and near-black surfaces create focus; silver gradients mark navigation and primary controls; a restrained tidal-teal live state, amber approval state, and red fault state preserve meaning.
- **Layout paradigm:** Retain the existing three-rail workspace—server rail, conversation/capability stage, and inspector—rather than replacing it with a single marketing hero or removing operational controls.
- **Signature elements:** The existing four-ray Alexa+ voice mark; softly sheened metal-gradient tabs and buttons; compact, high-contrast protocol and session indicators.
- **Interaction philosophy:** Keep the attached reference's polished, restrained control language, while preserving real MCP connection, inspectable tool arguments, explicit approval, and error feedback.
- **Animation:** Use only a brief highlight sweep on hover, a small connection pulse, and subtle message entry; respect reduced-motion preferences and avoid background video or decorative motion.
- **Typography system:** Inter for interface text and controls; Instrument Serif italic as a limited welcome-heading accent; system monospace for JSON-RPC methods and payloads.
- **Brand essence:** An Alexa+-style front door to connected MCP tools and Agent Skills; calm, capable, inspectable.
- **Brand voice:** Warm and direct. Example: “Tell me what needs getting done.” “Review the tool call before I run it.”
- **Wordmark & logo:** Keep the Alexa+ wordmark and project's custom voice mark; do not use Vesper.ai copy, unsupported business metrics, or a false Amazon/official-Alexa affiliation.
- **Signature brand color:** Silver chrome on black for controls, with small teal, amber, and red status accents.

## Standards references

The implementation follows the user-provided [MCP Extensions Agent Skills guide](https://apps.extensions.modelcontextprotocol.io/api/documents/agent-skills.html), [MCP Extensions API page](https://apps.extensions.modelcontextprotocol.io/api/#build-with-agent-skills), [Streamable HTTP transport specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports#streamable-http), and [Agent Skills specification](https://agentskills.io/specification).
