import { useState } from "react";
import { Link } from "react-router-dom";
import { generatePrd, loadHandoff, type PrdHandoff } from "../api";

type Phase = "ready" | "generating" | "generated" | "error";

const SENTIMENT_LABEL: Record<string, { text: string; color: string }> = {
  negative: { text: "负面", color: "#b91c1c" },
  neutral: { text: "中性", color: "#a16207" },
  positive: { text: "正面", color: "#15803d" },
};

export default function ReviewPage() {
  // handoff 只在挂载时读一次（洞察页每次进入会覆盖写入）
  const [handoff] = useState<PrdHandoff | null>(() => loadHandoff());
  const [productName, setProductName] = useState(handoff?.productName ?? "");
  const [phase, setPhase] = useState<Phase>("ready");
  const [error, setError] = useState("");
  const [aiDraft, setAiDraft] = useState(""); // AI 原稿（还原用）
  const [draft, setDraft] = useState(""); // 当前编辑内容
  const [elapsed, setElapsed] = useState(0);

  const generating = phase === "generating";
  const edited = phase === "generated" && draft !== aiDraft;

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
      setElapsed(Math.round(performance.now() - t0));
      setPhase("generated");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("error");
    }
  }

  function download() {
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

  // 无交接数据：引导回洞察页
  if (!handoff) {
    return (
      <section style={{ maxWidth: 760, margin: "0 auto" }}>
        <h2 style={{ marginTop: 0 }}>PRD 审核</h2>
        <div
          style={{
            padding: 24,
            border: "1px dashed var(--border)",
            borderRadius: 10,
            textAlign: "center",
            color: "var(--text-muted)",
          }}
        >
          暂无待审核的 PRD。请先在
          <Link to="/insights" style={{ color: "var(--brand)", margin: "0 4px" }}>
            洞察主题页
          </Link>
          勾选主题并点击「生成 PRD」。
        </div>
      </section>
    );
  }

  return (
    <section style={{ maxWidth: 960, margin: "0 auto" }}>
      <h2 style={{ marginTop: 0 }}>PRD 审核</h2>
      <p style={{ color: "var(--text-muted)" }}>
        AI 基于勾选主题生成 PRD 草稿 → 人工审核编辑 → 导出。所有需求均标注来源主题，可回溯到原始反馈。
      </p>

      {/* 输入概览 */}
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          padding: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <strong>输入概览</strong>
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
            {handoff.stats.total} 条反馈 · {handoff.stats.n_clusters} 个主题簇 · 方法{" "}
            {handoff.stats.method.toUpperCase()} · 向量 {handoff.stats.embed_backend}
          </span>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
          {handoff.topics.map((t) => {
            const s = SENTIMENT_LABEL[t.sentiment] ?? SENTIMENT_LABEL.neutral;
            return (
              <span
                key={t.name}
                style={{
                  fontSize: 12,
                  padding: "4px 10px",
                  borderRadius: 999,
                  border: "1px solid var(--border)",
                  background: "#fff",
                }}
                title={t.description}
              >
                {t.name} · {t.size} 条 ·{" "}
                <span style={{ color: s.color }}>{s.text}</span>
              </span>
            );
          })}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14 }}>
          <label style={{ fontSize: 13, color: "var(--text-muted)" }}>
            产品名称：
            <input
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              style={{
                marginLeft: 6,
                padding: "6px 10px",
                width: 220,
                border: "1px solid var(--border)",
                borderRadius: 6,
              }}
            />
          </label>
          <button
            onClick={generate}
            disabled={generating}
            style={{
              marginLeft: "auto",
              padding: "8px 22px",
              border: "none",
              borderRadius: 6,
              background: generating ? "var(--text-muted)" : "var(--brand)",
              color: "#fff",
              fontWeight: 600,
            }}
          >
            {generating ? "AI 生成中（约 1 分钟）…" : phase === "generated" ? "重新生成" : "生成 PRD 草稿"}
          </button>
        </div>
      </div>

      {/* 错误 */}
      {phase === "error" && (
        <div
          style={{
            marginTop: 14,
            padding: "10px 14px",
            borderRadius: 8,
            background: "#fef2f2",
            border: "1px solid #fecaca",
            color: "#b91c1c",
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}

      {/* 草稿审核区 */}
      {phase === "generated" && (
        <>
          <div
            style={{
              marginTop: 14,
              display: "flex",
              alignItems: "center",
              gap: 10,
              fontSize: 12,
              flexWrap: "wrap",
            }}
          >
            <span style={{ color: "var(--text-muted)" }}>
              生成耗时 {(elapsed / 1000).toFixed(1)}s · {handoff.topics.length} 个主题 ·{" "}
              {handoff.topics.reduce((s, t) => s + t.size, 0)} 条反馈
            </span>
            {edited ? (
              <span
                style={{ padding: "2px 8px", borderRadius: 4, background: "#fef3c7", color: "#92400e" }}
              >
                已人工修改（可「还原 AI 原稿」对比）
              </span>
            ) : (
              <span
                style={{ padding: "2px 8px", borderRadius: 4, background: "#dcfce7", color: "#166534" }}
              >
                AI 原稿，未修改
              </span>
            )}
            {edited && (
              <button
                onClick={() => setDraft(aiDraft)}
                style={{
                  fontSize: 12,
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  background: "#fff",
                  padding: "4px 10px",
                }}
              >
                还原 AI 原稿
              </button>
            )}
            <button
              onClick={download}
              style={{
                marginLeft: "auto",
                fontSize: 13,
                border: "none",
                borderRadius: 6,
                background: "var(--brand)",
                color: "#fff",
                fontWeight: 600,
                padding: "6px 16px",
              }}
            >
              下载 Markdown
            </button>
          </div>

          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={30}
            spellCheck={false}
            style={{
              width: "100%",
              marginTop: 10,
              padding: 16,
              fontFamily: "Consolas, Menlo, monospace",
              fontSize: 13,
              lineHeight: 1.7,
              border: "1px solid var(--border)",
              borderRadius: 10,
              background: "#fff",
              resize: "vertical",
            }}
          />
          <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
            审核提示：重点核对「风险与开放问题」章节——那是 AI 明确列出需要 PM 决策的事项。
          </p>
        </>
      )}
    </section>
  );
}
