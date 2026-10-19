#!/usr/bin/env node

/**
 * TimeTree MCP Server – entry point.
 *
 * This file is the executable entry point for the `timetree-mcp`
 * command.  It boots the MCP server over a stdio transport so it can
 * be used by any MCP-compatible client (Claude Desktop, MCP Inspector,
 * custom clients, etc.).
 *
 * Configuration:
 *  - TIMETREE_BASE_URL   – override the TimeTree base URL (default: https://timetree.org)
 *  - TIMETREE_TIMEOUT    – request timeout in ms (default: 30000)
 *  - TIMETREE_USER_AGENT – User-Agent header (default: timetree-mcp/0.1.0)
 *
 * Usage:
 *   node dist/index.js                 # run directly
 *   npx timetree-mcp                   # via npx (after global install)
 *   # or in an MCP client config:
 *   { "mcpServers": { "timetree": { "command": "node", "args": ["dist/index.js"] } } }
 */

import { startServer } from './server.js';

async function main(): Promise<void> {
  // Catch unhandled rejections so the process does not crash silently.
  process.on('unhandledRejection', (reason) => {
    console.error('[timetree-mcp] Unhandled rejection:', reason);
  });
  process.on('uncaughtException', (err) => {
    console.error('[timetree-mcp] Uncaught exception:', err);
    process.exit(1);
  });

  await startServer();
}

main().catch((err) => {
  console.error('[timetree-mcp] Fatal error during startup:', err);
  process.exit(1);
});
