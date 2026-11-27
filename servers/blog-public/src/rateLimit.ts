import { BlockList, isIP, isIPv4 } from "node:net";

// 횟수는 메모리에만 있어서 서버가 재시작하거나 잠들었다 깨면 처음부터 다시 센다.
// 분당 값은 측정이 아니라 판단으로 정했다. 질문 하나에 요청이 5~6번 나간다고 본다(추정).
const IP_PER_MINUTE = 30;
// Claude 커넥터 사용자는 Anthropic의 IP를 함께 쓰므로 더 준다.
const ANTHROPIC_IP_PER_MINUTE = 60;
const TOTAL_PER_MINUTE = 100;
// 월 트래픽(Render 무료 5GB) 때문에 둔다. 가장 큰 응답(get_post, 약 9KB)만 와도 30일에 약 0.84GB다.
const TOTAL_PER_DAY = 3_000;

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

// Anthropic이 MCP 도구를 호출할 때 쓰는 IPv4 대역. 허용 목록이 아니라 한도를 더 주는 용도다.
// https://platform.claude.com/docs/en/api/ip-addresses
const anthropic = new BlockList();
anthropic.addSubnet("160.79.104.0", 21);
anthropic.addSubnet("153.61.208.0", 20);

// IPv6는 한 사용자가 /64 안에서 주소를 얼마든지 바꿀 수 있어 앞 64비트를 하나로 센다.
export function rateLimitKey(ip: string): string {
  const mapped = /^::ffff:([\d.]+)$/i.exec(ip)?.[1];
  if (mapped && isIPv4(mapped)) return mapped;
  if (isIP(ip) !== 6) return ip;
  // URL은 IPv6를 같은 표기(소문자, 앞의 0 생략, ::)로 바꿔 준다.
  const [head = "", tail] = new URL(`http://[${ip.split("%")[0]}]`).hostname.slice(1, -1).split("::");
  const groups = head ? head.split(":") : [];
  if (tail !== undefined) {
    const rest = tail ? tail.split(":") : [];
    groups.push(...Array<string>(8 - groups.length - rest.length).fill("0"), ...rest);
  }
  return `${groups.slice(0, 4).join(":")}::/64`;
}

// Render 앞단(Cloudflare)은 실제 클라이언트 IP를 CF-Connecting-IP에 담는다. 2026-11-27 배포 서버에서
// 확인했을 때 클라이언트가 이 헤더를 넣으면 서버에 닿기 전에 403이었다. X-Forwarded-For는 앞에 넣은 값이
// 그대로 남아 쓰지 않는다. 이 앞단이 없는 곳으로 옮기면 이 헤더는 꾸밀 수 있으니 다시 확인해야 한다.
export function clientIp(header: string | string[] | undefined, remoteAddress: string | undefined): string {
  if (typeof header === "string" && isIP(header)) return header;
  return remoteAddress ?? "unknown";
}

export type LimitScope = "ip" | "total-minute" | "total-day";
export type LimitResult =
  { allowed: true } | { allowed: false; scope: LimitScope; retryAfterSeconds: number };

export function createRateLimiter(now: () => number = Date.now) {
  const perIp = new Map<string, number>();
  let minuteStart = now();
  let dayStart = minuteStart;
  let minuteTotal = 0;
  let dayTotal = 0;

  return (ip: string): LimitResult => {
    const time = now();
    if (time - minuteStart >= MINUTE_MS) {
      minuteStart = time;
      minuteTotal = 0;
      perIp.clear();
    }
    if (time - dayStart >= DAY_MS) {
      dayStart = time;
      dayTotal = 0;
    }

    const reject = (scope: LimitScope, until: number): LimitResult => ({
      allowed: false,
      scope,
      retryAfterSeconds: Math.ceil((until - time) / 1000),
    });
    // 전체 한도를 먼저 봐서, 다 찬 뒤에는 IP 목록이 늘지 않게 한다.
    if (dayTotal >= TOTAL_PER_DAY) return reject("total-day", dayStart + DAY_MS);
    if (minuteTotal >= TOTAL_PER_MINUTE) return reject("total-minute", minuteStart + MINUTE_MS);

    const key = rateLimitKey(ip);
    const limit = isIPv4(key) && anthropic.check(key) ? ANTHROPIC_IP_PER_MINUTE : IP_PER_MINUTE;
    const count = perIp.get(key) ?? 0;
    if (count >= limit) return reject("ip", minuteStart + MINUTE_MS);

    // 통과한 요청만 전체 횟수에 넣는다. 한 IP가 거절당한 요청으로 전체 한도를 채우지 못한다.
    perIp.set(key, count + 1);
    minuteTotal++;
    dayTotal++;
    return { allowed: true };
  };
}
