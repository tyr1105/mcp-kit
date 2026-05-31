/**
 * MCP File Manager Server
 *
 * Exposes file system operations as MCP tools. AI assistants can:
 * - List files and directories
 * - Read file contents
 * - Write/create files
 * - Search for text patterns in files
 * - Get file metadata (size, dates, permissions)
 *
 * SECURITY NOTE: This server operates within the working directory.
 * All paths are sanitized to prevent directory traversal attacks.
 * Configure the allowed base directory via ALLOWED_DIR env var.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as fs from "fs/promises";
import * as path from "path";

// Configure the allowed base directory (defaults to current working directory)
const ALLOWED_DIR = path.resolve(process.env.ALLOWED_DIR || process.cwd());

/**
 * Sanitize a user-provided path to prevent directory traversal.
 * Resolves the path and ensures it stays within ALLOWED_DIR.
 */
function sanitizePath(inputPath: string): string {
  const resolved = path.resolve(ALLOWED_DIR, inputPath);
  if (!resolved.startsWith(ALLOWED_DIR)) {
    throw new Error(`Path traversal detected: ${inputPath} is outside allowed directory`);
  }
  return resolved;
}

/**
 * Format file size in human-readable format
 */
function formatSize(bytes: number): string {
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

const server = new McpServer({
  name: "file-manager",
  version: "1.0.0",
});

// Tool: List files in a directory
server.tool(
  "list_directory",
  "List files and subdirectories in a directory. Returns names, types, and sizes.",
  {
    dirPath: z
      .string()
      .default(".")
      .describe("Relative path to the directory to list (defaults to root)"),
    recursive: z
      .boolean()
      .default(false)
      .describe("Whether to list files recursively"),
  },
  async ({ dirPath, recursive }) => {
    try {
      const fullPath = sanitizePath(dirPath);
      const entries = await fs.readdir(fullPath, { withFileTypes: true, recursive });

      const results = entries.map((entry) => ({
        name: entry.name,
        type: entry.isDirectory() ? "directory" : "file",
        path: path.relative(ALLOWED_DIR, path.join(entry.parentPath || fullPath, entry.name)),
      }));

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                directory: dirPath,
                totalItems: results.length,
                items: results.slice(0, 200), // Limit output
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [{ type: "text", text: `Error listing directory: ${error.message}`, isError: true }],
      };
    }
  }
);

// Tool: Read file contents
server.tool(
  "read_file",
  "Read the contents of a file. Returns the text content.",
  {
    filePath: z.string().describe("Relative path to the file to read"),
    encoding: z
      .enum(["utf-8", "base64"])
      .default("utf-8")
      .describe("File encoding (use base64 for binary files)"),
  },
  async ({ filePath, encoding }) => {
    try {
      const fullPath = sanitizePath(filePath);
      const stats = await fs.stat(fullPath);

      if (stats.size > 5 * 1024 * 1024) {
        return {
          content: [
            {
              type: "text",
              text: `File too large: ${formatSize(stats.size)}. Maximum read size is 5MB.`,
              isError: true,
            },
          ],
        };
      }

      const content = await fs.readFile(fullPath, encoding as BufferEncoding);

      return {
        content: [
          {
            type: "text",
            text: content as string,
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [{ type: "text", text: `Error reading file: ${error.message}`, isError: true }],
      };
    }
  }
);

// Tool: Write file contents
server.tool(
  "write_file",
  "Write content to a file. Creates parent directories if needed.",
  {
    filePath: z.string().describe("Relative path for the file to write"),
    content: z.string().describe("The content to write to the file"),
    createDirs: z
      .boolean()
      .default(true)
      .describe("Whether to create parent directories if they do not exist"),
  },
  async ({ filePath, content, createDirs }) => {
    try {
      const fullPath = sanitizePath(filePath);

      if (createDirs) {
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
      }

      await fs.writeFile(fullPath, content, "utf-8");

      return {
        content: [
          {
            type: "text",
            text: `Successfully wrote ${content.length} characters to ${filePath}`,
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [{ type: "text", text: `Error writing file: ${error.message}`, isError: true }],
      };
    }
  }
);

// Tool: Search for text in files
server.tool(
  "search_files",
  "Search for a text pattern in files. Returns matching lines with context.",
  {
    pattern: z.string().describe("The text pattern to search for"),
    dirPath: z
      .string()
      .default(".")
      .describe("Directory to search in"),
    fileExtensions: z
      .array(z.string())
      .default([])
      .describe("File extensions to include (e.g., ['.ts', '.js']). Empty = all files."),
    maxResults: z.number().default(50).describe("Maximum number of matches to return"),
  },
  async ({ pattern, dirPath, fileExtensions, maxResults }) => {
    try {
      const fullPath = sanitizePath(dirPath);
      const matches: Array<{ file: string; line: number; content: string }> = [];

      async function searchDir(dir: string): Promise<void> {
        if (matches.length >= maxResults) return;

        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (matches.length >= maxResults) break;
          if (entry.name.startsWith(".") || entry.name === "node_modules") continue;

          const entryPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            await searchDir(entryPath);
          } else if (entry.isFile()) {
            if (
              fileExtensions.length > 0 &&
              !fileExtensions.some((ext) => entry.name.endsWith(ext))
            ) {
              continue;
            }
            try {
              const content = await fs.readFile(entryPath, "utf-8");
              const lines = content.split("\n");
              lines.forEach((line, index) => {
                if (matches.length < maxResults && line.includes(pattern)) {
                  matches.push({
                    file: path.relative(ALLOWED_DIR, entryPath),
                    line: index + 1,
                    content: line.trim().substring(0, 200),
                  });
                }
              });
            } catch {
              // Skip files that can't be read as text
            }
          }
        }
      }

      await searchDir(fullPath);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                pattern,
                totalMatches: matches.length,
                matches,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [{ type: "text", text: `Error searching files: ${error.message}`, isError: true }],
      };
    }
  }
);

// Tool: Get file metadata
server.tool(
  "file_info",
  "Get detailed metadata about a file or directory.",
  {
    filePath: z.string().describe("Relative path to the file or directory"),
  },
  async ({ filePath }) => {
    try {
      const fullPath = sanitizePath(filePath);
      const stats = await fs.stat(fullPath);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                path: filePath,
                type: stats.isDirectory() ? "directory" : stats.isFile() ? "file" : "other",
                size: formatSize(stats.size),
                sizeBytes: stats.size,
                created: stats.birthtime.toISOString(),
                modified: stats.mtime.toISOString(),
                permissions: stats.mode.toString(8).slice(-3),
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [{ type: "text", text: `Error getting file info: ${error.message}`, isError: true }],
      };
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`File Manager MCP server running on stdio`);
  console.error(`Allowed directory: ${ALLOWED_DIR}`);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
