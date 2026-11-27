import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { clientIp, createRateLimiter, rateLimitKey } from "./rateLimit.js";

// 시간을 직접 움직이는 제한기
function setup() {
  let time = 0;
  const check = createRateLimiter(() => time);
  const allowedCount = (ip: string, tries: number) =>
    Array.from({ length: tries }, () => check(ip)).filter((result) => result.allowed).length;
  return { check, allowedCount, advance: (ms: number) => (time += ms) };
}

describe("rateLimit", () => {
  test("일반 IP는 1분에 30번까지고, 1분이 지나면 다시 센다", () => {
    const { check, allowedCount, advance } = setup();
    assert.equal(allowedCount("203.0.113.1", 40), 30);
    advance(20_000);
    assert.deepEqual(check("203.0.113.1"), { allowed: false, scope: "ip", retryAfterSeconds: 40 });
    advance(40_000);
    assert.equal(check("203.0.113.1").allowed, true);
  });

  test("Anthropic 대역은 1분에 60번까지다", () => {
    assert.equal(setup().allowedCount("160.79.104.10", 70), 60);
    assert.equal(setup().allowedCount("153.61.223.255", 70), 60);
    assert.equal(setup().allowedCount("160.79.112.1", 70), 30);
  });

  test("거절된 요청은 전체 횟수에 넣지 않는다", () => {
    const { allowedCount } = setup();
    assert.equal(allowedCount("203.0.113.1", 500), 30);
    assert.equal(allowedCount("203.0.113.2", 30), 30);
  });

  test("서버 전체는 1분에 100번까지다", () => {
    const { check, allowedCount } = setup();
    for (let i = 1; i <= 4; i++) allowedCount(`203.0.113.${i}`, 25);
    assert.deepEqual(check("203.0.113.9"), { allowed: false, scope: "total-minute", retryAfterSeconds: 60 });
  });

  test("서버 전체는 24시간에 3,000번까지다", () => {
    const { check, allowedCount, advance } = setup();
    let allowed = 0;
    for (let minute = 0; minute < 40; minute++) {
      for (let i = 1; i <= 4; i++) allowed += allowedCount(`203.0.113.${i}`, 25);
      advance(60_000);
    }
    assert.equal(allowed, 3_000);
    const result = check("203.0.113.9");
    assert.equal(result.allowed === false && result.scope, "total-day");
    advance(24 * 60 * 60_000);
    assert.equal(check("203.0.113.9").allowed, true);
  });

  test("IPv6는 /64를 하나로 센다", () => {
    assert.equal(rateLimitKey("2001:db8:1:2::1"), rateLimitKey("2001:0DB8:0001:0002:ffff:ffff:ffff:ffff"));
    assert.notEqual(rateLimitKey("2001:db8:1:2::1"), rateLimitKey("2001:db8:1:3::1"));
    assert.equal(rateLimitKey("::1"), "0:0:0:0::/64");
    assert.equal(rateLimitKey("::ffff:203.0.113.1"), "203.0.113.1");
    assert.equal(rateLimitKey("203.0.113.1"), "203.0.113.1");
  });

  test("CF-Connecting-IP가 IP 형식일 때만 쓴다", () => {
    assert.equal(clientIp("203.0.113.1", "127.0.0.1"), "203.0.113.1");
    assert.equal(clientIp("not-an-ip", "127.0.0.1"), "127.0.0.1");
    assert.equal(clientIp(undefined, undefined), "unknown");
  });
});
