import assert from "node:assert/strict";
import { beforeEach, describe, mock, test } from "node:test";
import { createPostsLoader, type Post } from "./posts.js";

const MINUTE = 60_000;
const postsOf = (slug: string) => [{ slug } as Post];

// 가져오기 결과를 순서대로 정해 두고, 시간을 직접 움직인다.
function setup(...results: (Post[] | Error)[]) {
  let time = 0;
  let calls = 0;
  const load = createPostsLoader(
    async () => {
      const result = results[calls++];
      if (!result || result instanceof Error) throw result ?? new Error("no more results");
      return result;
    },
    () => time,
  );
  return { load, calls: () => calls, advance: (ms: number) => (time += ms) };
}

describe("createPostsLoader", () => {
  beforeEach(() => {
    mock.method(console, "error", () => {});
  });

  test("5분 동안은 다시 가져오지 않는다", async () => {
    const { load, calls, advance } = setup(postsOf("old"), postsOf("new"));
    await load();
    advance(5 * MINUTE - 1);
    assert.equal((await load())[0]?.slug, "old");
    assert.equal(calls(), 1);
    advance(1);
    assert.equal((await load())[0]?.slug, "new");
    assert.equal(calls(), 2);
  });

  test("동시에 온 요청은 한 번만 가져온다", async () => {
    const { load, calls } = setup(postsOf("a"));
    await Promise.all([load(), load(), load()]);
    assert.equal(calls(), 1);
  });

  test("갱신에 실패하면 이전 데이터를 쓰고 1분 뒤에 다시 시도한다", async () => {
    const { load, calls, advance } = setup(postsOf("old"), new Error("down"), postsOf("new"));
    await load();
    advance(5 * MINUTE);
    assert.equal((await load())[0]?.slug, "old");
    advance(MINUTE - 1);
    await load();
    assert.equal(calls(), 2);
    advance(1);
    assert.equal((await load())[0]?.slug, "new");
  });

  test("처음부터 실패하면 오류를 던지고, 다음 요청에서 다시 시도한다", async () => {
    const { load } = setup(new Error("down"), postsOf("a"));
    await assert.rejects(load(), /down/);
    assert.equal((await load())[0]?.slug, "a");
  });
});
