import type { IncomingMessage, ServerResponse } from "node:http";
import type { AgentBridgeBroker } from "./broker.js";
import { isLoopbackHost, type BridgeConfig } from "./config.js";
import {
  AGENT_NAMES,
  SOURCE_AGENTS,
  TASK_MODES,
  TASK_STATUSES,
  type AgentName,
  type SourceAgent,
  type TaskMode,
  type TaskStatus
} from "./types.js";

type RequestAuthorizer = (request: IncomingMessage) => Promise<boolean>;

const API_ROOT = "/console/api";
const MAX_BODY_BYTES = 1_000_000;

function addSecurityHeaders(response: ServerResponse): void {
  response.setHeader("cache-control", "no-store");
  response.setHeader("referrer-policy", "no-referrer");
  response.setHeader("x-content-type-options", "nosniff");
  response.setHeader("x-frame-options", "DENY");
}

function json(response: ServerResponse, status: number, value: unknown): void {
  addSecurityHeaders(response);
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(value));
}

function html(response: ServerResponse): void {
  addSecurityHeaders(response);
  response.setHeader(
    "content-security-policy",
    "default-src 'self'; connect-src 'self'; img-src data:; " +
      "script-src 'unsafe-inline'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'self'"
  );
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end(DEMO_CONSOLE_HTML);
}

function originAllowed(request: IncomingMessage, config: BridgeConfig): boolean {
  const origin = request.headers.origin;
  if (!origin) return true;
  if (config.http.allowedOrigins.includes(origin)) return true;
  const host = request.headers.host;
  return Boolean(host && origin === `http://${host}`);
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
  const text = Buffer.concat(chunks).toString("utf8");
  if (!text.trim()) throw new Error("Request body is required");
  return JSON.parse(text);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") throw new Error(`${field} must be a string`);
  return value;
}

function requiredEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  field: string
): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new Error(`${field} must be one of: ${allowed.join(", ")}`);
  }
  return value as T;
}

function optionalCriteria(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error("successCriteria must be an array of strings");
  }
  if (value.length > 20) throw new Error("successCriteria supports at most 20 items");
  return value as string[];
}

function parseLimit(url: URL): number {
  const raw = url.searchParams.get("limit") ?? "50";
  const limit = Number(raw);
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
    throw new Error("limit must be an integer between 1 and 200");
  }
  return limit;
}

function methodNotAllowed(response: ServerResponse, methods: string[]): void {
  response.setHeader("allow", methods.join(", "));
  json(response, 405, { error: "Method not allowed" });
}

