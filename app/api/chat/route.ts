type ChatRequest = {
  query?: string;
  conversationId?: string;
  userId?: string;
};

const DEFAULT_DIFY_API_BASE_URL = "https://api.dify.ai/v1";

export async function POST(request: Request) {
  const apiKey = process.env.DIFY_API_KEY?.trim();
  const baseUrl = (process.env.DIFY_API_BASE_URL || DEFAULT_DIFY_API_BASE_URL).replace(/\/$/, "");

  if (!apiKey) {
    return Response.json(
      {
        code: "DIFY_NOT_CONFIGURED",
        error: "Dify 服务尚未配置。请先在服务器环境变量中添加 DIFY_API_KEY。",
      },
      { status: 503 },
    );
  }

  let payload: ChatRequest;
  try {
    payload = (await request.json()) as ChatRequest;
  } catch {
    return Response.json({ error: "请求格式不正确。" }, { status: 400 });
  }

  const query = payload.query?.trim() ?? "";
  const userId = payload.userId?.trim() ?? "";
  const conversationId = payload.conversationId?.trim() ?? "";

  if (!query) return Response.json({ error: "请输入问题。" }, { status: 400 });
  if (query.length > 2000) return Response.json({ error: "问题不能超过 2000 个字符。" }, { status: 400 });
  if (!userId || userId.length > 160) return Response.json({ error: "用户标识无效。" }, { status: 400 });

  try {
    const upstream = await fetch(`${baseUrl}/chat-messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inputs: {},
        query,
        response_mode: "streaming",
        conversation_id: conversationId,
        user: userId,
        files: [],
      }),
    });

    if (!upstream.ok || !upstream.body) {
      return Response.json(
        {
          code: "DIFY_UPSTREAM_ERROR",
          error:
            upstream.status === 401
              ? "Dify API Key 无效或已经失效，请更新服务器密钥。"
              : "知识服务暂时不可用，请稍后重试。",
        },
        { status: upstream.status >= 400 && upstream.status < 600 ? upstream.status : 502 },
      );
    }

    return new Response(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": upstream.headers.get("content-type") || "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
      },
    });
  } catch {
    return Response.json(
      { code: "DIFY_NETWORK_ERROR", error: "暂时无法连接知识服务，请稍后重试。" },
      { status: 502 },
    );
  }
}
