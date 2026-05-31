/**
 * MCP Starter Server - A minimal MCP server with one example tool.
 *
 * This template shows the bare minimum needed to create an MCP server
 * that exposes a tool to AI clients like Claude Desktop or Cursor.
 *
 * MCP Protocol Basics:
 * - Servers expose "tools" that AI models can call
 * - Each tool has a name, description, and input schema (Zod)
 * - The server communicates via stdio (stdin/stdout) by default
 * - Clients discover available tools automatically via the protocol
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// Create a new MCP server instance
// The name and version identify your server to clients
const server = new McpServer({
  name: "starter-server",
  version: "1.0.0",
});

// Register a tool that the AI can call
// Each tool needs:
// 1. A unique name (snake_case convention)
// 2. A description that helps the AI understand when to use it
// 3. A Zod schema defining the expected inputs
// 4. An async handler function that returns the result
server.tool(
  "greet",
  "Generate a personalized greeting message",
  {
    name: z.string().describe("The name of the person to greet"),
    language: z
      .enum(["en", "es", "fr", "de", "ja", "zh"])
      .default("en")
      .describe("Language code for the greeting"),
    formal: z
      .boolean()
      .default(false)
      .describe("Whether to use a formal greeting style"),
  },
  async ({ name, language, formal }) => {
    const greetings: Record<string, { casual: string; formal: string }> = {
      en: { casual: "Hello", formal: "Good day" },
      es: { casual: "Hola", formal: "Buenos dias" },
      fr: { casual: "Salut", formal: "Bonjour" },
      de: { casual: "Hallo", formal: "Guten Tag" },
      ja: { casual: "Yaho", formal: "Konnichiwa" },
      zh: { casual: "Ni hao", formal: "Nin hao" },
    };

    const lang = greetings[language] || greetings.en;
    const greeting = formal ? lang.formal : lang.casual;

    return {
      content: [
        {
          type: "text",
          text: `${greeting}, ${name}!`,
        },
      ],
    };
  }
);

// Register a second tool to demonstrate different return types
server.tool(
  "calculate",
  "Perform a basic arithmetic calculation",
  {
    expression: z
      .string()
      .describe("A math expression to evaluate (e.g., '2 + 3 * 4')"),
  },
  async ({ expression }) => {
    // Validate the expression contains only safe characters
    if (!/^[0-9+\-*/().\s]+$/.test(expression)) {
      return {
        content: [
          {
            type: "text",
            text: "Error: Expression contains invalid characters. Only numbers and +,-,*,/,(,) are allowed.",
            isError: true,
          },
        ],
      };
    }

    try {
      // Safe evaluation using Function constructor (no eval)
      const result = new Function(`return (${expression})`)();

      if (typeof result !== "number" || !isFinite(result)) {
        throw new Error("Invalid result");
      }

      return {
        content: [
          {
            type: "text",
            text: `${expression} = ${result}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error evaluating expression: ${expression}`,
            isError: true,
          },
        ],
      };
    }
  }
);

// Start the server using stdio transport
// This is the standard transport for local MCP servers
// Claude Desktop and other clients launch your server as a subprocess
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Starter MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
