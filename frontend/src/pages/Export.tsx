import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  fetchReviewStats,
  loadReviewSession,
  logReviewEvent,
  type ReviewSession,
  type ReviewStats,
} from "../api";
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Skeleton,
  Stat,
} from "../components/ui";

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
    logReviewEvent("export_downloaded", { session_id: session.sessionId, format: "json" });
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
    logReviewEvent("export_downloaded", { session_id: session.sessionId, format: "csv" });
    const header = ["簇ID", "主题名", "反馈量", "情感", "概述", "代表原文"];
    const lines = [header.map(csvCell).join(",")];
    session.topics.forEach((t, i) => {
      lines.push(
        [String(i + 1), t.name, String(t.size), SENTIMENT_LABEL[t.sentiment] ?? t.sentiment, t.description, t.representative]
          .map(csvCell)
          .join(","),
      );
    });
    downloadBlob(
      "\ufeff" + lines.join("\r\n"),
      `topics-${(session.productName || "未命名产品").replace(/\s+/g, "_")}.csv`,
      "text/csv",
    );
  }

  if (!session) {
    return (
      <section className="container-narrow">
        <h2 className="h2" style={{ marginTop: 0 }}>导出</h2>
        <EmptyState icon="📦">
          暂无可导出的审核结果。请先在
          <Link to="/insights" style={{ color: "var(--brand)", margin: "0 4px" }}>
            洞察主题页
          </Link>
          生成 PRD 并审核。
        </EmptyState>
      </section>
    );
  }

  const humanEdited = session.draft !== session.aiDraft;

  return (
    <section className="container">
      <h2 className="h2" style={{ marginTop: 0 }}>导出</h2>
      <p className="text-muted" style={{ marginTop: 4 }}>
        审核结果的结构化导出：PRD 正文、完整洞察（含主题样本与 AI 原稿对照）、主题清单表。
      </p>

      <Card className="mt-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <h3 className="h3" style={{ margin: 0 }}>{session.productName || "未命名产品"}</h3>
            {humanEdited ? <Badge tone="warning">经人工修改</Badge> : <Badge tone="success">AI 原稿未修改</Badge>}
          </div>
          <div className="flex items-center gap-2">
            <Stat label="反馈" value={session.stats.total} />
            <Stat label="主题" value={session.topics.length} />
            <Stat label="生成耗时" value={`${(session.elapsed / 1000).toFixed(1)}s`} />
          </div>
        </div>
      </Card>

      <div
        className="mt-4"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: "var(--space-3)",
        }}
      >
        <DownloadCard
          icon="📝"
          title="PRD 正文（.md）"
          desc="人工审核后的最终 PRD，可直接入评审流程或导入文档工具。"
          action={downloadPrd}
        />
        <DownloadCard
          icon="🗂️"
          title="完整洞察（.json）"
          desc="主题/情感/样本/AI 原稿与终稿对照 + 分析元信息，供二次处理或归档。"
          action={downloadInsightsJson}
        />
        <DownloadCard
          icon="📊"
          title="主题清单（.csv）"
          desc="簇 ID/主题/反馈量/情感/概述/代表原文，Excel 直接打开（带 BOM）。"
          action={downloadTopicsCsv}
        />
      </div>

      <Card className="mt-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 className="h3" style={{ margin: 0 }}>审核日志统计</h3>
            <p className="text-muted mt-1" style={{ fontSize: "var(--text-xs)" }}>
              「PRD 采纳率」= 下载过 PRD 的审核会话 / 有过生成的会话
            </p>
          </div>
          {stats && stats.adoption_rate != null && (
            <div
              style={{
                width: 80,
                height: 80,
                borderRadius: "50%",
                background: `conic-gradient(var(--brand) ${stats.adoption_rate * 360}deg, var(--border) 0deg)`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 700,
                fontSize: "var(--text-lg)",
                color: "var(--brand-600)",
              }}
            >
              <span
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: "50%",
                  background: "var(--surface)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {(stats.adoption_rate * 100).toFixed(0)}%
              </span>
            </div>
          )}
        </div>

        {statsError ? (
          <Alert tone="danger" className="mt-4">统计获取失败：{statsError}</Alert>
        ) : stats ? (
          <div className="flex flex-wrap gap-2 mt-4">
            <Stat label="生成" value={`${stats.prd_generated} 次`} />
            <Stat label="人工修改" value={`${stats.prd_edited} 次`} />
            <Stat label="PRD 下载" value={`${stats.prd_downloaded} 次`} />
            <Stat label="结构化导出" value={`${stats.export_downloaded} 次`} />
            <Stat
              label="采纳率"
              value={stats.adoption_rate == null ? "暂无数据" : `${(stats.adoption_rate * 100).toFixed(0)}%`}
            />
          </div>
        ) : (
          <div className="flex flex-wrap gap-2 mt-4">
            <Skeleton width={90} height={32} />
            <Skeleton width={90} height={32} />
            <Skeleton width={90} height={32} />
          </div>
        )}
      </Card>
    </section>
  );
}

function DownloadCard({
  icon,
  title,
  desc,
  action,
}: {
  icon: string;
  title: string;
  desc: string;
  action: () => void;
}) {
  return (
    <Card hover style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)", padding: "var(--space-4)" }}>
      <div style={{ fontSize: 32 }}>{icon}</div>
      <div>
        <h4 className="h3" style={{ margin: 0, fontSize: "var(--text-md)" }}>{title}</h4>
        <p className="text-muted mt-1" style={{ fontSize: "var(--text-sm)", margin: 0 }}>{desc}</p>
      </div>
      <Button variant="primary" size="sm" onClick={action} style={{ alignSelf: "flex-start", marginTop: "auto" }}>
        下载
      </Button>
    </Card>
  );
}
