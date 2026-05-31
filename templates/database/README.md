# Database MCP Server (SQLite)

MCP server for SQLite database operations.

## Tools

| Tool | Description |
|------|-------------|
| query | Execute SELECT queries and get JSON results |
| execute | Run INSERT/UPDATE/DELETE (requires ENABLE_WRITES=true) |
| list_tables | List all tables with row counts |
| describe_table | Get table schema, columns, and indexes |

## Security Features

- Only SELECT queries allowed by default
- Write operations require explicit ENABLE_WRITES env var
- Results capped at 1000 rows
- Prepared statement support for safe parameterized queries

## Setup

```bash
npm install
npm run build

# Read-only mode (default)
npm start

# Read-write mode
DB_PATH=./mydata.db ENABLE_WRITES=true npm start
```

## Claude Desktop Config

```json
{
  "mcpServers": {
    "database": {
      "command": "node",
      "args": ["/path/to/mcp-database/dist/index.js"],
      "env": {
        "DB_PATH": "/path/to/your/database.db"
      }
    }
  }
}
```
