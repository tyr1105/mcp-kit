# MCP Kit - Build MCP Servers in Minutes

Production-ready MCP server templates for the Model Context Protocol.

Stop reading docs and writing boilerplate. MCP Kit gives you 5 battle-tested server templates so you can ship your MCP integration today.

## What You Get

| Template | Description | Use Case |
|----------|-------------|----------|
| Starter | Minimal server with one tool | Learning MCP, quick prototyping |
| File Manager | Read/write/search files via MCP | AI assistants that need filesystem access |
| Database | Query SQLite via MCP | AI-powered data analysis |
| API Gateway | Wrap any REST API as MCP tools | Connect AI to external services |
| Web Scraper | Fetch and extract web content | AI web research, content analysis |

## Features

- TypeScript-first - Full type safety with the official MCP SDK
- Stdio and SSE transports - Works with Claude Desktop, Cursor, and any MCP client
- Error handling - Production-grade error patterns baked in
- Tool schemas - Zod-validated inputs for every tool
- Copy-paste ready - Each template runs with npm install and npm start
- Well-documented - Every file has inline comments explaining the MCP protocol

## Quick Start

```bash
cp -r templates/starter my-mcp-server
cd my-mcp-server
npm install
npm start
```

## Pricing

- Personal use: Free (MIT license)  
- Commercial license + priority support: $49 on Gumroad

## Requirements

- Node.js 18+
- TypeScript 5+
- @modelcontextprotocol/sdk

## License

MIT for personal use. Purchase a commercial license for team/commercial projects.
