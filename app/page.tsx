"use client";

import { FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";

type Source = {
  document_name?: string;
  dataset_name?: string;
  score?: number;
  content?: string;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  pending?: boolean;
  error?: boolean;
};

type ConnectionState = "checking" | "connected" | "needs-key" | "offline";

const starterQuestions = [
  "常规生产发布安排在什么时间？",
  "我下周想请2天事假，需要提前多久申请？",
  "VPN突然连不上，应该先检查什么？",
  "报销审批通过后，一般多久可以到账？",
];

const knowledgeDomains = [
  { name: "产品研发与项目协作", code: "PRODUCT", tone: "blue" },
  { name: "IT支持与系统权限", code: "IT", tone: "violet" },
  { name: "HR、行政与考勤", code: "HR", tone: "mint" },
  { name: "费用报销与差旅", code: "FINANCE", tone: "amber" },
];

function Icon({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span className={`icon ${className}`} aria-hidden="true">
      {children}
    </span>
  );
}

function SparkIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none">
      <path d="M12 2.8c.55 4.65 2.55 6.65 7.2 7.2-4.65.55-6.65 2.55-7.2 7.2-.55-4.65-2.55-6.65-7.2-7.2 4.65-.55 6.65-2.55 7.2-7.2Z" fill="currentColor" />
      <path d="M19 15.5c.2 1.7.8 2.3 2.5 2.5-1.7.2-2.3.8-2.5 2.5-.2-1.7-.8-2.3-2.5-2.5 1.7-.2 2.3-.8 2.5-2.5Z" fill="currentColor" opacity=".7" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="10.8" cy="10.8" r="6.6" />
      <path d="m16 16 4.2 4.2" />
    </svg>
  );
}

function BookIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M4 5.7A2.7 2.7 0 0 1 6.7 3H11v16H6.7A2.7 2.7 0 0 0 4 21.7v-16Z" />
      <path d="M20 5.7A2.7 2.7 0 0 0 17.3 3H13v16h4.3a2.7 2.7 0 0 1 2.7 2.7v-16Z" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M12 3 20 6v5.8c0 4.8-3.25 7.75-8 9.2-4.75-1.45-8-4.4-8-9.2V6l8-3Z" />
      <path d="m8.7 12.1 2.1 2.1 4.6-4.8" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="m4 12 15-7-5.7 15-2.1-6.8L4 12Z" />
      <path d="m11.2 13.2 3.7-3.7" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M5 12h14M14 7l5 5-5 5" />
    </svg>
  );
}

function OctopusMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`octopus-mark ${compact ? "compact" : ""}`} aria-hidden="true">
      {Array.from({ length: 8 }).map((_, index) => (
        <span key={index} style={{ "--i": index } as React.CSSProperties} />
      ))}
      <i />
    </div>
  );
}

