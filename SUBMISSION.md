# Alexa+ Hackathon Submission Draft

## Project

**Name:** Alexa+ MCP Assistant

**Project description:**

Alexa+ MCP Assistant is a browser-based, Alexa+-inspired workbench for connecting to Model Context Protocol servers and inspecting how an agent uses their tools. In its Node.js runtime, a real server-side LLM planner reads the current conversation and the active MCP server's live tool descriptions and schemas, selects one next action, and reasons over actual tool results in a bounded multi-step loop. The browser uses Streamable HTTP and shows tool arguments for review; state-changing calls remain behind an explicit approval step. The included official-SDK MCP server provides sample time, notes, calendar, and household tools, plus simulator resources and prompts. The calendar and smart-home examples are clearly labelled in-memory demo data, not personal-account integrations. The interface also includes an Agent Skills library, protocol inspector, optional browser dictation, and optional speech synthesis.

**Important deployment disclosure:** the GitHub Pages version is a static frontend. GitHub Pages does not host the Node.js MCP server or LLM API; a connected live Pages demo requires a separately hosted HTTPS backend. Do not submit the Pages URL as a public MCP endpoint.

## Primary track

- [x] Alexa+
- [ ] Bee (Wearable AI)
- [ ] Ring
- [ ] Fire TV

The project does not claim a live Amazon Alexa device integration; its Alexa+-style interaction is the simulated experience described by the track brief.

## Mini-challenge selection

Confirm your actual Devpost selection before submitting. No AWS Builder or Open Source mini-challenge is claimed by this draft. If selecting AWS Builder, document the AWS service and its runtime use. If selecting Open Source, add the contribution URL, repository URL, GitHub username, and a description of the contribution.

## Repository

`https://github.com/25158074-alt/alexa-mcp-assistant`

Current repository visibility was verified as **public**. The brief accepts a public repository if a visible open-source license is included, or a private repository shared with `testing@devpost.com` and the listed Amazon reviewers. This repository must not be described as private. Confirm the repository has a valid, top-level license visible to GitHub before relying on the public-repository option; the bundled upstream MCP Skills license applies to those upstream files, not automatically to the entire project.

## Product feedback draft

### Which developer tools, APIs, and SDKs did you use and for what?

We used the official Model Context Protocol JavaScript SDK packages (`@modelcontextprotocol/client`, `@modelcontextprotocol/server`, `@modelcontextprotocol/node`, and `@modelcontextprotocol/express`) to implement a Streamable HTTP server and a client smoke test; Zod to define tool input validation; the project-managed OpenAI-compatible model endpoint for server-side next-step planning; MCP Extensions Agent Skills documentation and files for the Skill viewer; browser Web Speech APIs for optional dictation/speech synthesis; and GitHub Pages/Actions for the static frontend deployment.

### What worked well?

The official SDK provides clear capability registration, protocol negotiation, session transport, and client calls. A real SDK client test verifies MCP `2025-11-25`, tool discovery, simulator calls, and a resource read. Server-side planning keeps the model credential out of browser code, while the UI makes proposed tool arguments visible before state changes.

### What needs work?

GitHub Pages is static hosting and cannot run the MCP server or model proxy. A working publicly reachable agent therefore needs an additional HTTPS Node host, CORS/origin configuration, and secure server-side model credentials. Browser microphone APIs also vary across browsers. Before final submission, verify the hosted backend, published site, Pages-to-backend CORS, and model error paths in the exact judging environment.

### How was onboarding (zero to hello world)?

The package manager and official SDK expose the main server/client APIs, and an SDK smoke test gives a reproducible starting point. The first integration pass needed extra attention to host/origin checks for local and Pages clients and to the distinction between a static Pages artifact and a running backend. The local `pnpm dev` and `pnpm test:mcp` commands document the tested path.

### Would you build with these devices/services again?

**Yes—with a backend deployment plan.** The MCP SDK and managed model make a genuinely agentic tool-connected prototype practical, and approval UX is testable. For a public experience, pair static Pages with a separate secured HTTPS service; Pages alone is insufficient.

## Demo video checklist

Not yet recorded or published. Submission requires a publicly accessible YouTube or Vimeo video **under 3 minutes**, showing the project functioning on the device it was built for, with the video URL entered into the submission form. Do not include third-party trademarks or copyrighted music/media without permission.

Suggested sequence: (1) show the connected MCP server and negotiated protocol version, (2) ask a natural, non-scripted question about the sample calendar, (3) show the proposed tool and arguments and require approval, (4) inspect the actual MCP result and the agent's follow-up, (5) request a simulated home change and reject it or approve it, then show the updated simulator state, (6) disclose that calendar/home values are simulated and Pages itself is static. Use the working Node/Preview environment for live backend footage; don't imply a Pages-only static build has a backend.

## Before submission

- Verify the GitHub Pages deployment and repository license/visibility route.
- Decide public-with-license versus private-and-invited collaborators; do not assume the public repository meets the private invitation option.
- Confirm mini-challenges in Devpost rather than claiming them from tooling alone.
- If public live LLM/MCP service is expected, authorize and deploy an HTTPS Node backend, configure exact Pages CORS origins, and test it from the published domain.
- Record, publish, and link the sub-three-minute demo video.
- Replace this draft with final verified links and feedback before submitting.
