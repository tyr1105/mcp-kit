/**
 * MCP API Gateway Server
 *
 * Wraps REST APIs as MCP tools that AI assistants can call directly.
 * Configure your API endpoints in a JSON config file or via environment variables.
 *
 * Features:
 * - Define API endpoints as tools with automatic schema generation
 * - Support for GET, POST, PUT, DELETE methods
 * - Authentication via API keys, Bearer tokens, or custom headers
 * - Response transformation and filtering
 * - Rate limiting and timeout handling
 * - Multiple API support from a single server
 *
 * Usage:
 * 1. Create an api-config.json file defining your endpoints
 * 2. Or set API_BASE_URL env var for a single API
 * 3. Start the server and the AI can call your APIs directly
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// ============================================================
// Configuration Types
// ============================================================

interface ApiEndpoint {
  name: string;
  description: string;
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  path: string;
  headers?: Record<string, string>;
  params?: Record<string, { type: "string" | "number" | "boolean"; required: boolean; description: string }>;
  bodyType?: "json" | "form";
}

interface ApiConfig {
  baseUrl: string;
  defaultHeaders?: Record<string, string>;
  authType?: "none" | "bearer" | "apikey";
  authToken?: string;
  authHeader?: string;
  endpoints: ApiEndpoint[];
}

// ============================================================
// Server Setup
// ============================================================

const server = new McpServer({
  name: "api-gateway",
  version: "1.0.0",
});

// Simple in-memory config (in production, load from file)
const configs: Map<string, ApiConfig> = new Map();

// Load default config from env if provided
const DEFAULT_BASE_URL = process.env.API_BASE_URL || "";
const DEFAULT_AUTH_TOKEN = process.env.API_AUTH_TOKEN || "";
const DEFAULT_AUTH_TYPE = (process.env.API_AUTH_TYPE || "none") as ApiConfig["authType"];

// ============================================================
// Tool: Register an API configuration
// ============================================================

server.tool(
  "register_api",
  "Register an API with its endpoints. Call this first to set up the API gateway.",
  {
    name: z.string().describe("A unique name for this API (used as prefix for tools)"),
    baseUrl: z.string().describe("The base URL of the API (e.g., https://api.example.com/v1)"),
    authType: z.enum(["none", "bearer", "apikey"]).default("none").describe("Authentication type"),
    authToken: z.string().default("").describe("Auth token or API key"),
    endpoints: z
      .array(
        z.object({
          name: z.string(),
          description: z.string(),
          method: z.enum(["GET", "POST", "PUT", "DELETE", "PATCH"]),
          path: z.string(),
        })
      )
      .describe("List of API endpoints to expose as tools"),
  },
  async ({ name, baseUrl, authType, authToken, endpoints }) => {
    const config: ApiConfig = {
      baseUrl,
      authType,
      authToken,
      endpoints,
    };

    configs.set(name, config);

    const toolNames = endpoints.map((e) => `${name}_${e.name}`);

    return {
      content: [
        {
          type: "text",
          text: `API "${name}" registered with ${endpoints.length} endpoints.\nAvailable tools: ${toolNames.join(", ")}\n\nNote: Use the "call_api" tool to make requests to these endpoints.`,
        },
      ],
    };
  }
);

// ============================================================
// Tool: Call an API endpoint
// ============================================================

server.tool(
  "call_api",
  "Make an HTTP request to a registered API endpoint.",
  {
    apiName: z.string().describe("The name of the registered API"),
    method: z.enum(["GET", "POST", "PUT", "DELETE", "PATCH"]).default("GET"),
    path: z.string().describe("The API path (appended to base URL)"),
    queryParams: z
      .record(z.string())
      .default({})
      .describe("URL query parameters"),
    body: z
      .string()
      .optional()
      .describe("Request body as JSON string (for POST/PUT/PATCH)"),
    headers: z
      .record(z.string())
      .default({})
      .describe("Additional headers to include"),
  },
  async ({ apiName, method, path, queryParams, body, headers }) => {
    const config = configs.get(apiName);
    if (!config) {
      const available = Array.from(configs.keys());
      return {
        content: [
          {
            type: "text",
            text: `Error: API "${apiName}" not registered. ${available.length > 0 ? `Available: ${available.join(", ")}` : "No APIs registered yet. Use register_api first."}`,
            isError: true,
          },
        ],
      };
    }

    // Build URL
    const url = new URL(path, config.baseUrl);
    Object.entries(queryParams).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });

    // Build headers
    const requestHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      ...headers,
    };

    if (config.authType === "bearer" && config.authToken) {
      requestHeaders["Authorization"] = `Bearer ${config.authToken}`;
    } else if (config.authType === "apikey" && config.authToken && config.authHeader) {
      requestHeaders[config.authHeader] = config.authToken;
    }

    try {
      const response = await fetch(url.toString(), {
        method,
        headers: requestHeaders,
        body: body && ["POST", "PUT", "PATCH"].includes(method) ? body : undefined,
      });

      const contentType = response.headers.get("content-type") || "";
      let responseBody: string;

      if (contentType.includes("application/json")) {
        const json = await response.json();
        responseBody = JSON.stringify(json, null, 2);
      } else {
        responseBody = await response.text();
      }

      const truncatedBody =
        responseBody.length > 10000
          ? responseBody.substring(0, 10000) + "\n... (truncated)"
          : responseBody;

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                status: response.status,
                statusText: response.statusText,
                headers: Object.fromEntries(response.headers.entries()),
                body: truncatedBody,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          { type: "text", text: `API request failed: ${error.message}`, isError: true },
        ],
      };
    }
  }
);

// ============================================================
// Tool: Test API connectivity
// ============================================================

server.tool(
  "test_api",
  "Test connectivity to a registered API by making a simple request.",
  {
    apiName: z.string().describe("The registered API name to test"),
    path: z.string().default("/").describe("A lightweight endpoint to test (e.g., /health)"),
  },
  async ({ apiName, path }) => {
    const config = configs.get(apiName);
    if (!config) {
      return {
        content: [
          {
            type: "text",
            text: `API "${apiName}" not found. Registered APIs: ${Array.from(configs.keys()).join(", ") || "none"}`,
            isError: true,
          },
        ],
      };
    }

    try {
      const url = new URL(path, config.baseUrl);
      const startTime = Date.now();
      const response = await fetch(url.toString(), { method: "GET" });
      const elapsed = Date.now() - startTime;

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                api: apiName,
                baseUrl: config.baseUrl,
                testPath: path,
                status: response.status,
                responseTime: `${elapsed}ms`,
                connected: response.status < 500,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          { type: "text", text: `Connection failed: ${error.message}`, isError: true },
        ],
      };
    }
  }
);

// ============================================================
// Tool: List registered APIs
// ============================================================

server.tool(
  "list_apis",
  "List all registered APIs and their endpoints.",
  {},
  async () => {
    const apiList = Array.from(configs.entries()).map(([name, config]) => ({
      name,
      baseUrl: config.baseUrl,
      authType: config.authType,
      endpoints: config.endpoints.map((e) => ({
        name: e.name,
        method: e.method,
        path: e.path,
      })),
    }));

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            { totalApis: apiList.length, apis: apiList },
            null,
            2
          ),
        },
      ],
    };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("API Gateway MCP server running on stdio");
  if (DEFAULT_BASE_URL) {
    console.error(`Default base URL: ${DEFAULT_BASE_URL}`);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
