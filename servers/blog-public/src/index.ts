import { createServer, type ServerResponse } from "node:http";
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { originValidation, toNodeHandler } from "@modelcontextprotocol/node";
import { clientIp, createRateLimiter, type LimitScope } from "./rateLimit.js";
import { registerTools } from "./tools.js";

const PORT = Number(process.env.PORT ?? 3000);
// 로컬에서는 이 컴퓨터에서만 접속을 받는다. 배포 환경에서는 HOST로 바꾼다.
const HOST = process.env.HOST ?? "127.0.0.1";
const MCP_PATH = "/mcp";
// MCP 요청은 작은 JSON뿐이라 SDK 기본값(4 MiB)보다 훨씬 작게 잡는다.
const MAX_BODY_BYTES = 64 * 1024;

// SDK의 오류 메시지에는 요청 본문의 값이 섞일 수 있다. 메시지는 버리고 거절 사유 코드나 코드 위치만 남긴다.
function logError(error: Error): void {
  const reason = /^Rejected inbound request \(([a-z-]+)\)/.exec(error.message)?.[1];
  const frames = error.stack?.split(error.message)[1]?.trim().split("\n");
  console.error(JSON.stringify(reason ? { rejected: reason } : { error: error.name, at: frames }));
}

// 클라이언트마다 지원하는 MCP 버전이 달라서, 최신(2026-07-28) 방식과 initialize를 보내는
// 이전(~2025-11-25) 방식을 모두 받는다. SDK 기본값(legacy: "stateless")이다.
const handler = createMcpHandler(
  () => {
    const server = new McpServer({ name: "blog-public", version: "0.1.0" });
    registerTools(server);
    return server;
  },
  { maxRequestBodySize: MAX_BODY_BYTES, onerror: logError },
);
const nodeHandler = toNodeHandler(handler, { maxRequestBodySize: MAX_BODY_BYTES, onerror: logError });

// 브라우저가 아닌 MCP 클라이언트는 Origin을 보내지 않는다. Origin이 붙은 요청(브라우저)은 모두 막는다.
const validateOrigin = originValidation([]);
const checkRateLimit = createRateLimiter();

// AI 클라이언트나 사용자가 읽고 언제 다시 시도할지 알 수 있게 이유를 담는다.
function rejectTooMany(res: ServerResponse, retryAfterSeconds: number): void {
  const message = `Rate limit exceeded. Retry after ${retryAfterSeconds} seconds. 요청 한도를 넘었습니다. ${retryAfterSeconds}초 뒤에 다시 시도해 주세요.`;
  res
    .writeHead(429, { "Content-Type": "application/json; charset=utf-8", "Retry-After": retryAfterSeconds })
    .end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message }, id: null }));
}

createServer((req, res) => {
  const startedAt = Date.now();
  let limited: LimitScope | null = null;
  // 요청 본문(검색어)과 Authorization은 남기지 않는다.
  res.on("finish", () => {
    console.log(
      JSON.stringify({
        status: res.statusCode,
        method: req.method,
        mcpMethod: req.headers["mcp-method"] ?? null,
        mcpName: req.headers["mcp-name"] ?? null,
        protocolVersion: req.headers["mcp-protocol-version"] ?? null,
        // 어느 한도에 걸렸는지만 남기고 IP는 남기지 않는다.
        limited,
        ms: Date.now() - startedAt,
      }),
    );
  });

  if (req.url !== MCP_PATH) {
    res.writeHead(404).end();
    return;
  }
  // Origin을 먼저 본다. 웹페이지가 방문자의 브라우저로 보낸 요청이 횟수를 쓰지 않게 한다.
  if (!validateOrigin(req, res)) return;
  const limit = checkRateLimit(clientIp(req.headers["cf-connecting-ip"], req.socket.remoteAddress));
  if (!limit.allowed) {
    limited = limit.scope;
    rejectTooMany(res, limit.retryAfterSeconds);
    return;
  }
  void nodeHandler(req, res);
}).listen(PORT, HOST, () => {
  console.log(`blog-public listening on http://${HOST}:${PORT}${MCP_PATH}`);
});
