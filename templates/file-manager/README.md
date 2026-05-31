# File Manager MCP Server

MCP server that exposes file system operations as AI-callable tools.

## Tools

| Tool | Description |
|------|-------------|
| list_directory | List files and subdirectories |
| read_file | Read file contents (text or base64) |
| write_file | Write content to files |
| search_files | Search for text patterns across files |
| file_info | Get file metadata (size, dates, permissions) |

## Security

- All paths are sandboxed to a configurable base directory
- Path traversal attacks are prevented
- File read size is capped at 5MB
- Set `ALLOWED_DIR` env var to control the root directory

## Setup

```bash
npm install
npm run build
npm start
```

## Configuration

Set the allowed directory via environment variable:

```bash
ALLOWED_DIR=/path/to/project npm start
```

## Claude Desktop Config

```json
{
  "mcpServers": {
    "file-manager": {
      "command": "node",
      "args": ["/path/to/mcp-file-manager/dist/index.js"],
      "env": {
        "ALLOWED_DIR": "/path/to/your/project"
      }
    }
  }
}
```
