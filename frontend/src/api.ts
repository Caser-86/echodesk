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

// ---------- S2 任务拆解 ----------

export interface TaskCard {
  id: string;
  product_name: string;
  title: string;
  user_story: string;
  description: string;
  acceptance_criteria: string[];
  priority: "P0" | "P1" | "P2";
  source_topic: string;
  feedback_count: number;
  evidence: string;
}

export interface TaskCardsResult {
  stage: "task_decompose";
  status: string;
  product_name?: string;
  total?: number;
  task_cards?: TaskCard[];
  message?: string;
}

/** S2 任务拆解：主题洞察 → 可追溯用户故事卡。 */
export async function generateTaskCards(
  productName: string,
  topics: PrdTopicInput[],
): Promise<TaskCardsResult> {
  const res = await fetch(`${API_BASE}/api/pipeline/task-cards`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ product_name: productName, topics }),
  });
  if (!res.ok) throw new Error(`任务拆解失败：HTTP ${res.status}`);
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

// ---------- M6 审核日志 + 审核会话 ----------

export type ReviewEvent =
  | "prd_generated"
  | "prd_edited"
  | "prd_downloaded"
  | "export_downloaded";

/** 上报审核动作（fire-and-forget：日志失败不打断用户流程）。 */
export function logReviewEvent(event: ReviewEvent, payload: Record<string, unknown>): void {
  fetch(`${API_BASE}/api/review-log`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event, payload }),
  }).catch(() => undefined);
}

export interface ReviewStats {
  stage: "review_log";
  status: string;
  total_events: number;
  prd_generated: number;
  prd_edited: number;
  prd_downloaded: number;
  export_downloaded: number;
  adoption_rate: number | null;
}

export async function fetchReviewStats(): Promise<ReviewStats> {
  const res = await fetch(`${API_BASE}/api/review-log/stats`);
  if (!res.ok) throw new Error(`统计获取失败：HTTP ${res.status}`);
  return res.json();
}

/** 审核会话（Review → Export 的数据交接，持续保存可重复访问） */
export interface ReviewSession {
  savedAt: number;
  sessionId: string;
  productName: string;
  aiDraft: string;
  draft: string;
  elapsed: number;
  topics: PrdTopicInput[];
  stats: PrdHandoff["stats"];
  taskCards?: TaskCard[];
}

const SESSION_KEY = "echodesk:review-session";
const HISTORY_KEY = "echodesk:review-history";
const MAX_HISTORY_SESSIONS = 12;

export function saveReviewSession(data: ReviewSession): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(data));
  } catch (e) {
    // 配额满（QuotaExceededError）等写失败时静默降级：会话仍保留在当前页内存态，
    // 只是刷新后不恢复；绝不让持久化失败打断审核/编辑流程。
    console.warn("review session 持久化失败（localStorage 配额？）", e);
  }
  try {
    const history = listReviewSessions().filter((item) => item.sessionId !== data.sessionId);
    history.unshift(data);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, MAX_HISTORY_SESSIONS)));
  } catch (e) {
    // 历史列表是增强能力，写失败不影响当前审核结果。
    console.warn("review history 持久化失败（localStorage 配额？）", e);
  }
}

export function loadReviewSession(): ReviewSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as ReviewSession) : null;
  } catch {
    return null;
  }
}

/** 读取本地处理历史，最新会话排在最前。 */
export function listReviewSessions(): ReviewSession[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is ReviewSession => Boolean(item && typeof item === "object" && "sessionId" in item))
      .sort((a, b) => b.savedAt - a.savedAt);
  } catch {
    return [];
  }
}

/** 删除一条本地历史；若删除的是当前会话，同时清理当前审核交接。 */
export function deleteReviewSession(sessionId: string): boolean {
  const history = listReviewSessions();
  const found = history.some((item) => item.sessionId === sessionId);
  if (!found) return false;
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.filter((item) => item.sessionId !== sessionId)));
    const current = loadReviewSession();
    if (current?.sessionId === sessionId) localStorage.removeItem(SESSION_KEY);
    return true;
  } catch {
    return false;
  }
}
