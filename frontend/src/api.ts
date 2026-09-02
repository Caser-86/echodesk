import { useEffect, useState } from "react";

// 统一后端基址：开发走 Vite 代理 /api，故直接用相对路径
export const API_BASE = "";

/** 启动时 ping 一次 /api/health 获取后端连接状态 */
export function usePingBackend(): string {
  const [status, setStatus] = useState<"loading" | "ok" | "down">("loading");

  useEffect(() => {
    fetch(`${API_BASE}/api/health`)
      .then((r) => (r.ok ? setStatus("ok") : setStatus("down")))
      .catch(() => setStatus("down"));
  }, []);

  if (status === "ok") return "ok";
  return status === "down" ? "未连接" : "连接中";
}

/** 订阅 SSE 进度通道 */
export async function subscribePipeline(onStage: (stage: string) => void): Promise<() => void> {
  const es = new EventSource(`${API_BASE}/api/pipeline/stream`);
  es.addEventListener("progress", (e) => onStage((e as MessageEvent).data));
  return () => es.close();
}

// ---------- M2 清洗 / M3 聚类 ----------

export interface CleanResult {
  stage: "clean";
  status: string;
  original_count: number;
  valid_count: number;
  dropped_empty: number;
  dropped_duplicate: number;
  truncated: number;
  masked: number;
  records: string[];
}

export interface Topic {
  cluster_id: number;
  size: number;
  member_indices: number[];
  name: string;
  description: string;
  sentiment: "positive" | "neutral" | "negative";
  representative: string;
  parse_error?: string;
}

export interface ClusterResult {
  stage: "cluster";
  status: string;
  total: number;
  n_clusters: number;
  noise_count: number;
  method: string;
  embed_backend: string;
  silhouette: number | null;
  detail: string;
  topics: Topic[];
  llm: {
    llm_mode: string;
    degraded: boolean;
    last_error: string;
    embed_degraded: boolean;
    last_embed_error: string;
  };
  message?: string;
}

/** M2 清洗：去空/去重/截断/脱敏 */
export async function cleanTexts(texts: string[]): Promise<CleanResult> {
  const res = await fetch(`${API_BASE}/api/pipeline/clean`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ texts }),
  });
  if (!res.ok) throw new Error(`清洗失败：HTTP ${res.status}`);
  return res.json();
}

/** M3 聚类 + 主题命名 */
export async function clusterTexts(texts: string[], minSamples?: number): Promise<ClusterResult> {
  const res = await fetch(`${API_BASE}/api/pipeline/cluster`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ texts, ...(minSamples ? { min_samples: minSamples } : {}) }),
  });
  if (!res.ok) throw new Error(`聚类失败：HTTP ${res.status}`);
  return res.json();
}

// ---------- M1 数据导入 ----------

export interface ImportResult {
  stage: "ingest";
  status: string;
  message?: string;
  filename?: string;
  format?: string;
  n_rows?: number;
  n_cols?: number;
  columns?: string[];
  rows?: string[][];
  truncated?: boolean;
}

/** M1 上传文件解析（CSV/XLSX/TXT）。hasHeader=false 时首行视为数据。 */
export async function importFile(file: File, hasHeader: boolean): Promise<ImportResult> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(
    `${API_BASE}/api/pipeline/import?has_header=${hasHeader}`,
    { method: "POST", body: fd },
  );
  if (!res.ok) throw new Error(`导入失败：HTTP ${res.status}`);
  return res.json();
}

/** 导入页 → 洞察页的数据交接（localStorage，读后即焚） */
export interface ImportHandoff {
  savedAt: number;
  filename: string;
  texts: string[];
}

const IMPORT_KEY = "echodesk:imported-texts";

export function saveImportHandoff(data: ImportHandoff): void {
  localStorage.setItem(IMPORT_KEY, JSON.stringify(data));
}

/** 读取并清除导入交接（一次性：刷新洞察页不会重复导入）。 */
export function consumeImportHandoff(): ImportHandoff | null {
  try {
    const raw = localStorage.getItem(IMPORT_KEY);
    if (!raw) return null;
    localStorage.removeItem(IMPORT_KEY);
    return JSON.parse(raw) as ImportHandoff;
  } catch {
    return null;
  }
}

// ---------- M5 PRD 生成 ----------

export interface PrdTopicInput {
  name: string;
  description: string;
  sentiment: Topic["sentiment"];
  size: number;
  representative: string;
  samples: string[];
}

export interface PrdGenResult {
  stage: "prd_gen";
  status: string;
  product_name?: string;
  n_topics?: number;
  total_feedback?: number;
  prd_markdown?: string;
  is_mock?: boolean;
  message?: string;
  llm?: ClusterResult["llm"];
}

/** M5 PRD 生成：主题洞察 → PRD 草稿（Markdown）。耗时较长（长输出）。 */
export async function generatePrd(
  productName: string,
  topics: PrdTopicInput[],
): Promise<PrdGenResult> {
  const res = await fetch(`${API_BASE}/api/pipeline/prd-gen`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ product_name: productName, topics }),
  });
  if (!res.ok) throw new Error(`PRD 生成失败：HTTP ${res.status}`);
  return res.json();
}

/** 洞察页 → 审核页的数据交接（localStorage） */
export interface PrdHandoff {
  savedAt: number;
  productName: string;
  topics: PrdTopicInput[];
  stats: {
    total: number;
    n_clusters: number;
    noise_count: number;
    method: string;
    embed_backend: string;
  };
}

const HANDOFF_KEY = "echodesk:prd-input";

export function saveHandoff(data: PrdHandoff): void {
  localStorage.setItem(HANDOFF_KEY, JSON.stringify(data));
}

export function loadHandoff(): PrdHandoff | null {
  try {
    const raw = localStorage.getItem(HANDOFF_KEY);
    return raw ? (JSON.parse(raw) as PrdHandoff) : null;
  } catch {
    return null;
  }
}
