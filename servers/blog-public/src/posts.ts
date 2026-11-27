const POSTS_URL = "https://jcheyoon.github.io/data/posts.json";
// 블로그 쪽 응답이 늦을 때 도구 호출이 오래 붙잡히지 않게 한다.
const FETCH_TIMEOUT_MS = 5_000;

export type Lang = "ko" | "en";
export type Category = { slug: string; name: string };

export interface Post {
  slug: string;
  lang: Lang;
  url: string;
  title: string;
  description: string;
  category: Category;
  tags: string[];
  publishedAt: string;
  updatedAt: string | null;
  translations: Partial<Record<Lang, string>>;
  body: string;
}
// 글을 따로 보관하지 않고 도구를 부를 때마다 블로그의 posts.json을 받아 온다.
// 그래서 새 글을 발행하면 이 서버를 다시 배포하지 않아도 반영된다(GitHub Pages 캐시만큼 늦을 수 있다).
export async function loadPosts(): Promise<Post[]> {
  const res = await fetch(POSTS_URL, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`posts.json 응답 ${res.status}`);
  const data = (await res.json()) as { posts: Post[] };
  return data.posts;
}
