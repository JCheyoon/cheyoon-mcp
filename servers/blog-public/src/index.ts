import { createServer } from "node:http";
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { originValidation, toNodeHandler } from "@modelcontextprotocol/node";
import { isAllowed } from "./rateLimit.js";
import { registerTools } from "./tools.js";

const PORT = Number(process.env.PORT ?? 3000);
// 로컬에서는 이 컴퓨터에서만 접속을 받는다. 배포 환경에서는 HOST로 바꾼다.
const HOST = process.env.HOST ?? "127.0.0.1";
const MCP_PATH = "/mcp";
// MCP 요청은 작은 JSON뿐이라 SDK 기본값(4 MiB)보다 훨씬 작게 잡는다.
const MAX_BODY_BYTES = 64 * 1024;

// 클라이언트마다 지원하는 MCP 버전이 달라서, 최신(2026-07-28) 방식과 initialize를 보내는
// 이전(~2025-11-25) 방식을 모두 받는다. SDK 기본값(legacy: "stateless")이다.
const handler = createMcpHandler(
  () => {
    const server = new McpServer({ name: "blog-public", version: "0.1.0" });
    registerTools(server);
    return server;
  },
  { maxRequestBodySize: MAX_BODY_BYTES },
);
const nodeHandler = toNodeHandler(handler, { maxRequestBodySize: MAX_BODY_BYTES });

// 브라우저가 아닌 MCP 클라이언트는 Origin을 보내지 않는다. Origin이 붙은 요청(브라우저)은 모두 막는다.
const validateOrigin = originValidation([]);

createServer((req, res) => {
  const startedAt = Date.now();
  // 요청 본문(검색어)과 Authorization은 남기지 않는다.
  res.on("finish", () => {
    console.log(
      JSON.stringify({
        status: res.statusCode,
        method: req.method,
        mcpMethod: req.headers["mcp-method"] ?? null,
        mcpName: req.headers["mcp-name"] ?? null,
        protocolVersion: req.headers["mcp-protocol-version"] ?? null,
        ms: Date.now() - startedAt,
      }),
    );
  });

  if (req.url !== MCP_PATH) {
    res.writeHead(404).end();
    return;
  }
  // TODO: 프록시 뒤에서는 remoteAddress가 프록시 IP일 수 있다. 호스팅을 정한 뒤 실제 클라이언트 IP를 읽도록 바꾼다.
  if (!isAllowed(req.socket.remoteAddress ?? "unknown")) {
    res.writeHead(429).end();
    return;
  }
  if (!validateOrigin(req, res)) return;
  void nodeHandler(req, res);
}).listen(PORT, HOST, () => {
  console.log(`blog-public listening on http://${HOST}:${PORT}${MCP_PATH}`);
});
