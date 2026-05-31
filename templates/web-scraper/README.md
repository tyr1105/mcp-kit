# Web Scraper MCP Server

Fetch, extract, and analyze web content via MCP tools.

## Tools

| Tool | Description |
|------|-------------|
| fetch_page | Fetch a page and extract clean text |
| get_metadata | Get page metadata (title, OG tags, etc.) |
| extract_links | Extract all links from a page |
| extract_elements | Extract specific HTML elements by tag |

## Features

- No external browser dependencies (uses Node.js fetch)
- Built-in rate limiting (500ms between requests)
- Smart text extraction (removes nav, footer, scripts, styles)
- Relative URL resolution for links
- Response truncation for safety

## Setup

```bash
npm install
npm run build
npm start
```

## Claude Desktop Config

```json
{
  "mcpServers": {
    "web-scraper": {
      "command": "node",
      "args": ["/path/to/mcp-web-scraper/dist/index.js"]
    }
  }
}
```
