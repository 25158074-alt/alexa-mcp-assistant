# Friction Log

These entries record concrete onboarding and implementation friction encountered while building the project.

## 1. Host validation with a local port

- **Task attempted:** Send the first MCP `initialize` request to `http://127.0.0.1:3137/mcp`.
- **Steps:** Started the Streamable HTTP server with DNS-rebinding protection enabled, then used the official client and a raw fetch request.
- **Expected:** HTTP 200 initialization response.
- **Actual:** HTTP 403 because the Host header included `127.0.0.1:3137`, while the initial allowlist contained only bare hostnames.
- **Severity:** Medium.
- **Workaround:** Added both bare hosts and host-plus-port entries to `allowedHosts` for the configured development port.
- **Suggestion:** Provide a documented helper or example that derives allowed host entries from the configured bind host and port, especially for local development.

## 2. Choosing among MCP packages

- **Task attempted:** Build a Node/Express Streamable HTTP server and verify it with an official client.
- **Steps:** Installed `server`, `node`, `express`, `client`, `ext-apps`, and `zod`, then inspected the installed declarations.
- **Expected:** A clear minimal package path.
- **Actual:** Several packages have adjacent responsibilities, and the most useful Express transport lifecycle example was in the Node package declarations.
- **Severity:** Low.
- **Workaround:** Used `McpServer` from `server`, `NodeStreamableHTTPServerTransport` from `node`, and `Client` plus `StreamableHTTPClientTransport` from `client`.
- **Suggestion:** Add a one-page package-selection matrix and a canonical production starter repository.

## 3. Protocol-version verification

- **Task attempted:** Confirm that the implementation was speaking the required Alexa+ MCP protocol.
- **Steps:** Sent `initialize` with `protocolVersion: 2025-11-25`, then called `listTools` and `orchestrate_routine` through the official client.
- **Expected:** The SDK and client would agree on the requested protocol version.
- **Actual:** The current SDK negotiated successfully, but the protocol version is not prominent in the simplest server setup documentation.
- **Severity:** Low.
- **Workaround:** Added the exact version to the smoke test and judge-facing testing instructions.
- **Suggestion:** Surface the negotiated protocol version in a standard debug log or health diagnostic.
