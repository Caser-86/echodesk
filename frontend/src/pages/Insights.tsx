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

const SENTIMENT_LABEL: Record<Topic["sentiment"], { text: string; color: string }> = {
  negative: { text: "负面", color: "#b91c1c" },
  neutral: { text: "中性", color: "#a16207" },
  positive: { text: "正面", color: "#15803d" },
};

type Phase = "idle" | "cleaning" | "clustering" | "done" | "error";

export default function InsightsPage() {
  const navigate = useNavigate();
  // 导入页交接的数据一次性消费：预填文本区，刷新不重复导入
  const [importedFrom] = useState(() => consumeImportHandoff());
  const [raw, setRaw] = useState(importedFrom ? importedFrom.texts.join("\n") : "");
  const [minSamples, setMinSamples] = useState(5);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState("");
  const [clean, setClean] = useState<CleanResult | null>(null);
  const [cluster, setCluster] = useState<ClusterResult | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [elapsed, setElapsed] = useState(0);

  const lines = useMemo(
    () => raw.split("\n").map((l) => l.trim()).filter(Boolean),
    [raw],
  );

  const running = phase === "cleaning" || phase === "clustering";

  async function analyze() {
    if (lines.length < 3 || running) return;
    setPhase("cleaning");
    setError("");
    setClean(null);
    setCluster(null);
    setExpanded(null);
    setSelected(new Set());
    const t0 = performance.now();

    try {
      // 管线串联：清洗（去空/去重/脱敏）→ 聚类（embedding→降维→HDBSCAN→LLM 命名）
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

  /** 勾选主题 → 组装 handoff（含成员原文样本）→ 跳审核页 */
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

  return (
    <section style={{ maxWidth: 960, margin: "0 auto" }}>
      <h2 style={{ marginTop: 0 }}>洞察主题</h2>
      <p style={{ color: "var(--text-muted)" }}>
        粘贴用户反馈（每行一条）→ 自动清洗 → AI 聚类 → 主题命名与情感判断。
      </p>

      {importedFrom && (
        <div
          style={{
            padding: "8px 14px",
            borderRadius: 8,
            background: "var(--brand-soft)",
            border: "1px solid var(--border)",
            fontSize: 13,
            color: "var(--text-muted)",
            marginBottom: 12,
          }}
        >
          已载入导入文件「{importedFrom.filename}」的 {importedFrom.texts.length} 条文本，
          可直接开始分析或在此编辑。
        </div>
      )}

      {/* 输入与参数 */}
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          padding: 16,
        }}
      >
        <div style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
          <button
            onClick={() => setRaw(DEMO_TEXTS.join("\n"))}
            disabled={running}
            style={{
              padding: "6px 12px",
              border: "1px solid var(--border)",
              borderRadius: 6,
              background: "#fff",
            }}
          >
            载入示例数据（60 条）
          </button>
          <button
            onClick={() => { setRaw(""); setPhase("idle"); setClean(null); setCluster(null); }}
            disabled={running}
            style={{
              padding: "6px 12px",
              border: "1px solid var(--border)",
              borderRadius: 6,
              background: "#fff",
            }}
          >
            清空
          </button>
          <span style={{ marginLeft: "auto", fontSize: 13, color: "var(--text-muted)" }}>
            共 {lines.length} 条
          </span>
        </div>

        <textarea
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          rows={8}
          placeholder={"每行一条用户反馈，例如：\n登录页面加载很慢\n导出的表格是乱码"}
          style={{
            width: "100%",
            padding: 10,
            fontFamily: "inherit",
            fontSize: 13,
            border: "1px solid var(--border)",
            borderRadius: 6,
            resize: "vertical",
            background: "#fff",
          }}
        />

        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 10 }}>
          <label style={{ fontSize: 13, color: "var(--text-muted)" }}>
            聚类敏感度 min_samples：
            <input
              type="number"
              min={2}
              max={20}
              value={minSamples}
              onChange={(e) => setMinSamples(Number(e.target.value) || 5)}
              style={{ width: 60, marginLeft: 6, padding: "4px 6px", border: "1px solid var(--border)", borderRadius: 4 }}
            />
          </label>
          <button
            onClick={analyze}
            disabled={running || lines.length < 3}
            style={{
              marginLeft: "auto",
              padding: "8px 22px",
              border: "none",
              borderRadius: 6,
              background: running ? "var(--text-muted)" : "var(--brand)",
              color: "#fff",
              fontWeight: 600,
            }}
          >
            {phase === "cleaning" ? "清洗中…" : phase === "clustering" ? "聚类与命名中…" : "开始分析"}
          </button>
        </div>

        {lines.length > 0 && lines.length < 3 && (
          <p style={{ fontSize: 12, color: "#b91c1c", margin: "8px 0 0" }}>
            至少需要 3 条反馈才能聚类。
          </p>
        )}
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

      {/* 清洗报告 */}
      {clean && (
        <div
          style={{
            marginTop: 14,
            padding: "10px 14px",
            borderRadius: 8,
            background: "var(--brand-soft)",
            border: "1px solid var(--border)",
            fontSize: 13,
            color: "var(--text-muted)",
          }}
        >
          清洗完成：{clean.original_count} 条输入 → {clean.valid_count} 条有效
          （去空 {clean.dropped_empty} · 去重 {clean.dropped_duplicate} · 截断 {clean.truncated} · 脱敏 {clean.masked}）
        </div>
      )}

      {/* 聚类统计 */}
      {cluster && phase === "done" && (
        <div
          style={{
            marginTop: 14,
            display: "flex",
            flexWrap: "wrap",
            gap: 10,
            fontSize: 12,
          }}
        >
          <Stat label="有效反馈" value={`${cluster.total}`} />
          <Stat label="主题簇" value={`${cluster.n_clusters}`} />
          <Stat label="噪声/未归类" value={`${cluster.noise_count}`} />
          <Stat label="聚类方法" value={cluster.method.toUpperCase()} />
          <Stat label="向量后端" value={cluster.embed_backend} />
          <Stat label="耗时" value={`${(elapsed / 1000).toFixed(1)}s`} />
          {cluster.llm.degraded && (
            <span
              style={{
                alignSelf: "center",
                padding: "2px 8px",
                borderRadius: 4,
                background: "#fef3c7",
                color: "#92400e",
              }}
              title={cluster.llm.last_error}
            >
              LLM 已降级 mock（真实调用失败）
            </span>
          )}
        </div>
      )}

      {/* 簇卡片 */}
      {cluster?.topics.map((t) => {
        const isOpen = expanded === t.cluster_id;
        const isSel = selected.has(t.cluster_id);
        const s = SENTIMENT_LABEL[t.sentiment];
        return (
          <div
            key={t.cluster_id}
            style={{
              marginTop: 12,
              background: "var(--surface)",
              border: `1px solid ${isSel ? "var(--brand)" : "var(--border)"}`,
              borderRadius: 10,
              padding: "14px 16px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <input
                type="checkbox"
                checked={isSel}
                onChange={() => toggleSelect(t.cluster_id)}
                title="纳入 PRD 生成（M5）"
              />
              <strong style={{ fontSize: 15 }}>{t.name}</strong>
              <span
                style={{
                  fontSize: 12,
                  padding: "2px 8px",
                  borderRadius: 999,
                  background: `${s.color}1a`,
                  color: s.color,
                }}
              >
                {s.text}
              </span>
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{t.size} 条</span>
              <button
                onClick={() => setExpanded(isOpen ? null : t.cluster_id)}
                style={{
                  marginLeft: "auto",
                  fontSize: 12,
                  border: "none",
                  background: "none",
                  color: "var(--brand)",
                }}
              >
                {isOpen ? "收起原文 ▲" : `展开原文（${t.size}）▼`}
              </button>
            </div>

            <p style={{ margin: "8px 0 6px", fontSize: 13, color: "var(--text)" }}>
              {t.description}
            </p>

            <div
              style={{
                fontSize: 13,
                background: "#fafafa",
                borderLeft: "3px solid var(--brand)",
                padding: "6px 10px",
                borderRadius: 4,
                color: "var(--text-muted)",
              }}
            >
              代表原文：「{t.representative}」
            </div>

            {isOpen && (
              <ul style={{ margin: "10px 0 0", paddingLeft: 20, fontSize: 13 }}>
                {t.member_indices.map((i) => (
                  <li key={i} style={{ padding: "2px 0", color: "var(--text)" }}>
                    {clean?.records[i]}
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}

      {/* 已选主题 → M5 PRD 生成入口 */}
      {selected.size > 0 && (
        <div
          style={{
            marginTop: 14,
            padding: "12px 14px",
            borderRadius: 8,
            border: "1px dashed var(--brand)",
            fontSize: 13,
            color: "var(--brand)",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <span>
            已勾选 {selected.size} 个主题（覆盖{" "}
            {cluster?.topics
              .filter((t) => selected.has(t.cluster_id))
              .reduce((s, t) => s + t.size, 0)}{" "}
            条反馈），可生成 PRD 草稿。
          </span>
          <button
            onClick={goReview}
            style={{
              marginLeft: "auto",
              padding: "6px 16px",
              border: "none",
              borderRadius: 6,
              background: "var(--brand)",
              color: "#fff",
              fontWeight: 600,
            }}
          >
            生成 PRD →
          </button>
        </div>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        padding: "6px 10px",
      }}
    >
      <span style={{ color: "var(--text-muted)" }}>{label}</span>{" "}
      <strong>{value}</strong>
    </span>
  );
}
