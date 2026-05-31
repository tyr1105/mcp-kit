# Starter MCP Server

A minimal MCP server template with two example tools.

## What This Teaches

- How to create an MCP server instance
- How to register tools with Zod schemas
- How to handle errors and return results
- How to start the server with stdio transport

## Setup

```bash
npm install
npm run build
npm start
```

## Using with Claude Desktop

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "starter": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-starter/dist/index.js"]
    }
  }
}
```

## Adding Your Own Tools

Copy this template and modify the `server.tool()` calls. Each tool needs:
1. A unique name
2. A description (be specific - the AI uses this to decide when to call your tool)
3. A Zod schema for inputs
4. An async handler that returns `{ content: [{ type: "text", text: "..." }] }`
