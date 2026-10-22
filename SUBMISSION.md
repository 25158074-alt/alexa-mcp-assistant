# Alexa+ Hackathon Submission

## Project description

Alexa+ MCP Assistant is a self-hosted Alexa+-style assistant backend that exposes Agent Skills over the Model Context Protocol (MCP) Streamable HTTP transport. A compatible Alexa+ client or MCP client can discover available skills, read their instructions, and run safe demo workflows.

The project includes two Agent Skills: `home-control`, which prepares a device-action plan and requires confirmation before any real-world change, and `daily-briefing`, which turns caller-provided items into a concise spoken briefing. The `get_time` tool provides a small utility example. This repository is intentionally a safe demo: it does not claim to control real devices or access personal accounts.

## Features and functionality

- MCP Streamable HTTP endpoint at `/mcp`.
- MCP protocol initialization tested with version `2025-11-25`.
- Agent Skill instruction files under `skills/`.
- MCP tools for skill discovery, instruction retrieval, guarded demo execution, and time lookup.
- Health endpoint at `/health`.
- Optional Bearer-token or API-key authentication.
- DNS-rebinding and host validation protections.
- Local smoke test and official MCP client integration test procedure.

## Code repository

Private GitHub repository: https://github.com/25158074-alt/alexa-mcp-assistant

The repository contains the complete source code, lockfile, skill assets, environment template, README, and tests needed to run the project.

## Primary track

- Alexa+

## Mini challenges

- None currently selected.

## Product feedback

### Developer tools, APIs, and SDKs used

- `@modelcontextprotocol/server`: creates the MCP server and registers tools.
- `@modelcontextprotocol/node`: provides `NodeStreamableHTTPServerTransport`, which is the runtime transport used at `/mcp`.
- `@modelcontextprotocol/client`: used in the integration verification script to connect to the running server, list tools, and call an Agent Skill.
- `@modelcontextprotocol/express`: installed as part of the MCP Express integration surface and available for future authenticated Express helpers.
- `@modelcontextprotocol/ext-apps`: installed for compatibility with MCP Apps-capable clients and future Alexa+ UI surfaces.
- Express, Zod, CORS, and dotenv: HTTP routing, runtime validation, cross-origin configuration, and environment configuration.

### What worked well

The SDK packages installed cleanly from npm. The server and client packages expose a straightforward `McpServer` plus `NodeStreamableHTTPServerTransport` flow. Tool schemas are concise with Zod, and the official client connected successfully over Streamable HTTP, discovered all four tools, and executed `daily-briefing`.

### What needs work

The SDK's host validation is security-conscious but the development configuration needs explicit host-and-port allowlist entries when requests include a port in the `Host` header. The examples and type declarations were useful for resolving this, but a small end-to-end Streamable HTTP starter template with authentication, CORS, and DNS-rebinding defaults would reduce onboarding friction.

The SDK ecosystem also contains several packages with closely related responsibilities. A short compatibility matrix explaining when to use `server`, `node`, `express`, `client`, and `ext-apps` would make package selection easier.

### Onboarding experience

Onboarding was good: install the packages, create an `McpServer`, register a tool, create the Node Streamable HTTP transport, connect the server to the transport, and call `handleRequest`. The main workaround was reading the installed declaration examples to confirm the current transport lifecycle and configuring allowed hosts with the local port.

### Would we build with these tools again?

Yes. The APIs are composable, the transport worked reliably in local tests, and the official client made it possible to validate the complete runtime path rather than only checking imports. We would build with them again, especially if the documentation added a production-ready Streamable HTTP reference server and clearer package-selection guidance.

## Demonstration video plan

The final public video should be less than three minutes and show:

1. Starting the server and opening the health endpoint.
2. Connecting an MCP client to `/mcp`.
3. Discovering the Agent Skills.
4. Running `daily-briefing` and showing the returned spoken-style briefing.
5. Running `home-control` and showing that a changing action produces a confirmation-required plan instead of claiming a device was changed.

The video should use original screen footage and narration or royalty-free audio only, then be uploaded publicly to YouTube or Vimeo for the submission form.
