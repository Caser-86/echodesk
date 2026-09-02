import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  cleanTexts,
  clusterTexts,
  consumeImportHandoff,
  saveHandoff,
  type CleanResult,
  type ClusterResult,
  type Topic,
} from "../api";
import {
  Alert,
  Badge,
  Button,
  Card,
  Skeleton,
  Stat,
  Stepper,
} from "../components/ui";

/** 内置演示数据：三主题 × 20 条（触发 UMAP+HDBSCAN 主链路） */
const DEMO_TEXTS = [
  // 登录/认证
  "每次登录都要等很久，验证码一直转圈", "手机号登录收不到短信验证码，试了五次",
  "登录页面卡死，只能强制退出重进", "第三方账号登录经常失败，提示授权错误",
  "登录后又被踢回登录页，反复循环", "扫码登录的二维码刷不出来",
  "登录速度太慢了，等得着急", "切换账号的时候系统报错",
  "忘记密码后重置流程太繁琐", "登录时滑块验证码总是识别不过",
  "苹果账号登录闪退", "验证码有效期太短，输入就过期了",
  "同一账号两台设备登录会互相挤掉", "登录页在平板上显示错位",
  "人脸识别登录经常失败", "登录后的加载动画转个不停",
  "密码输入框无法粘贴", "手机验证码一天最多五条，不够用",
  "企业微信扫码登录没反应", "登录成功后又提示会话过期",
  // 导出/报表
  "导出的 Excel 表格全是乱码，打不开", "希望能支持导出成 PDF 格式，现在只有 Excel",
  "导出的数据列和页面上看到的不一致", "导出文件超过一万行就会失败",
  "批量导出的时候字段丢失严重", "导出格式太单一，我们需要 CSV",
  "报表导出后数字变成了科学计数法", "导出按钮点了没反应，也不报错",
  "导出的文件名是乱码的字符串", "希望导出可以自定义列的顺序",
  "导出速度太慢，一份数据要等十分钟", "导出的日期格式不对，变成了英文格式",
  "图表没法导出成图片", "导出权限控制太死，普通成员也需要导出",
  "导出的表格没有表头说明", "希望支持定时自动导出发送到邮箱",
  "导出中断后不能续传，只能重来", "导出后的合计数和页面不一致",
  "移动端没法导出文件", "导出为 Excel 时公式丢失了",
  // 客服/支持
  "客服三天了都没回复我的问题", "在线客服排队要等两个小时",
  "客服给的答案是模板回复，完全没解决问题", "找不到人工客服入口，机器人答非所问",
  "客服电话永远打不通", "提工单之后杳无音信",
  "客服态度很好但是权限太小解决不了", "晚上找不到客服，只有工作日白天有人",
  "客服承诺的回电从来没有兑现", "工单状态显示已解决但问题还在",
  "客服让我重复描述了三遍问题", "智能机器人完全听不懂我的问题",
  "客服热线是空号", "紧急故障找不到值班电话",
  "客服回复很慢，一个问题来回沟通一周", "工单分类选项里没有我要的类别",
  "客服说会升级处理，然后再也没有消息", "节假日完全没有客服支持",
  "客服让我自己去看帮助文档，但文档很旧", "投诉渠道也找不到，体验很差",
];

const STEPS = [
  { key: "clean", label: "清洗" },
  { key: "embed", label: "向量化" },
  { key: "cluster", label: "聚类" },
  { key: "name", label: "命名" },
];

const SENTIMENT_BADGE: Record<Topic["sentiment"], { text: string; tone: "negative" | "neutral" | "positive" }> = {
  negative: { text: "负面", tone: "negative" },
  neutral: { text: "中性", tone: "neutral" },
  positive: { text: "正面", tone: "positive" },
};

type Phase = "idle" | "cleaning" | "clustering" | "done" | "error";

