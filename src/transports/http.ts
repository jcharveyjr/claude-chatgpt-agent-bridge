import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID, timingSafeEqual } from "node:crypto";
import type { AddressInfo } from "node:net";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyResult } from "jose";
import type { AgentBridgeBroker } from "../broker.js";
import type { BridgeConfig } from "../config.js";
import { isLoopbackHost } from "../config.js";
import { createMcpServer } from "../mcp-server.js";

const MAX_BODY_BYTES = 1_000_000;

function json(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(value));
}

function staticTokenAuthorized(request: IncomingMessage, token: string | undefined): boolean {
  if (!token) return true;
  const header = request.headers.authorization ?? "";
  const expected = `Bearer ${token}`;
  const actualBuffer = Buffer.from(header);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

function bearerToken(request: IncomingMessage): string | undefined {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) return undefined;
  return header.slice("Bearer ".length);
}

function hasRequiredScopes(result: JWTVerifyResult, required: string[]): boolean {
  if (required.length === 0) return true;
  const claim = result.payload.scope;
  const scopes = typeof claim === "string" ? claim.split(/\s+/).filter(Boolean) : [];
  return required.every((scope) => scopes.includes(scope));
}

function originAllowed(origin: string | undefined, allowedOrigins: string[]): boolean {
  if (!origin) return true;
  return allowedOrigins.includes(origin);
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) throw new Error("Request body is too large");
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export async function startHttpServer(
  broker: AgentBridgeBroker,
  config: BridgeConfig
): Promise<{ close: () => Promise<void>; url: string }> {
  const token = process.env.AGENT_BRIDGE_TOKEN;
  const oauth = config.http.oauth;
  if (!isLoopbackHost(config.http.host) && !token && !oauth) {
    throw new Error("AGENT_BRIDGE_TOKEN or OAuth configuration is required when HTTP is not bound to a loopback host");
  }
  if (oauth && (!config.http.publicUrl || !config.http.publicUrl.startsWith("https://"))) {
    throw new Error("OAuth mode requires an HTTPS http.publicUrl or AGENT_BRIDGE_PUBLIC_URL");
  }
  const jwks = oauth ? createRemoteJWKSet(new URL(oauth.jwksUrl)) : undefined;

  const requestAuthorized = async (request: IncomingMessage): Promise<boolean> => {
    if (!oauth) return staticTokenAuthorized(request, token);
    const jwt = bearerToken(request);
    if (!jwt || !jwks) return false;
    try {
      const verified = await jwtVerify(jwt, jwks, {
        issuer: oauth.issuer,
        audience: oauth.audience
      });
      return hasRequiredScopes(verified, oauth.requiredScopes);
    } catch {
      return false;
    }
  };

  const sessions = new Map<string, {
    transport: StreamableHTTPServerTransport;
    server: ReturnType<typeof createMcpServer>;
  }>();

  const httpServer = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
      if (url.pathname === "/health" && request.method === "GET") {
        json(response, 200, { ok: true, service: "agent-bridge" });
        return;
      }
      if (url.pathname === "/.well-known/oauth-protected-resource/mcp" && request.method === "GET") {
        if (!oauth || !config.http.publicUrl) {
          json(response, 404, { error: "OAuth is not configured" });
          return;
        }
        json(response, 200, {
          resource: `${config.http.publicUrl}/mcp`,
          authorization_servers: [oauth.issuer],
          bearer_methods_supported: ["header"],
          scopes_supported: oauth.requiredScopes
        });
        return;
      }
      if (url.pathname !== "/mcp") {
        json(response, 404, { error: "Not found" });
        return;
      }
      if (!originAllowed(request.headers.origin, config.http.allowedOrigins)) {
        json(response, 403, { error: "Origin is not allowed" });
        return;
      }
      if (!(await requestAuthorized(request))) {
        const resourceMetadata = config.http.publicUrl
          ? `${config.http.publicUrl}/.well-known/oauth-protected-resource/mcp`
          : undefined;
        response.setHeader(
          "www-authenticate",
          resourceMetadata ? `Bearer resource_metadata="${resourceMetadata}"` : "Bearer"
        );
        json(response, 401, { error: "Unauthorized" });
        return;
      }
      const sessionId = request.headers["mcp-session-id"] as string | undefined;
      let session = sessionId ? sessions.get(sessionId) : undefined;
      let body: unknown;
      if (request.method === "POST") body = await readJsonBody(request);

      if (!session && request.method === "POST" && isInitializeRequest(body)) {
        const mcpServer = createMcpServer(broker);
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: randomUUID,
          enableJsonResponse: true,
          onsessioninitialized: (newSessionId) => {
            sessions.set(newSessionId, { transport, server: mcpServer });
          },
          onsessionclosed: async (closedSessionId) => {
            const closed = sessions.get(closedSessionId);
            sessions.delete(closedSessionId);
            await closed?.server.close();
          }
        });
        transport.onclose = () => {
          if (transport.sessionId) sessions.delete(transport.sessionId);
        };
        await mcpServer.connect(transport);
        session = { transport, server: mcpServer };
      }

      if (!session) {
        json(response, 400, { error: "Missing or invalid MCP session. Initialize first." });
        return;
      }
      if (!["POST", "GET", "DELETE"].includes(request.method ?? "")) {
        response.setHeader("allow", "POST, GET, DELETE");
        json(response, 405, { error: "Method not allowed" });
        return;
      }
      await session.transport.handleRequest(request, response, body);
    } catch (error) {
      if (!response.headersSent) {
        json(response, 500, { error: error instanceof Error ? error.message : String(error) });
      } else {
        response.end();
      }
    }
  });

  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(config.http.port, config.http.host, () => {
      httpServer.off("error", reject);
      resolve();
    });
  });

  const address = httpServer.address() as AddressInfo;
  const url = `http://${config.http.host}:${address.port}`;
  return {
    url,
    close: async () => {
      for (const { transport, server } of sessions.values()) {
        await transport.close();
        await server.close();
      }
      sessions.clear();
      await new Promise<void>((resolve, reject) => {
        httpServer.close((error) => error ? reject(error) : resolve());
      });
    }
  };
}
