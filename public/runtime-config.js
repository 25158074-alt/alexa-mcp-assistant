// Public, non-secret runtime settings. GitHub Pages alone cannot run the MCP or LLM backend.
// Set this to an authorized HTTPS Node backend origin; never place API keys here.
globalThis.ALEXA_RUNTIME_CONFIG = Object.freeze({ backendOrigin: '' });