export async function handleDemoConsoleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  broker: AgentBridgeBroker,
  config: BridgeConfig,
  authorize: RequestAuthorizer
): Promise<boolean> {
  if (url.pathname !== "/console" && !url.pathname.startsWith("/console/")) return false;

  if (!isLoopbackHost(config.http.host)) {
    json(response, 404, { error: "The demo console is available only on a loopback-bound bridge" });
    return true;
  }

  if ((url.pathname === "/console" || url.pathname === "/console/") && request.method === "GET") {
    html(response);
    return true;
  }

  if (!url.pathname.startsWith(`${API_ROOT}/`)) {
    json(response, 404, { error: "Not found" });
    return true;
  }

  if (!originAllowed(request, config)) {
    json(response, 403, { error: "Origin is not allowed" });
    return true;
  }
  if (!(await authorize(request))) {
    response.setHeader("www-authenticate", "Bearer");
    json(response, 401, { error: "Unauthorized" });
    return true;
  }

  try {
    if (url.pathname === `${API_ROOT}/capabilities`) {
      if (request.method !== "GET") {
        methodNotAllowed(response, ["GET"]);
        return true;
      }
      json(response, 200, {
        capabilities: await broker.capabilities(),
        instance: broker.instanceMetadata()
      });
      return true;
    }

    if (url.pathname === `${API_ROOT}/tasks`) {
      if (request.method === "GET") {
        const statusValue = url.searchParams.get("status");
        const agentValue = url.searchParams.get("targetAgent");
        const status = statusValue
          ? requiredEnum(statusValue, TASK_STATUSES, "status") as TaskStatus
          : undefined;
        const targetAgent = agentValue
          ? requiredEnum(agentValue, AGENT_NAMES, "targetAgent") as AgentName
          : undefined;
        json(response, 200, {
          tasks: await broker.list({
            ...(status ? { status } : {}),
            ...(targetAgent ? { targetAgent } : {}),
            limit: parseLimit(url)
          })
        });
        return true;
      }

      if (request.method === "POST") {
        const body = await readJsonBody(request);
        if (!isRecord(body)) throw new Error("Request body must be a JSON object");
        const taskText = optionalString(body.task, "task");
        if (!taskText?.trim()) throw new Error("task must not be empty");
        const targetAgent = requiredEnum(body.targetAgent, AGENT_NAMES, "targetAgent") as AgentName;
        const sourceAgent = requiredEnum(body.sourceAgent, SOURCE_AGENTS, "sourceAgent") as SourceAgent;
        const mode = body.mode === undefined
          ? "read_only"
          : requiredEnum(body.mode, TASK_MODES, "mode") as TaskMode;
        const created = await broker.delegate({
          targetAgent,
          sourceAgent,
          task: taskText,
          mode,
          ...(optionalString(body.workspace, "workspace")
            ? { workspace: optionalString(body.workspace, "workspace") }
            : {}),
          ...(optionalString(body.context, "context")
            ? { context: optionalString(body.context, "context") }
            : {}),
          ...(optionalCriteria(body.successCriteria)
            ? { successCriteria: optionalCriteria(body.successCriteria) }
            : {}),
          metadata: { client: "demo-console" }
        });
        json(response, 202, { task: created });
        return true;
      }

      methodNotAllowed(response, ["GET", "POST"]);
      return true;
    }

    const cancelMatch = url.pathname.match(/^\/console\/api\/tasks\/([^/]+)\/cancel$/);
    if (cancelMatch) {
      if (request.method !== "POST") {
        methodNotAllowed(response, ["POST"]);
        return true;
      }
      const task = await broker.cancel(decodeURIComponent(cancelMatch[1]!));
      json(response, 200, { task });
      return true;
    }

    const taskMatch = url.pathname.match(/^\/console\/api\/tasks\/([^/]+)$/);
    if (taskMatch) {
      if (request.method !== "GET") {
        methodNotAllowed(response, ["GET"]);
        return true;
      }
      const task = await broker.get(decodeURIComponent(taskMatch[1]!));
      if (!task) {
        json(response, 404, { error: "Task was not found" });
        return true;
      }
      json(response, 200, { task });
      return true;
    }

    json(response, 404, { error: "Not found" });
    return true;
  } catch (error) {
    json(response, 400, { error: error instanceof Error ? error.message : String(error) });
    return true;
  }
}