export default function InsightsPage() {
  const navigate = useNavigate();
  const importedFrom = useMemo(() => consumeImportHandoff(), []);
  const [raw, setRaw] = useState(importedFrom ? importedFrom.texts.join("\n") : "");
  const [minSamples, setMinSamples] = useState(5);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState("");
  const [clean, setClean] = useState<CleanResult | null>(null);
  const [cluster, setCluster] = useState<ClusterResult | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [elapsed, setElapsed] = useState(0);

  const lines = useMemo(
    () => raw.split("\n").map((l) => l.trim()).filter(Boolean),
    [raw],
  );

  const running = phase === "cleaning" || phase === "clustering";

  const stepKey = phase === "cleaning" ? "clean" : phase === "clustering" ? "embed" : "done";
  const doneKeys = phase === "done"
    ? ["clean", "embed", "cluster", "name"]
    : phase === "clustering"
      ? ["clean"]
      : [];

  async function analyze() {
    if (lines.length < 3 || running) return;
    setPhase("cleaning");
    setError("");
    setClean(null);
    setCluster(null);
    setExpanded(new Set());
    setSelected(new Set());
    const t0 = performance.now();

    try {
      const c = await cleanTexts(lines);
      setClean(c);
      if (!c.records.length) {
        setError("清洗后无有效反馈，请检查输入。");
        setPhase("error");
        return;
      }
      setPhase("clustering");
      const r = await clusterTexts(c.records, minSamples);
      if (r.status !== "ok") {
        setError(r.message ?? "聚类失败");
        setPhase("error");
        return;
      }
      setCluster(r);
      setElapsed(Math.round(performance.now() - t0));
      setPhase("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("error");
    }
  }

  function goReview() {
    if (!cluster || !clean || selected.size === 0) return;
    const topics = cluster.topics
      .filter((t) => selected.has(t.cluster_id))
      .map((t) => ({
        name: t.name,
        description: t.description,
        sentiment: t.sentiment,
        size: t.size,
        representative: t.representative,
        samples: t.member_indices.slice(0, 10).map((i) => clean.records[i]),
      }));
    saveHandoff({
      savedAt: Date.now(),
      productName: "EchoDesk 示例产品",
      topics,
      stats: {
        total: cluster.total,
        n_clusters: cluster.n_clusters,
        noise_count: cluster.noise_count,
        method: cluster.method,
        embed_backend: cluster.embed_backend,
      },
    });
    navigate("/review");
  }

  function toggleSelect(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleExpand(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const selectedFeedbackCount = cluster?.topics
    .filter((t) => selected.has(t.cluster_id))
    .reduce((s, t) => s + t.size, 0) ?? 0;

  return (
    <section className="container">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="h2" style={{ marginTop: 0 }}>洞察主题</h2>
          <p className="text-muted" style={{ marginTop: 4 }}>
            粘贴用户反馈（每行一条）→ 自动清洗 → AI 聚类 → 主题命名与情感判断。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => setRaw(DEMO_TEXTS.join("\n"))} disabled={running}>
            载入示例数据
          </Button>
          <Button variant="secondary" size="sm" onClick={() => { setRaw(""); setPhase("idle"); setClean(null); setCluster(null); }} disabled={running}>
            清空
          </Button>
        </div>
      </div>

      {importedFrom && (
        <Alert tone="info" className="mt-4">
          已载入导入文件「{importedFrom.filename}」的 {importedFrom.texts.length} 条文本，可直接开始分析或在此编辑。
        </Alert>
      )}

      <Card className="mt-4">
        <textarea
          className="textarea"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          rows={7}
          placeholder={"每行一条用户反馈，例如：\n登录页面加载很慢\n导出的表格是乱码"}
          disabled={running}
        />

        <div className="flex items-center justify-between flex-wrap gap-3 mt-4">
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-muted">
              聚类敏感度 min_samples
              <input
                type="number"
                className="input"
                min={2}
                max={20}
                value={minSamples}
                onChange={(e) => setMinSamples(Number(e.target.value) || 5)}
                disabled={running}
                style={{ width: 70 }}
              />
            </label>
            <span className="text-sm text-muted">共 {lines.length} 条</span>
          </div>
          <Button
            variant="primary"
            onClick={analyze}
            disabled={running || lines.length < 3}
          >
            {phase === "cleaning" ? "清洗中…" : phase === "clustering" ? "聚类与命名中…" : "开始分析"}
          </Button>
        </div>

        {lines.length > 0 && lines.length < 3 && (
          <Alert tone="warning" className="mt-3">
            至少需要 3 条反馈才能聚类。
          </Alert>
        )}
      </Card>

      {phase === "error" && (
        <div className="mt-4">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}

      {(running || phase === "done") && (
        <Card className="mt-4" style={{ padding: "var(--space-4)" }}>
          <Stepper steps={STEPS} current={stepKey} doneKeys={doneKeys} />
        </Card>
      )}

      {running && (
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
            {phase === "cleaning" ? "正在清洗：去空、去重、脱敏…" : "正在向量化与聚类：UMAP 降维 → HDBSCAN 密度聚类 → LLM 命名…"}
          </div>
          <div className="flex flex-col gap-3">
            <Skeleton width="100%" height={64} />
            <Skeleton width="85%" height={64} />
            <Skeleton width="70%" height={64} />
          </div>
        </Card>
      )}

      {clean && phase !== "error" && !running && (
        <Alert tone="success" className="mt-4">
          清洗完成：{clean.original_count} 条输入 → {clean.valid_count} 条有效
          （去空 {clean.dropped_empty} · 去重 {clean.dropped_duplicate} · 截断 {clean.truncated} · 脱敏 {clean.masked}）
        </Alert>
      )}

      {cluster && phase === "done" && (
        <>
          <div className="flex flex-wrap gap-2 mt-4">
            <Stat label="有效反馈" value={cluster.total} />
            <Stat label="主题簇" value={cluster.n_clusters} />
            <Stat label="噪声/未归类" value={cluster.noise_count} />
            <Stat label="聚类方法" value={cluster.method.toUpperCase()} />
            <Stat label="向量后端" value={cluster.embed_backend} />
            <Stat label="耗时" value={`${(elapsed / 1000).toFixed(1)}s`} />
            {cluster.llm.degraded && (
              <Badge tone="warning" title={cluster.llm.last_error}>LLM 已降级 mock</Badge>
            )}
          </div>

          <div className="flex flex-col gap-3 mt-5">
            {cluster.topics.map((t) => {
              const isOpen = expanded.has(t.cluster_id);
              const isSel = selected.has(t.cluster_id);
              const sb = SENTIMENT_BADGE[t.sentiment];
              return (
                <Card
                  key={t.cluster_id}
                  hover
                  style={{
                    borderColor: isSel ? "var(--brand)" : undefined,
                    boxShadow: isSel ? "0 0 0 1px var(--brand)" : undefined,
                    padding: 0,
                    overflow: "hidden",
                  }}
                >
                  <div style={{ padding: "var(--space-4)" }}>
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={isSel}
                        onChange={() => toggleSelect(t.cluster_id)}
                        title="纳入 PRD 生成"
                        style={{ marginTop: 4 }}
                      />
                      <div style={{ flex: 1 }}>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="h3" style={{ margin: 0 }}>{t.name}</h3>
                          <Badge tone={sb.tone}>{sb.text}</Badge>
                          <Badge tone="brand">{t.size} 条反馈</Badge>
                        </div>
                        <p className="text-secondary mt-2" style={{ margin: 0 }}>
                          {t.description}
                        </p>

                        <blockquote
                          style={{
                            margin: "var(--space-3) 0 0",
                            padding: "var(--space-2) var(--space-3)",
                            borderLeft: "3px solid var(--brand)",
                            background: "var(--bg)",
                            borderRadius: "0 var(--radius-md) var(--radius-md) 0",
                            color: "var(--text-secondary)",
                            fontSize: "var(--text-sm)",
                          }}
                        >
                          代表原文：「{t.representative}」
                        </blockquote>

                        <div className="mt-3">
                          <button
                            onClick={() => toggleExpand(t.cluster_id)}
                            className="btn btn-ghost btn-sm"
                            style={{ paddingLeft: 0 }}
                          >
                            {isOpen ? "收起成员原文 ▲" : `展开全部 ${t.size} 条原文 ▼`}
                          </button>
                        </div>

                        {isOpen && (
                          <ul
                            style={{
                              margin: "var(--space-3) 0 0",
                              paddingLeft: "var(--space-5)",
                              fontSize: "var(--text-sm)",
                              color: "var(--text-secondary)",
                            }}
                          >
                            {t.member_indices.map((i) => (
                              <li key={i} style={{ padding: "3px 0" }}>
                                {clean?.records[i]}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>

          {selected.size > 0 && (
            <Card
              className="mt-4"
              style={{
                border: "1px dashed var(--brand)",
                background: "var(--brand-50)",
              }}
            >
              <div className="flex items-center justify-between flex-wrap gap-3">
                <span style={{ color: "var(--brand-600)", fontSize: "var(--text-sm)" }}>
                  已勾选 <strong>{selected.size}</strong> 个主题，覆盖 <strong>{selectedFeedbackCount}</strong> 条反馈
                </span>
                <Button variant="primary" onClick={goReview}>
                  生成 PRD →
                </Button>
              </div>
            </Card>
          )}
        </>
      )}
    </section>
  );
}