function RichAnswer({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <div className="rich-answer">
      {lines.map((rawLine, index) => {
        const line = rawLine.trim();
        if (!line) return <div className="answer-gap" key={`gap-${index}`} />;

        const heading = line.match(/^#{1,3}\s+(.+)$/);
        if (heading) return <h3 key={index}>{renderInline(heading[1])}</h3>;

        const bullet = line.match(/^[-*•]\s+(.+)$/);
        if (bullet) {
          return (
            <div className="answer-list-item" key={index}>
              <span />
              <p>{renderInline(bullet[1])}</p>
            </div>
          );
        }

        const ordered = line.match(/^(\d+)[.、]\s*(.+)$/);
        if (ordered) {
          return (
            <div className="answer-list-item ordered" key={index}>
              <b>{ordered[1]}</b>
              <p>{renderInline(ordered[2])}</p>
            </div>
          );
        }

        return <p key={index}>{renderInline(line)}</p>;
      })}
    </div>
  );
}

function renderInline(text: string) {
  return text.split(/(\*\*.*?\*\*)/g).map((part, index) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={index}>{part.slice(2, -2)}</strong>
    ) : (
      part
    ),
  );
}

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function Home() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [conversationId, setConversationId] = useState("");
  const [connection, setConnection] = useState<ConnectionState>("checking");
  const [mobilePanel, setMobilePanel] = useState<"none" | "domains">("none");
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const hasMessages = messages.length > 0;
  const latestSources = useMemo(
    () => [...messages].reverse().find((message) => message.sources?.length)?.sources ?? [],
    [messages],
  );

  useEffect(() => {
    fetch("/api/status", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => setConnection(data.configured ? "connected" : "needs-key"))
      .catch(() => setConnection("offline"));
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  function updateAssistant(id: string, updater: (message: ChatMessage) => ChatMessage) {
    setMessages((current) => current.map((message) => (message.id === id ? updater(message) : message)));
  }

  function resetConversation() {
    setMessages([]);
    setConversationId("");
    window.localStorage.removeItem("zhangyu-conversation-id");
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  async function submitQuestion(question: string) {
    const query = question.trim();
    if (!query || isSending) return;

    const userMessage: ChatMessage = { id: makeId("user"), role: "user", content: query };
    const assistantId = makeId("assistant");
    const assistantMessage: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      pending: true,
    };

    setMessages((current) => [...current, userMessage, assistantMessage]);
    setDraft("");
    setIsSending(true);

    try {
      let userId = window.localStorage.getItem("zhangyu-user-id");
      if (!userId) {
        userId = `internal-${crypto.randomUUID()}`;
        window.localStorage.setItem("zhangyu-user-id", userId);
      }

      const activeConversationId =
        conversationId || window.localStorage.getItem("zhangyu-conversation-id") || "";

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, conversationId: activeConversationId, userId }),
      });

      if (!response.ok || !response.body) {
        const payload = await response.json().catch(() => ({}));
        if (payload.code === "DIFY_NOT_CONFIGURED") setConnection("needs-key");
        throw new Error(payload.error || "知识服务暂时不可用，请稍后重试。");
      }

      setConnection("connected");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let accumulated = "";
      let sources: Source[] = [];

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split("\n\n");
        buffer = blocks.pop() ?? "";

        for (const block of blocks) {
          const dataLine = block.split("\n").find((line) => line.startsWith("data:"));
          if (!dataLine) continue;
          const raw = dataLine.slice(5).trim();
          if (!raw || raw === "[DONE]") continue;

          const event = JSON.parse(raw);
          if (event.event === "error") throw new Error(event.message || "知识服务返回异常。");

          const chunk =
            event.event === "message" || event.event === "agent_message"
              ? event.answer
              : event.event === "text_chunk"
                ? event.data?.text ?? event.text
                : "";

          if (chunk) {
            accumulated += chunk;
            updateAssistant(assistantId, (message) => ({ ...message, content: accumulated, pending: false }));
          }

          if (event.conversation_id && event.conversation_id !== activeConversationId) {
            setConversationId(event.conversation_id);
            window.localStorage.setItem("zhangyu-conversation-id", event.conversation_id);
          }

          const retrieverResources = event.metadata?.retriever_resources;
          if (Array.isArray(retrieverResources) && retrieverResources.length) sources = retrieverResources;
        }
      }

      updateAssistant(assistantId, (message) => ({
        ...message,
        content: accumulated || "本次没有生成可展示的回答，请重新描述问题后再试。",
        pending: false,
        sources,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "知识服务暂时不可用，请稍后重试。";
      updateAssistant(assistantId, (current) => ({ ...current, content: message, pending: false, error: true }));
    } finally {
      setIsSending(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void submitQuestion(draft);
  }

  return (
    <main className="app-shell">
      <aside className="left-rail" aria-label="主导航">
        <div className="brand-lockup">
          <OctopusMark compact />
          <div>
            <strong>章鱼时代智库</strong>
            <span>INTERNAL AGENT</span>
          </div>
        </div>

        <button className="new-chat-button" type="button" onClick={resetConversation}>
          <Icon><PlusIcon /></Icon>
          <span>新对话</span>
          <kbd>⌘ K</kbd>
        </button>

        <nav className="nav-section">
          <span className="nav-label">工作台</span>
          <button className="nav-item active" type="button">
            <Icon><SparkIcon /></Icon>
            智库问答
            <i />
          </button>
          <button className="nav-item" type="button" onClick={() => setMobilePanel("domains")}>
            <Icon><BookIcon /></Icon>
            知识范围
          </button>
          <button className="nav-item" type="button">
            <Icon><ShieldIcon /></Icon>
            安全说明
          </button>
        </nav>

        <div className="quick-section">
          <span className="nav-label">常用入口</span>
          {starterQuestions.slice(0, 3).map((question) => (
            <button key={question} type="button" onClick={() => void submitQuestion(question)}>
              <span>{question}</span>
              <Icon><ArrowIcon /></Icon>
            </button>
          ))}
        </div>

        <div className="rail-footer">
          <span className={`status-dot ${connection}`} />
          <div>
            <strong>{connection === "connected" ? "知识服务在线" : connection === "checking" ? "正在检查服务" : "等待服务配置"}</strong>
            <span>内部试运行 · V1.0</span>
          </div>
        </div>
      </aside>

      <section className={`workspace ${hasMessages ? "conversation-mode" : "welcome-mode"}`}>
        <header className="workspace-header">
          <div className="mobile-brand">
            <OctopusMark compact />
            <strong>章鱼时代智库</strong>
          </div>
          <div className="breadcrumb">
            <span>内部知识管理</span>
            <i>/</i>
            <strong>在线问答</strong>
          </div>
          <div className="header-actions">
            <span className="privacy-badge"><ShieldIcon /> 企业内部</span>
            <button className="mobile-domain-button" type="button" onClick={() => setMobilePanel("domains")}>
              知识范围
            </button>
          </div>
        </header>

        {!hasMessages ? (
          <div className="welcome-canvas">
            <div className="ambient-glow" />
            <div className="orbit orbit-one" />
            <div className="orbit orbit-two" />

            <div className="floating-card card-product">
              <span className="domain-dot blue" />
              <div><small>PRODUCT</small><strong>发布与项目协作</strong></div>
            </div>
            <div className="floating-card card-it">
              <span className="domain-dot violet" />
              <div><small>IT SUPPORT</small><strong>系统与权限</strong></div>
            </div>
            <div className="floating-card card-hr">
              <span className="domain-dot mint" />
              <div><small>PEOPLE</small><strong>HR 与行政</strong></div>
            </div>
            <div className="floating-card card-finance">
              <span className="domain-dot amber" />
              <div><small>FINANCE</small><strong>报销与差旅</strong></div>
            </div>

            <div className="welcome-core">
              <OctopusMark />
              <p className="eyebrow">OCTOPUS TIMES · KNOWLEDGE SPACE</p>
              <h1>章鱼智库</h1>
              <p className="welcome-copy">让制度、流程和经验，随问随取。</p>

              <form className="composer welcome-composer" onSubmit={onSubmit}>
                <div className="composer-topline">
                  <Icon><SearchIcon /></Icon>
                  <textarea
                    ref={inputRef}
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        if (draft.trim()) void submitQuestion(draft);
                      }
                    }}
                    rows={1}
                    placeholder="询问制度、流程、材料或服务时限…"
                    aria-label="输入问题"
                    maxLength={2000}
                  />
                  <button type="submit" disabled={!draft.trim() || isSending} aria-label="发送问题">
                    <SendIcon />
                  </button>
                </div>
                <div className="composer-meta">
                  <span>基于 6 份企业制度文档回答</span>
                  <span><kbd>Enter</kbd> 发送 · <kbd>Shift</kbd> + <kbd>Enter</kbd> 换行</span>
                </div>
              </form>

              <div className="suggestion-row" aria-label="推荐问题">
                {starterQuestions.map((question) => (
                  <button key={question} type="button" onClick={() => void submitQuestion(question)}>
                    {question}
                    <ArrowIcon />
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="chat-view">
            <div className="chat-scroll">
              <div className="chat-thread">
                <div className="thread-heading">
                  <span>当前对话</span>
                  <button type="button" onClick={resetConversation}>清空并新建</button>
                </div>
                {messages.map((message) => (
                  <article key={message.id} className={`message ${message.role} ${message.error ? "error" : ""}`}>
                    {message.role === "assistant" && (
                      <div className="assistant-avatar"><OctopusMark compact /></div>
                    )}
                    <div className="message-body">
                      <div className="message-meta">
                        <strong>{message.role === "assistant" ? "章鱼时代智库" : "你"}</strong>
                        {message.role === "assistant" && <span>依据企业知识库</span>}
                      </div>
                      {message.pending && !message.content ? (
                        <div className="thinking-state">
                          <span /><span /><span />
                          <p>正在检索知识库并整理答案</p>
                        </div>
                      ) : message.role === "assistant" ? (
                        <RichAnswer text={message.content} />
                      ) : (
                        <p className="user-copy">{message.content}</p>
                      )}

                      {!!message.sources?.length && (
                        <div className="source-block">
                          <div className="source-heading"><BookIcon /> 本次引用</div>
                          <div className="source-list">
                            {message.sources.slice(0, 4).map((source, index) => (
                              <div className="source-card" key={`${source.document_name}-${index}`}>
                                <span>DOCX</span>
                                <div>
                                  <strong>{source.document_name || source.dataset_name || "企业知识库文档"}</strong>
                                  {typeof source.score === "number" && <small>相关度 {Math.round(source.score * 100)}%</small>}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </article>
                ))}
                <div ref={endRef} />
              </div>
            </div>

            <div className="chat-composer-wrap">
              <form className="composer chat-composer" onSubmit={onSubmit}>
                <div className="composer-topline">
                  <textarea
                    ref={inputRef}
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        if (draft.trim()) void submitQuestion(draft);
                      }
                    }}
                    rows={1}
                    placeholder="继续追问，或输入新的制度与流程问题…"
                    aria-label="继续输入问题"
                    maxLength={2000}
                  />
                  <button type="submit" disabled={!draft.trim() || isSending} aria-label="发送问题">
                    <SendIcon />
                  </button>
                </div>
                <div className="composer-meta">
                  <span><ShieldIcon /> 回答不会直接披露员工敏感信息</span>
                  <span>{draft.length}/2000</span>
                </div>
              </form>
            </div>
          </div>
        )}
      </section>

      <aside className={`context-panel ${mobilePanel === "domains" ? "open" : ""}`} aria-label="知识范围">
        <div className="context-header">
          <div>
            <span className="panel-kicker">KNOWLEDGE MAP</span>
            <h2>知识航图</h2>
          </div>
          <button type="button" onClick={() => setMobilePanel("none")} aria-label="关闭知识范围">×</button>
        </div>

        <div className="context-summary">
          <div className="knowledge-pulse"><span /><i /></div>
          <div><strong>6 份制度文档</strong><span>覆盖 4 个内部知识域</span></div>
        </div>

        <div className="domain-list">
          {knowledgeDomains.map((domain) => (
            <button key={domain.code} type="button" onClick={() => {
              setMobilePanel("none");
              const match = starterQuestions.find((question) => {
                if (domain.code === "PRODUCT") return question.includes("发布");
                if (domain.code === "IT") return question.includes("VPN");
                if (domain.code === "HR") return question.includes("事假");
                return question.includes("报销");
              });
              if (match) void submitQuestion(match);
            }}>
              <span className={`domain-icon ${domain.tone}`}>{domain.code.slice(0, 1)}</span>
              <div><strong>{domain.name}</strong><small>{domain.code}</small></div>
              <ArrowIcon />
            </button>
          ))}
        </div>

        <div className="context-divider" />

        <div className="live-context">
          <div className="section-title">
            <span>当前检索上下文</span>
            <small>{latestSources.length ? `${latestSources.length} 条引用` : "等待提问"}</small>
          </div>
          {latestSources.length ? (
            latestSources.slice(0, 3).map((source, index) => (
              <div className="mini-source" key={`${source.document_name}-${index}`}>
                <span>{index + 1}</span>
                <p>{source.document_name || source.dataset_name || "企业知识库文档"}</p>
              </div>
            ))
          ) : (
            <div className="empty-context">
              <SearchIcon />
              <p>发送问题后，这里会显示本次回答所依据的知识来源。</p>
            </div>
          )}
        </div>

        <div className="security-note">
          <ShieldIcon />
          <div><strong>安全边界已启用</strong><p>敏感信息、系统提示词与未授权数据不会通过普通对话披露。</p></div>
        </div>
      </aside>

      {mobilePanel !== "none" && <button className="panel-backdrop" type="button" onClick={() => setMobilePanel("none")} aria-label="关闭面板" />}
    </main>
  );
}
