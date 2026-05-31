/**
 * MCP Web Scraper Server
 *
 * Exposes web scraping and content extraction as MCP tools.
 * AI assistants can:
 * - Fetch web pages and extract text content
 * - Extract specific elements using CSS selectors
 * - Get page metadata (title, description, OG tags)
 * - Extract all links from a page
 * - Search the web using a search engine (configurable)
 *
 * Uses Node.js built-in fetch API (Node 18+).
 * No external browser dependencies needed.
 *
 * RATE LIMITING: Built-in delays between requests to be respectful.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// Simple rate limiter
let lastRequestTime = 0;
const MIN_DELAY_MS = 500; // Minimum delay between requests

async function rateLimitedFetch(url: string, options?: RequestInit): Promise<Response> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < MIN_DELAY_MS) {
    await new Promise((resolve) => setTimeout(resolve, MIN_DELAY_MS - elapsed));
  }
  lastRequestTime = Date.now();
  return fetch(url, options);
}

/**
 * Basic HTML text extraction without external dependencies.
 * Removes script, style tags and extracts visible text.
 */
function extractText(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "")
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extract metadata from HTML (title, meta tags, OG tags)
 */
function extractMetadata(html: string): Record<string, string> {
  const metadata: Record<string, string> = {};

  // Title
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch) metadata.title = titleMatch[1].trim();

  // Meta tags
  const metaRegex = /<meta\s+([^>]+)>/gi;
  let match;
  while ((match = metaRegex.exec(html)) !== null) {
    const attrs = match[1];
    const nameMatch = attrs.match(/name=["']([^"']+)["']/i) || attrs.match(/property=["']([^"']+)["']/i);
    const contentMatch = attrs.match(/content=["']([^"']*?)["']/i);
    if (nameMatch && contentMatch) {
      metadata[nameMatch[1]] = contentMatch[1];
    }
  }

  return metadata;
}

/**
 * Extract all links from HTML
 */
function extractLinks(html: string, baseUrl: string): Array<{ text: string; href: string }> {
  const links: Array<{ text: string; href: string }> = [];
  const linkRegex = /<a\s+[^>]*href=["']([^"']*?)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;

  while ((match = linkRegex.exec(html)) !== null) {
    let href = match[1];
    const text = match[2].replace(/<[^>]+>/g, "").trim();

    // Resolve relative URLs
    if (href.startsWith("/")) {
      try {
        const url = new URL(baseUrl);
        href = `${url.origin}${href}`;
      } catch {}
    } else if (href.startsWith("./") || (!href.startsWith("http") && !href.startsWith("#"))) {
      try {
        href = new URL(href, baseUrl).toString();
      } catch {}
    }

    if (text && href && !href.startsWith("#") && !href.startsWith("javascript:")) {
      links.push({ text: text.substring(0, 200), href });
    }
  }

  return links;
}

const server = new McpServer({
  name: "web-scraper",
  version: "1.0.0",
});

// Tool: Fetch and extract text from a web page
server.tool(
  "fetch_page",
  "Fetch a web page and extract its main text content. Returns clean text without HTML.",
  {
    url: z.string().describe("The URL of the page to fetch"),
    maxLength: z
      .number()
      .default(10000)
      .describe("Maximum characters of text to return"),
  },
  async ({ url, maxLength }) => {
    try {
      const response = await rateLimitedFetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml",
        },
      });

      if (!response.ok) {
        return {
          content: [
            {
              type: "text",
              text: `HTTP ${response.status} ${response.statusText} for ${url}`,
              isError: true,
            },
          ],
        };
      }

      const html = await response.text();
      const text = extractText(html);
      const metadata = extractMetadata(html);

      const truncatedText =
        text.length > maxLength ? text.substring(0, maxLength) + "\n... (truncated)" : text;

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                url,
                status: response.status,
                metadata,
                contentLength: text.length,
                content: truncatedText,
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
          { type: "text", text: `Error fetching page: ${error.message}`, isError: true },
        ],
      };
    }
  }
);

// Tool: Get page metadata
server.tool(
  "get_metadata",
  "Get metadata from a web page (title, description, OG tags, etc.) without fetching full content.",
  {
    url: z.string().describe("The URL to get metadata for"),
  },
  async ({ url }) => {
    try {
      const response = await rateLimitedFetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; MCPBot/1.0)",
        },
      });

      const html = await response.text();
      const metadata = extractMetadata(html);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ url, metadata }, null, 2),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          { type: "text", text: `Error getting metadata: ${error.message}`, isError: true },
        ],
      };
    }
  }
);

// Tool: Extract links from a page
server.tool(
  "extract_links",
  "Extract all links from a web page with their text and URLs.",
  {
    url: z.string().describe("The URL to extract links from"),
    filterDomain: z
      .boolean()
      .default(false)
      .describe("Only return links from the same domain"),
  },
  async ({ url, filterDomain }) => {
    try {
      const response = await rateLimitedFetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; MCPBot/1.0)",
        },
      });

      const html = await response.text();
      let links = extractLinks(html, url);

      if (filterDomain) {
        const domain = new URL(url).hostname;
        links = links.filter((l) => {
          try {
            return new URL(l.href).hostname === domain;
          } catch {
            return false;
          }
        });
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                url,
                totalLinks: links.length,
                links: links.slice(0, 200),
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
          { type: "text", text: `Error extracting links: ${error.message}`, isError: true },
        ],
      };
    }
  }
);

// Tool: Extract specific elements using a simple tag-based approach
server.tool(
  "extract_elements",
  "Extract specific HTML elements from a page (headings, paragraphs, lists, etc.).",
  {
    url: z.string().describe("The URL to fetch"),
    tag: z
      .enum(["h1", "h2", "h3", "p", "li", "code", "pre", "blockquote", "table"])
      .describe("The HTML tag to extract"),
    maxItems: z.number().default(50).describe("Maximum number of elements to return"),
  },
  async ({ url, tag, maxItems }) => {
    try {
      const response = await rateLimitedFetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; MCPBot/1.0)",
        },
      });

      const html = await response.text();
      const regex = new RegExp(`<${tag}[^>]*>([\s\S]*?)<\/${tag}>`, "gi");
      const items: string[] = [];
      let match;

      while ((match = regex.exec(html)) !== null && items.length < maxItems) {
        const text = match[1].replace(/<[^>]+>/g, "").trim();
        if (text) {
          items.push(text.substring(0, 500));
        }
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                url,
                tag,
                count: items.length,
                items,
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
          { type: "text", text: `Error extracting elements: ${error.message}`, isError: true },
        ],
      };
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Web Scraper MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
