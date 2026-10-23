# TODO

- [x] **MCP Streamable HTTP connection and capability browser**
  - Provide MCP server connection setup for entering a Streamable HTTP endpoint and optional authentication details, with connection validation and clear error feedback.
  - Implement standards-compliant MCP Streamable HTTP client flow, including initialization, capability negotiation, JSON-RPC messaging, streaming responses, session handling, and reconnect behavior.
  - Show connected servers and their available tools, resources, prompts, and Agent Skills with descriptions and input requirements.

- [x] **Official MCP JavaScript SDK server integration**
  - Install the requested `@modelcontextprotocol/ext-apps`, `@modelcontextprotocol/client@^2.0.0`, `@modelcontextprotocol/server@^2.0.0`, `@modelcontextprotocol/node@^2.0.0`, `@modelcontextprotocol/express@^2.0.0`, and `zod@^4.2.0` dependencies.
  - Implement the demo endpoint with the official server, Node Streamable HTTP transport, Express integration, and Zod schemas; exercise it with the official SDK client and negotiate MCP `2025-11-25` or later.

- [x] **LLM-driven, multi-turn agent and actual MCP tool calls**
  - Use a real server-side LLM call and recent conversation context to decide whether to answer, ask a clarification question, or call a tool; do not present keyword-matched canned text as model reasoning.
  - Use the active server's live MCP tool names, descriptions, and input schemas; validate proposed names and arguments before execution.
  - Route approved proposals through the real MCP Streamable HTTP client/server flow, pass actual tool results back to the LLM for the next bounded step, and show tool results and errors honestly.
  - Keep platform credentials server-side, never pass MCP bearer tokens to the model, require human approval before tool side effects by default, and make any auto-approval an explicit user choice.

- [x] **Household and calendar service simulator**
  - Provide an explicitly labelled simulator with realistic sample calendar events and household device state, callable through MCP tools and resources.
  - Allow a bounded device-state change through MCP only after the same approval flow; reflect approved changes in subsequent simulator results.
  - Do not claim simulator data is a real calendar, weather, smart-home account, or live external service.

- [x] **Alexa-style browser voice controls**
  - Add user-initiated speech input with the browser Web Speech API and optional spoken assistant output with speech synthesis.
  - Provide accessible listening/error status and a graceful text-only fallback when the browser lacks speech support or denies microphone permission.

- [ ] **Alexa+-style conversation and safe tool orchestration**
  - Provide an Alexa+-style conversational web interface with text input, assistant responses, tool activity states, and visible loading/output states.
  - Let the assistant select an appropriate connected tool, request missing parameters, invoke it, and incorporate the result into the conversation.
  - Before execution, show the intended tool invocation and arguments with approve and reject controls and an optional auto-approve choice.

- [x] **Agent Skills compatibility**
  - Load compatible Agent Skills metadata and instructions using the linked MCP Extensions Agent Skills materials and open Agent Skills `SKILL.md` conventions; display skill instructions as content, without executing skill scripts.

- [x] **Developer inspector**
  - Provide a developer inspector showing transport status, request/response events, session identifiers, tool payloads, timing, and protocol errors so the integration can be inspected.

- [x] **Immediately usable MCP demo and judge scenario**
  - Include demo mode with sample MCP-compatible tools and guided example prompts so the Alexa+ experience can be tested immediately without external setup.
  - Demonstrate natural-language planning using: “I’m late for a meeting. Check what matters, prepare my house, and don’t change anything without asking me.”

- [x] **Alexa+ visual adaptation of the supplied reference**
  - Apply its pure-black canvas, Inter and Instrument Serif typography, and restrained liquid-metal controls to the Alexa+ MCP workspace; keep MCP conversation, server connection, capabilities, Agent Skills, approvals, and inspector visible and usable; do not substitute Vesper.ai branding, unrelated marketing copy, unsupported metrics, or a video for the Alexa+ experience.

- [ ] **GitHub-only static frontend and public MCP endpoint**
  - Keep GitHub Pages as the requested public frontend host. GitHub Pages serves static files and cannot run the Node.js MCP server or server-side LLM route; do not represent a Pages URL as a live MCP endpoint.
  - A durable public MCP endpoint and LLM-backed Pages experience require a separate backend host. Do not deploy outside GitHub unless the user explicitly authorizes that change; disclose the constraint if it remains unapproved.

- [ ] **Alexa+ submission-ready repository and materials**
  - Include all source code, assets, and functional setup/run instructions in the GitHub repository.
  - The supplied submission brief requests a private repository shared with `testing@devpost.com` and GitHub usernames `knmeiss`, `giolaq`, `anishamalde`, `mosesroth`, and `emersonsklar`; the current repository is public, so do not claim this privacy requirement is met or change visibility without user direction. A public route instead requires a visible open-source license.
  - Include a project text description, primary track selection, mini-challenge selection, and product-feedback answers covering tools/APIs/SDKs used, what worked, what needs work, onboarding, and whether the entrant would use them again.

- [ ] **Demo video submission requirement**
  - The submission includes a demonstration video under 3 minutes that shows the project functioning on the device for which it was built, is publicly available on YouTube or Vimeo with its link supplied in the submission form, and contains no third-party trademarks, copyrighted music, or other material without permission.