export const DEMO_CONSOLE_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Agent Bridge Demo Console</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #08111f;
      --panel: rgba(16, 29, 48, .88);
      --panel-2: #13243b;
      --line: #29405f;
      --text: #eef5ff;
      --muted: #91a5c1;
      --cyan: #36d6c7;
      --blue: #68a7ff;
      --violet: #b899ff;
      --green: #5ee39a;
      --amber: #ffc76b;
      --red: #ff7d8d;
      --shadow: 0 22px 70px rgba(0, 0, 0, .34);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      color: var(--text);
      background:
        radial-gradient(circle at 15% -10%, rgba(54,214,199,.16), transparent 32%),
        radial-gradient(circle at 90% 4%, rgba(104,167,255,.14), transparent 28%),
        var(--bg);
      font: 15px/1.5 Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    button, input, select, textarea { font: inherit; }
    button { cursor: pointer; }
    .shell { width: min(1240px, calc(100% - 32px)); margin: 0 auto; padding: 28px 0 48px; }
    header { display: flex; align-items: center; justify-content: space-between; gap: 20px; margin-bottom: 24px; }
    .brand { display: flex; align-items: center; gap: 13px; }
    .mark {
      display: grid; place-items: center; width: 42px; height: 42px; border-radius: 13px;
      background: linear-gradient(135deg, var(--cyan), var(--blue)); color: #07111e; font-weight: 900;
      box-shadow: 0 10px 32px rgba(54,214,199,.22);
    }
    h1 { margin: 0; font-size: clamp(20px, 3vw, 28px); letter-spacing: -.03em; }
    .subtitle { margin: 2px 0 0; color: var(--muted); font-size: 13px; }
    .health { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border: 1px solid var(--line); border-radius: 999px; color: var(--muted); background: rgba(8,17,31,.55); }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--amber); box-shadow: 0 0 14px currentColor; }
    .dot.live { background: var(--green); }
    .dot.bad { background: var(--red); }
    .agent-strip {
      display: grid; grid-template-columns: 1fr auto 1fr; align-items: stretch; gap: 16px;
      margin-bottom: 20px;
    }
    .agent, .bridge-card, .panel {
      border: 1px solid var(--line); border-radius: 18px; background: var(--panel); box-shadow: var(--shadow);
      backdrop-filter: blur(12px);
    }
    .agent { padding: 18px; display: flex; gap: 14px; align-items: center; }
    .agent-icon { display: grid; place-items: center; width: 44px; height: 44px; border-radius: 14px; font-size: 18px; font-weight: 800; }
    .claude .agent-icon { background: rgba(184,153,255,.15); color: var(--violet); }
    .chatgpt .agent-icon { background: rgba(54,214,199,.14); color: var(--cyan); }
    .agent strong { display: block; font-size: 16px; }
    .agent small { color: var(--muted); }
    .bridge-card { min-width: 190px; padding: 14px 20px; display: grid; place-items: center; text-align: center; }
    .bridge-line { display: flex; align-items: center; gap: 5px; width: 100%; color: var(--blue); }
    .bridge-line:before, .bridge-line:after { content: ""; height: 1px; flex: 1; background: linear-gradient(90deg, transparent, var(--blue)); }
    .bridge-line:after { transform: rotate(180deg); }
    .bridge-card small { color: var(--muted); }
    .layout { display: grid; grid-template-columns: minmax(0, 1.05fr) minmax(350px, .95fr); gap: 20px; }
    .panel { padding: 20px; min-width: 0; }
    .panel-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 18px; }
    h2 { margin: 0; font-size: 17px; }
    label { display: block; color: var(--muted); font-size: 12px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; margin-bottom: 7px; }
    input, select, textarea {
      width: 100%; color: var(--text); background: #0a1728; border: 1px solid var(--line);
      border-radius: 11px; padding: 10px 12px; outline: none;
    }
    input:focus, select:focus, textarea:focus { border-color: var(--blue); box-shadow: 0 0 0 3px rgba(104,167,255,.12); }
    textarea { resize: vertical; min-height: 112px; }
    .row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-bottom: 14px; }
    .field { margin-bottom: 14px; }
    details { border: 1px solid var(--line); border-radius: 12px; padding: 10px 12px; margin-bottom: 14px; }
    summary { color: var(--muted); cursor: pointer; font-weight: 650; }
    details .field:first-of-type { margin-top: 13px; }
    .actions { display: flex; align-items: center; gap: 10px; }
    .primary, .secondary, .danger {
      border: 0; border-radius: 11px; padding: 10px 15px; font-weight: 800;
    }
    .primary { color: #06131d; background: linear-gradient(135deg, var(--cyan), var(--blue)); }
    .secondary { color: var(--text); background: var(--panel-2); border: 1px solid var(--line); }
    .danger { color: #fff; background: rgba(255,125,141,.18); border: 1px solid rgba(255,125,141,.4); }
    button:disabled { opacity: .5; cursor: not-allowed; }
    .hint { color: var(--muted); font-size: 12px; }
    .task-list { display: grid; gap: 9px; max-height: 515px; overflow: auto; padding-right: 3px; }
    .task-item {
      width: 100%; text-align: left; color: var(--text); border: 1px solid var(--line);
      border-radius: 13px; background: #0b1829; padding: 12px; transition: .15s ease;
    }
    .task-item:hover, .task-item.selected { border-color: var(--blue); transform: translateY(-1px); }
    .task-top { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 7px; }
    .task-title { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 700; }
    .meta { color: var(--muted); font-size: 12px; display: flex; flex-wrap: wrap; gap: 5px 10px; }
    .badge { display: inline-flex; align-items: center; border-radius: 999px; padding: 3px 8px; font-size: 11px; font-weight: 800; }
    .queued { color: var(--amber); background: rgba(255,199,107,.12); }
    .running { color: var(--blue); background: rgba(104,167,255,.13); }
    .completed { color: var(--green); background: rgba(94,227,154,.12); }
    .failed, .cancelled { color: var(--red); background: rgba(255,125,141,.12); }
    .empty { color: var(--muted); text-align: center; padding: 36px 10px; border: 1px dashed var(--line); border-radius: 13px; }
    .detail { grid-column: 1 / -1; }
    .detail-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin-bottom: 16px; }
    .metric { border: 1px solid var(--line); background: #0a1728; border-radius: 12px; padding: 10px; min-width: 0; }
    .metric span { display: block; color: var(--muted); font-size: 11px; text-transform: uppercase; }
    .metric strong { display: block; margin-top: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    pre { white-space: pre-wrap; word-break: break-word; margin: 0; padding: 15px; max-height: 420px; overflow: auto; border-radius: 12px; background: #071321; border: 1px solid var(--line); color: #dceaff; }
    .error { color: var(--red); }
    .toast { position: fixed; right: 20px; bottom: 20px; max-width: 420px; padding: 12px 15px; border: 1px solid var(--line); border-radius: 12px; background: #12233a; box-shadow: var(--shadow); opacity: 0; transform: translateY(12px); pointer-events: none; transition: .2s ease; }
    .toast.show { opacity: 1; transform: none; }
    @media (max-width: 820px) {
      .agent-strip, .layout { grid-template-columns: 1fr; }
      .bridge-card { min-width: 0; }
      .detail { grid-column: auto; }
      .detail-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
    @media (max-width: 520px) {
      .shell { width: min(100% - 20px, 1240px); padding-top: 18px; }
      header, .panel-head { align-items: flex-start; }
      .health { font-size: 0; padding: 10px; }
      .row, .detail-grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <main class="shell">
    <header>
      <div class="brand">
        <div class="mark">AB</div>
        <div>
          <h1>Agent Bridge Demo Console</h1>
          <p class="subtitle">One broker. Claude and ChatGPT/Codex. Observable handoffs.</p>
        </div>
      </div>
      <div class="health"><span id="health-dot" class="dot"></span><span id="health-label">Connecting</span></div>
    </header>

    <section class="agent-strip" aria-label="Connected agents">
      <article class="agent claude">
        <div class="agent-icon">C</div>
        <div><strong>Claude</strong><small id="claude-state">Checking worker</small></div>
      </article>
      <div class="bridge-card">
        <div class="bridge-line"><strong>Agent Bridge</strong></div>
        <small id="bridge-version">Loading version</small>
      </div>
      <article class="agent chatgpt">
        <div class="agent-icon">G</div>
        <div><strong>ChatGPT / Codex</strong><small id="codex-state">Checking worker</small></div>
      </article>
    </section>

    <section class="layout">
      <form id="task-form" class="panel">
        <div class="panel-head"><h2>New delegation</h2><span class="hint">Runs asynchronously</span></div>
        <div class="row">
          <div>
            <label for="target">Send to</label>
            <select id="target" required>
              <option value="claude">Claude</option>
              <option value="codex">ChatGPT / Codex</option>
            </select>
          </div>
          <div>
            <label for="source">From</label>
            <select id="source" required>
              <option value="chatgpt">ChatGPT</option>
              <option value="claude">Claude</option>
              <option value="human">Human operator</option>
            </select>
          </div>
        </div>
        <div class="row">
          <div>
            <label for="workspace">Workspace</label>
            <select id="workspace" required><option>Loading…</option></select>
          </div>
          <div>
            <label for="mode">Permission mode</label>
            <select id="mode">
              <option value="read_only">Read only</option>
              <option value="workspace_write">Workspace write</option>
            </select>
          </div>
        </div>
        <div class="field">
          <label for="task">Task</label>
          <textarea id="task" maxlength="50000" placeholder="Describe one bounded outcome for the receiving agent…" required></textarea>
        </div>
        <details>
          <summary>Context and success criteria</summary>
          <div class="field">
            <label for="context">Context</label>
            <textarea id="context" placeholder="Optional background the receiving agent needs"></textarea>
          </div>
          <div class="field">
            <label for="criteria">Success criteria, one per line</label>
            <textarea id="criteria" placeholder="Returns a concise result&#10;Does not modify files"></textarea>
          </div>
        </details>
        <div class="field">
          <label for="token">Bearer token, if configured</label>
          <input id="token" type="password" autocomplete="off" placeholder="Kept in this page only">
        </div>
        <div class="actions">
          <button id="submit" class="primary" type="submit">Delegate task</button>
          <span id="form-status" class="hint"></span>
        </div>
      </form>

      <section class="panel">
        <div class="panel-head">
          <h2>Recent tasks</h2>
          <button id="refresh" class="secondary" type="button">Refresh</button>
        </div>
        <div id="task-list" class="task-list"><div class="empty">Loading task history…</div></div>
      </section>

      <section class="panel detail">
        <div class="panel-head">
          <h2>Task detail</h2>
          <div class="actions">
            <button id="copy" class="secondary" type="button" disabled>Copy result</button>
            <button id="cancel" class="danger" type="button" disabled>Cancel task</button>
          </div>
        </div>
        <div id="detail-body" class="empty">Select a task to inspect its handoff, status, and result.</div>
      </section>
    </section>
  </main>
  <div id="toast" class="toast" role="status"></div>

  <script>
    (function () {
      "use strict";
      var state = { capabilities: null, tasks: [], selectedId: null, selectedTask: null };
      var byId = function (id) { return document.getElementById(id); };

      function toast(message) {
        var node = byId("toast");
        node.textContent = message;
        node.classList.add("show");
        window.clearTimeout(toast.timer);
        toast.timer = window.setTimeout(function () { node.classList.remove("show"); }, 3200);
      }

      async function api(path, options) {
        var init = options || {};
        var headers = new Headers(init.headers || {});
        headers.set("accept", "application/json");
        var token = byId("token").value.trim();
        if (token) headers.set("authorization", "Bearer " + token);
        if (init.body) headers.set("content-type", "application/json");
        var response = await fetch("/console/api" + path, Object.assign({}, init, { headers: headers }));
        var data = await response.json().catch(function () { return { error: "Invalid server response" }; });
        if (!response.ok) throw new Error(data.error || ("Request failed with " + response.status));
        return data;
      }

      function setWorkerState(agent, value) {
        var node = byId(agent + "-state");
        if (!value) { node.textContent = "Unavailable"; return; }
        node.textContent = value.enabled && value.installed ? "Connected · " + value.adapter : "Unavailable · " + value.detail;
      }

      async function loadCapabilities() {
        try {
          var data = await api("/capabilities");
          state.capabilities = data.capabilities;
          byId("health-dot").className = "dot live";
          byId("health-label").textContent = "Bridge online";
          byId("bridge-version").textContent = "v" + data.capabilities.version + " · MCP";
          setWorkerState("claude", data.capabilities.agents.claude);
          setWorkerState("codex", data.capabilities.agents.codex);
          var workspace = byId("workspace");
          workspace.replaceChildren();
          data.capabilities.workspaces.forEach(function (name) {
            var option = document.createElement("option");
            option.value = name;
            option.textContent = name + (name === data.capabilities.defaultWorkspace ? " · default" : "");
            option.selected = name === data.capabilities.defaultWorkspace;
            workspace.appendChild(option);
          });
        } catch (error) {
          byId("health-dot").className = "dot bad";
          byId("health-label").textContent = "Connection needed";
          byId("form-status").textContent = error.message;
        }
      }

      function badge(status) {
        var node = document.createElement("span");
        node.className = "badge " + status;
        node.textContent = status;
        return node;
      }

      function taskItem(task) {
        var button = document.createElement("button");
        button.type = "button";
        button.className = "task-item" + (task.id === state.selectedId ? " selected" : "");
        button.addEventListener("click", function () { selectTask(task.id); });
        var top = document.createElement("div");
        top.className = "task-top";
        var title = document.createElement("span");
        title.className = "task-title";
        title.textContent = task.task;
        top.append(title, badge(task.status));
        var meta = document.createElement("div");
        meta.className = "meta";
        var direction = task.sourceAgent + " → " + (task.targetAgent === "codex" ? "ChatGPT/Codex" : "Claude");
        meta.textContent = direction + " · " + task.workspace + " · " + new Date(task.createdAt).toLocaleString();
        button.append(top, meta);
        return button;
      }

      function renderTasks() {
        var list = byId("task-list");
        list.replaceChildren();
        if (!state.tasks.length) {
          var empty = document.createElement("div");
          empty.className = "empty";
          empty.textContent = "No delegated tasks yet.";
          list.appendChild(empty);
          return;
        }
        state.tasks.forEach(function (task) { list.appendChild(taskItem(task)); });
      }

      function metric(label, value) {
        var node = document.createElement("div");
        node.className = "metric";
        var caption = document.createElement("span");
        caption.textContent = label;
        var content = document.createElement("strong");
        content.textContent = value || "—";
        node.append(caption, content);
        return node;
      }

      function renderDetail(task) {
        state.selectedTask = task;
        var body = byId("detail-body");
        body.className = "";
        body.replaceChildren();
        var grid = document.createElement("div");
        grid.className = "detail-grid";
        grid.append(
          metric("Status", task.status),
          metric("Target", task.targetAgent === "codex" ? "ChatGPT / Codex" : "Claude"),
          metric("Mode", task.mode.replace("_", " ")),
          metric("Workspace", task.workspace)
        );
        var taskLabel = document.createElement("label");
        taskLabel.textContent = "Delegated task";
        var taskText = document.createElement("pre");
        taskText.textContent = task.task;
        var resultLabel = document.createElement("label");
        resultLabel.style.marginTop = "16px";
        resultLabel.textContent = task.error ? "Provider error" : "Result";
        var result = document.createElement("pre");
        result.className = task.error ? "error" : "";
        result.textContent = task.error || task.result || (task.status === "running" ? "Agent is working…" : "Waiting in queue…");
        body.append(grid, taskLabel, taskText, resultLabel, result);
        byId("cancel").disabled = task.status !== "queued" && task.status !== "running";
        byId("copy").disabled = !task.result && !task.error;
      }

      async function selectTask(id) {
        state.selectedId = id;
        renderTasks();
        try {
          var data = await api("/tasks/" + encodeURIComponent(id));
          renderDetail(data.task);
        } catch (error) {
          toast(error.message);
        }
      }

      async function refreshTasks(silent) {
        try {
          var data = await api("/tasks?limit=50");
          state.tasks = data.tasks;
          renderTasks();
          if (state.selectedId) {
            var selected = state.tasks.find(function (task) { return task.id === state.selectedId; });
            if (selected) renderDetail(selected);
          }
        } catch (error) {
          if (!silent) toast(error.message);
        }
      }

      function syncSource() {
        var target = byId("target").value;
        var source = byId("source");
        if (target === "claude" && source.value === "claude") source.value = "chatgpt";
        if (target === "codex" && (source.value === "codex" || source.value === "chatgpt")) source.value = "claude";
      }

      byId("target").addEventListener("change", syncSource);
      byId("refresh").addEventListener("click", function () { refreshTasks(false); });
      byId("token").addEventListener("change", function () {
        loadCapabilities();
        refreshTasks(false);
      });

      byId("task-form").addEventListener("submit", async function (event) {
        event.preventDefault();
        syncSource();
        var submit = byId("submit");
        submit.disabled = true;
        byId("form-status").textContent = "Submitting…";
        try {
          var criteria = byId("criteria").value.split(/\\r?\\n/).map(function (line) { return line.trim(); }).filter(Boolean);
          var payload = {
            targetAgent: byId("target").value,
            sourceAgent: byId("source").value,
            workspace: byId("workspace").value,
            mode: byId("mode").value,
            task: byId("task").value,
            context: byId("context").value,
            successCriteria: criteria
          };
          var data = await api("/tasks", { method: "POST", body: JSON.stringify(payload) });
          byId("form-status").textContent = "Queued " + data.task.id.slice(0, 8);
          state.selectedId = data.task.id;
          byId("task").value = "";
          await refreshTasks(true);
          await selectTask(data.task.id);
          toast("Task delegated to " + (data.task.targetAgent === "codex" ? "ChatGPT / Codex" : "Claude"));
        } catch (error) {
          byId("form-status").textContent = error.message;
          toast(error.message);
        } finally {
          submit.disabled = false;
        }
      });

      byId("cancel").addEventListener("click", async function () {
        if (!state.selectedId) return;
        try {
          var data = await api("/tasks/" + encodeURIComponent(state.selectedId) + "/cancel", { method: "POST" });
          renderDetail(data.task);
          await refreshTasks(true);
          toast("Cancellation requested");
        } catch (error) { toast(error.message); }
      });

      byId("copy").addEventListener("click", async function () {
        if (!state.selectedTask) return;
        var text = state.selectedTask.result || state.selectedTask.error || "";
        try {
          await navigator.clipboard.writeText(text);
          toast("Result copied");
        } catch {
          toast("Clipboard access was unavailable");
        }
      });

      syncSource();
      loadCapabilities().then(function () { refreshTasks(true); });
      window.setInterval(function () { refreshTasks(true); }, 2000);
    }());
  </script>
</body>
</html>`;
