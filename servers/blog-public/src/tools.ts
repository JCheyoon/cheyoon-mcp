import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { loadPosts, type Lang, type Post } from "./posts.js";

export function registerTools(server: McpServer): void {
  server.registerTool(
    "list_posts",
    {
      description: "Returns blog posts without their body. Can be filtered by lang and category slug.",
      inputSchema: z.object({
        lang: z.enum(["ko", "en"]).optional().describe("ko or en. If omitted, no language filter."),
        category: z.string().optional().describe("category slug. If omitted, no category filter."),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ lang, category }) => {
      const result = listPosts(await loadPosts(), { lang, category });
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    },
  );
  server.registerTool(
    "get_post",
    {
      description: "Returns a blog post by lang and slug.",
      inputSchema: z.object({
        lang: z.enum(["ko", "en"]).describe("ko or en"),
        slug: z.string().describe("post slug"),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ lang, slug }) => {
      const result = getPost(await loadPosts(), lang, slug);
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    },
  );
  server.registerTool(
    "search_posts",
    {
      description:
        "Searches blog posts by exact substring (case-insensitive). No translation or transliteration. " +
        "A term may be written in Korean or English in a post. If nothing is found, " +
        "retry with the other language or spelling, or use list_posts to browse all posts.",
      inputSchema: z.object({
        query: z.string().min(1).max(100).describe("search query"),
        lang: z.enum(["ko", "en"]).optional().describe("ko or en. If omitted, no language filter."),
        limit: z.number().int().min(1).max(10).default(5).describe("maximum number of results to return"),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ query, lang, limit }) => {
      const result = searchPosts(await loadPosts(), query, lang, limit);
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    },
  );
}

export function listPosts(posts: Post[], filter: { lang?: Lang; category?: string }) {
  return posts
    .filter((post) => {
      if (filter.lang && post.lang !== filter.lang) return false;
      if (filter.category && post.category.slug !== filter.category) return false;
      return true;
    })
    .map((post) => ({
      slug: post.slug,
      lang: post.lang,
      title: post.title,
      url: post.url,
      description: post.description,
      category: post.category,
      tags: post.tags,
      publishedAt: post.publishedAt,
      updatedAt: post.updatedAt,
    }));
}

export function getPost(posts: Post[], lang: Lang, slug: string): Post {
  const post = posts.find((p) => p.lang === lang && p.slug === slug);
  if (!post) throw new Error(`Post not found: ${lang}/${slug}`);
  return post;
}

export function searchPosts(posts: Post[], query: string, lang: Lang | undefined, limit: number) {
  const lowerQuery = query.toLowerCase();
  const matches = (text: string) => text.toLowerCase().includes(lowerQuery);

  return posts
    .filter((post) => {
      if (lang && post.lang !== lang) return false;
      return (
        matches(post.title) || matches(post.description) || post.tags.some(matches) || matches(post.body)
      );
    })
    .slice(0, limit)
    .map((post) => ({
      slug: post.slug,
      lang: post.lang,
      title: post.title,
      url: post.url,
      description: post.description,
      snippet: makeSnippet(post, lowerQuery),
    }));
}

const SNIPPET_CONTEXT = 60;

function makeSnippet(post: Post, lowerQuery: string): string {
  const at = post.body.toLowerCase().indexOf(lowerQuery);
  if (at === -1) return post.body.slice(0, SNIPPET_CONTEXT * 2) + "...";
  const start = Math.max(0, at - SNIPPET_CONTEXT);
  const end = Math.min(post.body.length, at + lowerQuery.length + SNIPPET_CONTEXT);
  return (start > 0 ? "..." : "") + post.body.slice(start, end) + (end < post.body.length ? "..." : "");
}
