import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  fetchReviewStats,
  loadReviewSession,
  logReviewEvent,
  type ReviewSession,
  type ReviewStats,
} from "../api";

const SENTIMENT_LABEL: Record<string, string> = {
  negative: "负面",
  neutral: "中性",
  positive: "正面",
};

function downloadBlob(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** CSV 单元格转义：引号包裹 + 内部引号翻倍 */
function csvCell(v: string): string {
  return `"${String(v ?? "").replace(/"/g, '""')}"`;
}

export default function ExportPage() {
  const [session] = useState<ReviewSession | null>(() => loadReviewSession());
  const [stats, setStats] = useState<ReviewStats | null>(null);
  const [statsError, setStatsError] = useState("");

  useEffect(() => {
    fetchReviewStats()
      .then(setStats)
      .catch((e) => setStatsError(e instanceof Error ? e.message : String(e)));
  }, []);

  function downloadPrd() {
    if (!session) return;
    logReviewEvent("prd_downloaded", { session_id: session.sessionId, from: "export" });
    downloadBlob(
      session.draft,
      `PRD-${(session.productName || "未命名产品").replace(/\s+/g, "_")}.md`,
      "text/markdown",
    );
  }

  function downloadInsightsJson() {
    if (!session) return;
    logReviewEvent("export_downloaded", {
      session_id: session.sessionId,
      format: "json",
    });
    const payload = {
      exported_at: new Date().toISOString(),
      product_name: session.productName,
      analysis: session.stats,
      topics: session.topics.map((t, i) => ({
        cluster_id: i + 1,
        name: t.name,
        description: t.description,
        sentiment: t.sentiment,
        feedback_count: t.size,
        representative: t.representative,
        samples: t.samples,
      })),
      prd: {
        ai_draft: session.aiDraft,
        final: session.draft,
        human_edited: session.draft !== session.aiDraft,
        generation_elapsed_s: session.elapsed,
      },
    };
    downloadBlob(
      JSON.stringify(payload, null, 2),
      `insights-${(session.productName || "未命名产品").replace(/\s+/g, "_")}.json`,
      "application/json",
    );
  }

  function downloadTopicsCsv() {
    if (!session) return;
    logReviewEvent("export_downloaded", {
      session_id: session.sessionId,
      format: "csv",
    });
    const header = ["簇ID", "主题名", "反馈量", "情感", "概述", "代表原文"];
    const lines = [header.map(csvCell).join(",")];
    session.topics.forEach((t, i) => {
      lines.push(
        [
          String(i + 1),
          t.name,
          String(t.size),
          SENTIMENT_LABEL[t.sentiment] ?? t.sentiment,
          t.description,
          t.representative,
        ]
          .map(csvCell)
          .join(","),
      );
    });
    // BOM：保证 Excel 直接打开中文不乱码（与导入的 BOM 剥离对称）
    downloadBlob(
      "\ufeff" + lines.join("\r\n"),
      `topics-${(session.productName || "未命名产品").replace(/\s+/g, "_")}.csv`,
      "text/csv",
    );
  }

  if (!session) {
    return (
      <section style={{ maxWidth: 760, margin: "0 auto" }}>
        <h2 style={{ marginTop: 0 }}>导出</h2>
        <div
          style={{
            padding: 24,
            border: "1px dashed var(--border)",
            borderRadius: 10,
            textAlign: "center",
            color: "var(--text-muted)",
          }}
        >
          暂无可导出的审核结果。请先在
          <Link to="/insights" style={{ color: "var(--brand)", margin: "0 4px" }}>
            洞察主题页
          </Link>
          生成 PRD 并审核。
        </div>
      </section>
    );
  }

  const humanEdited = session.draft !== session.aiDraft;

  return (
    <section style={{ maxWidth: 960, margin: "0 auto" }}>
      <h2 style={{ marginTop: 0 }}>导出</h2>
      <p style={{ color: "var(--text-muted)" }}>
        审核结果的结构化导出：PRD 正文、完整洞察（含主题样本与 AI 原稿对照）、主题清单表。
      </p>

      {/* 会话概览 */}
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          padding: 16,
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
          fontSize: 13,
        }}
      >
        <strong>{session.productName || "未命名产品"}</strong>
        <span style={{ color: "var(--text-muted)" }}>
          {session.stats.total} 条反馈 · {session.topics.length} 个主题 · 生成耗时{" "}
          {(session.elapsed / 1000).toFixed(1)}s
        </span>
        <span
          style={{
            padding: "2px 8px",
            borderRadius: 4,
            background: humanEdited ? "#fef3c7" : "#dcfce7",
            color: humanEdited ? "#92400e" : "#166534",
          }}
        >
          {humanEdited ? "经人工修改" : "AI 原稿未修改"}
        </span>
      </div>

      {/* 下载卡片 */}
      <div
        style={{
          marginTop: 14,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 12,
        }}
      >
        <DownloadCard
          title="PRD 正文（.md）"
          desc="人工审核后的最终 PRD，可直接入评审流程或导入文档工具。"
          action={downloadPrd}
        />
        <DownloadCard
          title="完整洞察（.json）"
          desc="主题/情感/样本/AI 原稿与终稿对照 + 分析元信息，供二次处理或归档。"
          action={downloadInsightsJson}
        />
        <DownloadCard
          title="主题清单（.csv）"
          desc="簇 ID/主题/反馈量/情感/概述/代表原文，Excel 直接打开（带 BOM）。"
          action={downloadTopicsCsv}
        />
      </div>

      {/* 审核统计 */}
      <div
        style={{
          marginTop: 20,
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          padding: 16,
        }}
      >
        <strong style={{ fontSize: 14 }}>审核日志统计</strong>
        <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "6px 0 10px" }}>
          「PRD 采纳率」= 下载过 PRD 的审核会话 / 有过生成的会话（本地累计，数据地基见
          docs/03-metrics.md）。
        </p>
        {statsError ? (
          <p style={{ fontSize: 13, color: "#b91c1c" }}>统计获取失败：{statsError}</p>
        ) : stats ? (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", fontSize: 12 }}>
            <Stat label="生成" value={`${stats.prd_generated} 次`} />
            <Stat label="人工修改" value={`${stats.prd_edited} 次`} />
            <Stat label="PRD 下载" value={`${stats.prd_downloaded} 次`} />
            <Stat label="结构化导出" value={`${stats.export_downloaded} 次`} />
            <Stat
              label="采纳率"
              value={stats.adoption_rate == null ? "暂无数据" : `${(stats.adoption_rate * 100).toFixed(0)}%`}
              highlight
            />
          </div>
        ) : (
          <p style={{ fontSize: 13, color: "var(--text-muted)" }}>统计加载中…</p>
        )}
      </div>
    </section>
  );
}

function DownloadCard({
  title,
  desc,
  action,
}: {
  title: string;
  desc: string;
  action: () => void;
}) {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <strong style={{ fontSize: 14 }}>{title}</strong>
      <span style={{ fontSize: 12, color: "var(--text-muted)", flex: 1 }}>{desc}</span>
      <button
        onClick={action}
        style={{
          padding: "8px 16px",
          border: "none",
          borderRadius: 6,
          background: "var(--brand)",
          color: "#fff",
          fontWeight: 600,
          alignSelf: "flex-start",
        }}
      >
        下载
      </button>
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <span
      style={{
        background: highlight ? "var(--brand-soft)" : "#fff",
        border: `1px solid ${highlight ? "var(--brand)" : "var(--border)"}`,
        borderRadius: 8,
        padding: "6px 10px",
      }}
    >
      <span style={{ color: "var(--text-muted)" }}>{label}</span>{" "}
      <strong style={highlight ? { color: "var(--brand)" } : undefined}>{value}</strong>
    </span>
  );
}
