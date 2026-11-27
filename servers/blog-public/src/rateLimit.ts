// IP당 1분에 60번까지. 질문 하나에 요청이 5~6번 나간다고 보고 정했다(추정).
// 커넥터 요청이 공유 IP에서 오는지 확인한 뒤 다시 정한다.
const LIMIT_PER_WINDOW = 60;
const WINDOW_MS = 60_000;

const counts = new Map<string, number>();
setInterval(() => counts.clear(), WINDOW_MS).unref();

export function isAllowed(ip: string): boolean {
  const count = (counts.get(ip) ?? 0) + 1;
  counts.set(ip, count);
  return count <= LIMIT_PER_WINDOW;
}
