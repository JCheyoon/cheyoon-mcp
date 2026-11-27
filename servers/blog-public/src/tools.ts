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
