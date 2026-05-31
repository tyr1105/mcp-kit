# API Gateway MCP Server

Wrap any REST API as MCP tools that AI assistants can call directly.

## Tools

| Tool | Description |
|------|-------------|
| register_api | Register an API with its endpoints |
| call_api | Make HTTP requests to registered APIs |
| test_api | Test API connectivity |
| list_apis | List all registered APIs |

## Features

- Dynamic API registration at runtime
- Support for GET, POST, PUT, DELETE, PATCH
- Bearer token and API key authentication
- Automatic JSON response formatting
- Request/response truncation for safety

## Setup

```bash
npm install
npm run build
npm start
```

## Environment Variables

- `API_BASE_URL` - Default API base URL
- `API_AUTH_TOKEN` - Default authentication token
- `API_AUTH_TYPE` - Auth type: none, bearer, or apikey

## Claude Desktop Config

```json
{
  "mcpServers": {
    "api-gateway": {
      "command": "node",
      "args": ["/path/to/mcp-api-gateway/dist/index.js"],
      "env": {
        "API_BASE_URL": "https://api.example.com/v1",
        "API_AUTH_TOKEN": "your-token-here",
        "API_AUTH_TYPE": "bearer"
      }
    }
  }
}
```

## Example: Register and Use an API

The AI can register APIs dynamically:

1. Call `register_api` with your API details
2. Use `call_api` to make requests
3. Use `list_apis` to see what's available
