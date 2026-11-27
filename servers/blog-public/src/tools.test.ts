import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Post } from "./posts.js";
import { getPost, listPosts, searchPosts } from "./tools.js";

// 블로그에 접속하지 않도록 가짜 글을 쓴다.
function fakePost(overrides: Partial<Post>): Post {
  return {
    slug: "sample",
    lang: "ko",
    url: "https://example.com/sample/",
    title: "제목",
    description: "설명",
    category: { slug: "frontend", name: "프론트엔드" },
    tags: [],
    publishedAt: "2026-01-01",
    updatedAt: null,
    translations: {},
    body: "본문",
    ...overrides,
  };
}

describe("listPosts", () => {
  const posts = [
    fakePost({ slug: "a", lang: "ko" }),
    fakePost({ slug: "b", lang: "en", category: { slug: "backend", name: "Backend" } }),
  ];

  test("조건이 없으면 모두 돌려주고 본문은 뺀다", () => {
    const result = listPosts(posts, {});
    assert.deepEqual(
      result.map((post) => post.slug),
      ["a", "b"],
    );
    assert.ok(result.every((post) => !("body" in post)));
  });

  test("언어로 거른다", () => {
    assert.deepEqual(
      listPosts(posts, { lang: "en" }).map((post) => post.slug),
      ["b"],
    );
  });

  test("카테고리는 slug가 정확히 같아야 한다", () => {
    assert.deepEqual(
      listPosts(posts, { category: "backend" }).map((post) => post.slug),
      ["b"],
    );
    assert.deepEqual(listPosts(posts, { category: "back" }), []);
  });
});

describe("getPost", () => {
  const posts = [
    fakePost({ lang: "ko", body: "한국어 본문" }),
    fakePost({ lang: "en", body: "English body" }),
  ];

  test("slug와 언어가 모두 같은 글을 본문까지 돌려준다", () => {
    assert.equal(getPost(posts, "en", "sample").body, "English body");
  });

  test("없으면 오류를 던진다", () => {
    assert.throws(() => getPost(posts, "ko", "nope"), /Post not found: ko\/nope/);
  });
});

describe("searchPosts", () => {
  test("제목, 설명, 태그, 본문을 대소문자 구분 없이 찾는다", () => {
    const posts = [
      fakePost({ slug: "title", title: "Astro" }),
      fakePost({ slug: "description", description: "astro" }),
      fakePost({ slug: "tag", tags: ["ASTRO"] }),
      fakePost({ slug: "body", body: "Astro" }),
      fakePost({ slug: "none" }),
    ];
    assert.deepEqual(
      searchPosts(posts, "aStRo", undefined, 10).map((post) => post.slug),
      ["title", "description", "tag", "body"],
    );
  });

  test("언어 필터는 어디에서 일치하든 적용된다", () => {
    const posts = [
      fakePost({ lang: "ko", title: "astro" }),
      fakePost({ lang: "ko", description: "astro" }),
      fakePost({ lang: "ko", tags: ["astro"] }),
      fakePost({ lang: "ko", body: "astro" }),
    ];
    assert.deepEqual(searchPosts(posts, "astro", "en", 10), []);
  });

  test("limit개까지만 돌려주고 본문은 뺀다", () => {
    const posts = [fakePost({ slug: "a" }), fakePost({ slug: "b" }), fakePost({ slug: "c" })];
    const result = searchPosts(posts, "본문", undefined, 2);
    assert.deepEqual(
      result.map((post) => post.slug),
      ["a", "b"],
    );
    assert.ok(result.every((post) => !("body" in post)));
  });
});

describe("snippet", () => {
  const snippetOf = (body: string, title = "제목") =>
    searchPosts([fakePost({ title, body })], "astro", undefined, 1)[0]?.snippet;

  test("검색어 앞뒤 60자를 자르고 잘린 쪽에 ...를 붙인다", () => {
    const body = "a".repeat(100) + "Astro" + "b".repeat(100);
    assert.equal(snippetOf(body), "..." + "a".repeat(60) + "Astro" + "b".repeat(60) + "...");
  });

  test("잘리지 않으면 ...를 붙이지 않는다", () => {
    assert.equal(snippetOf("Astro로 옮겼다"), "Astro로 옮겼다");
  });

  test("본문에 검색어가 없으면 본문 앞 120자를 돌려준다", () => {
    assert.equal(snippetOf("c".repeat(200), "astro"), "c".repeat(120) + "...");
  });
});
