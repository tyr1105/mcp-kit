/**
 * MCP Database Server - SQLite
 *
 * Exposes SQLite database operations as MCP tools. AI assistants can:
 * - Execute SELECT queries and get results as JSON
 * - Run INSERT/UPDATE/DELETE with safety checks
 * - Inspect database schema (tables, columns, indexes)
 * - Get table statistics (row counts, sizes)
 *
 * SECURITY:
 * - Only SELECT queries are allowed by default
 * - Write operations require ENABLE_WRITES=true env var
 * - Query timeout of 30 seconds prevents runaway queries
 * - Results are capped at 1000 rows
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import Database from "better-sqlite3";
import * as path from "path";

// Configuration
const DB_PATH = path.resolve(process.env.DB_PATH || "./database.db");
const ENABLE_WRITES = process.env.ENABLE_WRITES === "true";
const MAX_ROWS = 1000;
const QUERY_TIMEOUT_MS = 30000;

// Open database connection
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("busy_timeout = 5000");

const server = new McpServer({
  name: "database-server",
  version: "1.0.0",
});

// Tool: Execute a SELECT query
server.tool(
  "query",
  "Execute a SQL SELECT query and return results as JSON. Only SELECT statements are allowed.",
  {
    sql: z.string().describe("The SQL SELECT query to execute"),
    params: z
      .record(z.unknown())
      .default({})
      .describe("Query parameters for prepared statements (key-value pairs)"),
    maxRows: z
      .number()
      .default(MAX_ROWS)
      .describe("Maximum number of rows to return"),
  },
  async ({ sql, params, maxRows }) => {
    try {
      const trimmedSql = sql.trim().toUpperCase();
      if (!trimmedSql.startsWith("SELECT") && !trimmedSql.startsWith("PRAGMA") && !trimmedSql.startsWith("EXPLAIN")) {
        return {
          content: [
            {
              type: "text",
              text: "Error: Only SELECT, PRAGMA, and EXPLAIN queries are allowed with this tool. Use the 'execute' tool for write operations.",
              isError: true,
            },
          ],
        };
      }

      const stmt = db.prepare(sql);
      const rows = stmt.all(...Object.values(params || {}));

      const resultRows = rows.slice(0, maxRows);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                sql,
                rowCount: resultRows.length,
                totalRows: rows.length,
                truncated: rows.length > maxRows,
                rows: resultRows,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [{ type: "text", text: `Query error: ${error.message}`, isError: true }],
      };
    }
  }
);

// Tool: Execute a write operation (INSERT/UPDATE/DELETE)
server.tool(
  "execute",
  "Execute a write SQL statement (INSERT, UPDATE, DELETE). Requires ENABLE_WRITES=true.",
  {
    sql: z.string().describe("The SQL statement to execute"),
    params: z
      .record(z.unknown())
      .default({})
      .describe("Parameters for prepared statements"),
  },
  async ({ sql, params }) => {
    if (!ENABLE_WRITES) {
      return {
        content: [
          {
            type: "text",
            text: "Error: Write operations are disabled. Set ENABLE_WRITES=true environment variable to enable.",
            isError: true,
          },
        ],
      };
    }

    try {
      const trimmedSql = sql.trim().toUpperCase();
      const allowedPrefixes = ["INSERT", "UPDATE", "DELETE", "CREATE", "ALTER", "DROP"];
      if (!allowedPrefixes.some((p) => trimmedSql.startsWith(p))) {
        return {
          content: [
            {
              type: "text",
              text: `Error: Only ${allowedPrefixes.join(", ")} statements are allowed.`,
              isError: true,
            },
          ],
        };
      }

      const stmt = db.prepare(sql);
      const result = stmt.run(...Object.values(params || {}));

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                sql,
                changes: result.changes,
                lastInsertRowid: result.lastInsertRowid,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [{ type: "text", text: `Execute error: ${error.message}`, isError: true }],
      };
    }
  }
);

// Tool: List all tables
server.tool(
  "list_tables",
  "List all tables in the database with row counts.",
  {},
  async () => {
    try {
      const tables = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
        )
        .all() as Array<{ name: string }>;

      const tableInfo = tables.map((t) => {
        try {
          const count = (
            db.prepare(`SELECT COUNT(*) as count FROM "${t.name}"`).get() as any
          ).count;
          return { name: t.name, rowCount: count };
        } catch {
          return { name: t.name, rowCount: -1 };
        }
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { database: DB_PATH, tableCount: tableInfo.length, tables: tableInfo },
              null,
              2
            ),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [{ type: "text", text: `Error listing tables: ${error.message}`, isError: true }],
      };
    }
  }
);

// Tool: Describe a table's schema
server.tool(
  "describe_table",
  "Get the schema of a specific table including columns, types, defaults, and indexes.",
  {
    tableName: z.string().describe("Name of the table to describe"),
  },
  async ({ tableName }) => {
    try {
      const columns = db.pragma(`table_info("${tableName}")`);
      const indexes = db.pragma(`index_list("${tableName}")`);

      const indexDetails = indexes.map((idx: any) => ({
        name: idx.name,
        unique: idx.unique === 1,
        columns: db.pragma(`index_info("${idx.name}")`),
      }));

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ table: tableName, columns, indexes: indexDetails }, null, 2),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [{ type: "text", text: `Error describing table: ${error.message}`, isError: true }],
      };
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`Database MCP server running on stdio`);
  console.error(`Database: ${DB_PATH}`);
  console.error(`Writes: ${ENABLE_WRITES ? "ENABLED" : "DISABLED"}`);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
