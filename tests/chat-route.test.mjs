import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { afterEach, beforeEach, test } from "node:test";
import ts from "typescript";

// Transpile this isolated route with the project's existing TypeScript dependency.
// This also runs on the minimum supported Node version without a TS runtime.
const source = await readFile(new URL("../app/api/chat/route.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const compiledRoute = `${outputText}\n//# sourceURL=chat-route-under-test.mjs`;
const { POST } = await import(`data:text/javascript;base64,${Buffer.from(compiledRoute).toString("base64")}`);

const originalKey = process.env.DIFY_API_KEY;
const originalBaseUrl = process.env.DIFY_API_BASE_URL;
const originalFetch = globalThis.fetch;

beforeEach(() => {
  process.env.DIFY_API_KEY = "test-only-placeholder";
  process.env.DIFY_API_BASE_URL = "https://dify.example.test/v1/";
  globalThis.fetch = async () => {
    throw new Error("Unexpected upstream request");
  };
});

afterEach(() => {
  if (originalKey === undefined) delete process.env.DIFY_API_KEY;
  else process.env.DIFY_API_KEY = originalKey;
  if (originalBaseUrl === undefined) delete process.env.DIFY_API_BASE_URL;
  else process.env.DIFY_API_BASE_URL = originalBaseUrl;
  globalThis.fetch = originalFetch;
});

function request(body) {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function expectBadFormat(input) {
  const response = await POST(input);
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "请求格式不正确。" });
}

test("malformed JSON returns 400", async () => {
  await expectBadFormat(new Request("http://localhost/api/chat", { method: "POST", body: "{" }));
});

for (const [name, value] of [["null", null], ["array", []], ["string", "hello"], ["number", 42], ["boolean", true]]) {
  test(`${name} body returns 400`, () => expectBadFormat(request(value)));
}

for (const field of ["query", "userId", "conversationId"]) {
  for (const [name, value] of [["null", null], ["number", 42], ["array", []], ["object", {}]]) {
    test(`${field} rejects ${name}`, () => expectBadFormat(request({ query: "请假怎么申请？", userId: "test-user", [field]: value })));
  }
}

for (const [name, body, error] of [
  ["missing query", { userId: "test-user" }, "请输入问题。"],
  ["blank query", { query: "   ", userId: "test-user" }, "请输入问题。"],
  ["long query", { query: "问".repeat(2001), userId: "test-user" }, "问题不能超过 2000 个字符。"],
  ["missing user", { query: "问题" }, "用户标识无效。"],
  ["long user", { query: "问题", userId: "u".repeat(161) }, "用户标识无效。"],
]) {
  test(`${name} preserves validation`, async () => {
    const response = await POST(request(body));
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error });
  });
}

test("missing Dify configuration preserves 503", async () => {
  delete process.env.DIFY_API_KEY;
  const response = await POST(request({ query: "问题", userId: "test-user" }));
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, "DIFY_NOT_CONFIGURED");
});

test("valid strings are trimmed and the upstream SSE is preserved", async () => {
  const sse = 'data: {"event":"message","answer":"示例回答"}\n\n';
  let calls = 0;
  globalThis.fetch = async (url, options) => {
    calls++;
    assert.equal(url, "https://dify.example.test/v1/chat-messages");
    assert.equal(options.method, "POST");
    assert.equal(options.headers.Authorization, "Bearer test-only-placeholder");
    assert.deepEqual(JSON.parse(options.body), {
      inputs: {}, query: "问题", response_mode: "streaming",
      conversation_id: "session-1", user: "test-user", files: [],
    });
    return new Response(sse, { headers: { "Content-Type": "text/event-stream; charset=utf-8" } });
  };
  const response = await POST(request({ query: "  问题  ", userId: " test-user ", conversationId: " session-1 " }));
  assert.equal(response.status, 200);
  assert.match(response.headers.get("Content-Type"), /text\/event-stream/);
  assert.equal(await response.text(), sse);
  assert.equal(calls, 1);
});

test("omitted conversation ID starts a new conversation", async () => {
  globalThis.fetch = async (_url, options) => {
    assert.equal(JSON.parse(options.body).conversation_id, "");
    return new Response("data: {}\n\n");
  };
  assert.equal((await POST(request({ query: "问题", userId: "test-user" }))).status, 200);
});

test("upstream authentication failure preserves the existing response", async () => {
  globalThis.fetch = async () => new Response("private upstream details", { status: 401 });
  const response = await POST(request({ query: "问题", userId: "test-user" }));
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), {
    code: "DIFY_UPSTREAM_ERROR", error: "Dify API Key 无效或已经失效，请更新服务器密钥。",
  });
});

test("upstream network failure preserves 502", async () => {
  const response = await POST(request({ query: "问题", userId: "test-user" }));
  assert.equal(response.status, 502);
  assert.equal((await response.json()).code, "DIFY_NETWORK_ERROR");
});
