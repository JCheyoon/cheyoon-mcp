const POSTS_URL = "https://jcheyoon.github.io/data/posts.json";
// 블로그 쪽 응답이 늦을 때 도구 호출이 오래 붙잡히지 않게 한다.
const FETCH_TIMEOUT_MS = 5_000;
const CACHE_TTL_MS = 5 * 60_000;
const RETRY_AFTER_FAILURE_MS = 60_000;

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
async function fetchPosts(): Promise<Post[]> {
  const res = await fetch(POSTS_URL, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`posts.json 응답 ${res.status}`);
  const data = (await res.json()) as { posts: Post[] };
  // 형식이 틀린 응답을 캐시에 담으면 캐시 시간 동안 모든 도구가 실패한다.
  if (!Array.isArray(data.posts)) throw new Error("posts.json에 posts 배열이 없습니다");
  return data.posts;
}

// posts.json을 메모리에 CACHE_TTL_MS 동안 둔다. 새 글은 그 시간(과 GitHub Pages 캐시)만큼 늦게 보인다.
// 동시에 온 요청은 한 번의 가져오기를 함께 기다린다.
export function createPostsLoader(fetcher: () => Promise<Post[]> = fetchPosts, now: () => number = Date.now) {
  let cached: Post[] | undefined;
  let freshUntil = 0;
  let pending: Promise<Post[]> | undefined;

  async function refresh(): Promise<Post[]> {
    try {
      cached = await fetcher();
      freshUntil = now() + CACHE_TTL_MS;
      return cached;
    } catch (error) {
      // 도구 안의 오류는 서버의 onerror로 오지 않아 여기서 남긴다. 요청 값은 들어가지 않는다.
      console.error(
        JSON.stringify({
          postsFetchFailed: error instanceof Error ? error.message : "unknown",
          servingStale: cached !== undefined,
        }),
      );
      if (!cached) throw error;
      // 이전 데이터를 돌려주고, 실패하는 동안 요청마다 다시 가져오지 않게 잠시 기다린다.
      freshUntil = now() + RETRY_AFTER_FAILURE_MS;
      return cached;
    }
  }

  return (): Promise<Post[]> => {
    if (cached && now() < freshUntil) return Promise.resolve(cached);
    pending ??= refresh().finally(() => (pending = undefined));
    return pending;
  };
}

export const loadPosts = createPostsLoader();
