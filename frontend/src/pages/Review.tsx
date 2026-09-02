import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  generatePrd,
  loadHandoff,
  logReviewEvent,
  saveReviewSession,
  type PrdHandoff,
} from "../api";
import { Alert, Badge, Button, Card, EmptyState, Skeleton, Stat } from "../components/ui";
import DiffView from "../components/DiffView";

type Phase = "ready" | "generating" | "generated" | "error";
type ViewMode = "edit" | "diff";

const SENTIMENT_BADGE: Record<string, { text: string; tone: "negative" | "neutral" | "positive" }> = {
  negative: { text: "负面", tone: "negative" },
  neutral: { text: "中性", tone: "neutral" },
  positive: { text: "正面", tone: "positive" },
};

export default function ReviewPage() {
  const [handoff] = useState<PrdHandoff | null>(() => loadHandoff());
  const [productName, setProductName] = useState(handoff?.productName ?? "");
  const [phase, setPhase] = useState<Phase>("ready");
  const [error, setError] = useState("");
  const [aiDraft, setAiDraft] = useState("");
  const [draft, setDraft] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>("edit");
  const [sessionId] = useState(() =>
    `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
  );
  const editLogged = useRef(false);

  const generating = phase === "generating";
  const edited = phase === "generated" && draft !== aiDraft;

  function persistSession(nextDraft: string) {
    if (!handoff) return;
    saveReviewSession({
      savedAt: Date.now(),
      sessionId,
      productName,
      aiDraft,
      draft: nextDraft,
      elapsed,
      topics: handoff.topics,
      stats: handoff.stats,
    });
  }

  async function generate() {
    if (!handoff || generating) return;
    setPhase("generating");
    setError("");
    const t0 = performance.now();
    try {
      const r = await generatePrd(productName, handoff.topics);
      if (r.status !== "ok" || !r.prd_markdown) {
        setError(r.message ?? "PRD 生成失败");
        setPhase("error");
        return;
      }
      setAiDraft(r.prd_markdown);
      setDraft(r.prd_markdown);
      const sec = Math.round(performance.now() - t0);
      setElapsed(sec);
      setPhase("generated");
      setViewMode("edit");
      editLogged.current = false;
      logReviewEvent("prd_generated", {
        session_id: sessionId,
        n_topics: handoff.topics.length,
        total_feedback: handoff.topics.reduce((s, t) => s + t.size, 0),
        elapsed_s: sec,
        is_mock: r.is_mock ?? false,
      });
      saveReviewSession({
        savedAt: Date.now(),
        sessionId,
        productName,
        aiDraft: r.prd_markdown,
        draft: r.prd_markdown,
        elapsed: sec,
        topics: handoff.topics,
        stats: handoff.stats,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("error");
    }
  }

  function onDraftChange(value: string) {
    setDraft(value);
    if (phase === "generated") {
      if (!editLogged.current && value !== aiDraft) {
        editLogged.current = true;
        logReviewEvent("prd_edited", { session_id: sessionId });
      }
      persistSession(value);
    }
  }

  function download() {
    logReviewEvent("prd_downloaded", { session_id: sessionId });
    persistSession(draft);
    const blob = new Blob([draft], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `PRD-${(productName || "未命名产品").replace(/\s+/g, "_")}-${new Date()
      .toISOString()
      .slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!handoff) {
    return (
      <section className="container-narrow">
        <h2 className="h2" style={{ marginTop: 0 }}>PRD 审核</h2>
        <EmptyState icon="📝">
          暂无待审核的 PRD。请先在
          <Link to="/insights" style={{ color: "var(--brand)", margin: "0 4px" }}>
            洞察主题页
          </Link>
          勾选主题并点击「生成 PRD」。
        </EmptyState>
      </section>
    );
  }

  return (
    <section className="container">
      <h2 className="h2" style={{ marginTop: 0 }}>PRD 审核</h2>
      <p className="text-muted" style={{ marginTop: 4 }}>
        AI 基于勾选主题生成 PRD 草稿 → 人工审核编辑 → 导出。所有需求均标注来源主题，可回溯到原始反馈。
      </p>

      {/* 输入概览 */}
      <Card className="mt-4">
        <div className="flex items-center gap-3 flex-wrap">
          <h3 className="h3" style={{ margin: 0 }}>输入概览</h3>
          <span className="text-sm text-muted">
            {handoff.stats.total} 条反馈 · {handoff.stats.n_clusters} 个主题簇 · {handoff.stats.method.toUpperCase()} · {handoff.stats.embed_backend}
          </span>
        </div>

        <div className="flex flex-wrap gap-2 mt-3">
          {handoff.topics.map((t) => {
            const sb = SENTIMENT_BADGE[t.sentiment] ?? SENTIMENT_BADGE.neutral;
            return (
              <span
                key={t.name}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "var(--space-1)",
                  padding: "4px 10px",
                  borderRadius: "var(--radius-full)",
                  border: "1px solid var(--border)",
                  background: "var(--surface)",
                  fontSize: "var(--text-sm)",
                }}
                title={t.description}
              >
                {t.name} · {t.size} 条 · <Badge tone={sb.tone}>{sb.text}</Badge>
              </span>
            );
          })}
        </div>

        <div className="flex items-center justify-between flex-wrap gap-3 mt-4" style={{ padding: "var(--space-3)", background: "var(--bg)", borderRadius: "var(--radius-md)" }}>
          <label className="flex items-center gap-2 text-sm text-secondary">
            产品名称
            <input
              className="input"
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              style={{ width: 240 }}
              placeholder="例如：EchoDesk 示例产品"
            />
          </label>
          <Button variant="primary" onClick={generate} disabled={generating}>
            {generating ? "AI 生成中（约 1 分钟）…" : phase === "generated" ? "重新生成" : "生成 PRD 草稿"}
          </Button>
        </div>
      </Card>

      {phase === "error" && (
        <div className="mt-4">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}

      {generating && (
        <Card className="mt-4">
          <div className="flex items-center gap-3 text-sm text-muted mb-4">
            <span
              style={{
                width: 16,
                height: 16,
                border: "2px solid var(--border)",
                borderTopColor: "var(--brand)",
                borderRadius: "50%",
                animation: "spin 0.8s linear infinite",
              }}
            />
            AI 正在生成 PRD 草稿，包含需求背景、用户故事、功能规格、验收标准、风险与开放问题…
          </div>
          <div className="flex flex-col gap-3">
            <Skeleton width="100%" height={18} />
            <Skeleton width="92%" height={18} />
            <Skeleton width="88%" height={18} />
            <Skeleton width="95%" height={18} />
          </div>
        </Card>
      )}

      {phase === "generated" && (
        <>
          <Card className="mt-4" style={{ padding: "var(--space-3) var(--space-4)" }}>
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                <Stat label="生成耗时" value={`${(elapsed / 1000).toFixed(1)}s`} />
                <Stat label="主题" value={handoff.topics.length} />
                <Stat label="覆盖反馈" value={handoff.topics.reduce((s, t) => s + t.size, 0)} />
                {edited ? (
                  <Badge tone="warning">已人工修改</Badge>
                ) : (
                  <Badge tone="success">AI 原稿未修改</Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                {edited && (
                  <Button variant="secondary" size="sm" onClick={() => setDraft(aiDraft)}>
                    还原 AI 原稿
                  </Button>
                )}
                <Button variant="primary" size="sm" onClick={download}>
                  下载 Markdown
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-2 mt-3" style={{ borderTop: "1px solid var(--border)", paddingTop: "var(--space-3)" }}>
              <span className="text-sm text-muted">视图：</span>
              <button
                className={`btn btn-sm ${viewMode === "edit" ? "btn-secondary" : "btn-ghost"}`}
                onClick={() => setViewMode("edit")}
              >
                编辑模式
              </button>
              <button
                className={`btn btn-sm ${viewMode === "diff" ? "btn-secondary" : "btn-ghost"}`}
                onClick={() => setViewMode("diff")}
              >
                Diff 对比
              </button>
            </div>
          </Card>

          {viewMode === "edit" ? (
            <Card className="mt-3">
              <textarea
                className="textarea"
                value={draft}
                onChange={(e) => onDraftChange(e.target.value)}
                rows={28}
                spellCheck={false}
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "var(--text-sm)",
                  lineHeight: 1.75,
                  border: "none",
                  boxShadow: "none",
                  padding: 0,
                }}
              />
              <p className="text-muted mt-3" style={{ fontSize: "var(--text-xs)" }}>
                审核提示：重点核对「风险与开放问题」章节——那是 AI 明确列出需要 PM 决策的事项。
              </p>
            </Card>
          ) : (
            <div className="mt-3">
              <DiffView before={aiDraft} after={draft} />
            </div>
          )}
        </>
      )}
    </section>
  );
}
