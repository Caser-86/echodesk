import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  importFile,
  saveImportHandoff,
  type ImportResult,
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

const PREVIEW_ROWS = 8;
const ACCEPT = ".csv,.xlsx,.txt";

export default function ImportPage() {
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [hasHeader, setHasHeader] = useState(true);
  const [textCol, setTextCol] = useState(0);

  const file = fileRef.current?.files?.[0];
  const rows = result?.rows ?? [];
  const columns = result?.columns ?? [];
  const preview = rows.slice(0, PREVIEW_ROWS);
  const selectedTexts = rows
    .map((r) => (r[textCol] ?? "").trim())
    .filter(Boolean);

  async function parse(fileToParse: File) {
    if (uploading) return;
    setUploading(true);
    setError("");
    setResult(null);
    try {
      const r = await importFile(fileToParse, hasHeader);
      if (r.status !== "ok") {
        setError(r.message ?? "解析失败");
        return;
      }
      setResult(r);
      setTextCol(0);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  }

  function onFileChange() {
    setResult(null);
    setError("");
    const f = fileRef.current?.files?.[0];
    if (f) parse(f);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (!f) return;
    const ext = f.name.split(".").pop()?.toLowerCase();
    if (!["csv", "xlsx", "txt"].includes(ext ?? "")) {
      setError("仅支持 CSV / XLSX / TXT 文件");
      return;
    }
    // 把文件塞进 input 以便再次选择同名文件也能触发
    const dt = new DataTransfer();
    dt.items.add(f);
    if (fileRef.current) fileRef.current.files = dt.files;
    parse(f);
  }

  function sendToInsights() {
    if (!result || selectedTexts.length === 0) return;
    saveImportHandoff({
      savedAt: Date.now(),
      filename: result.filename ?? "未知文件",
      texts: selectedTexts,
    });
    navigate("/insights");
  }

  return (
    <section className="container-narrow">
      <h2 className="h2" style={{ marginTop: 0 }}>导入数据</h2>
      <p className="text-muted" style={{ marginTop: 4 }}>
        上传 CSV / Excel(.xlsx) / TXT 反馈文件，自动检测编码（UTF-8 / GBK），选择反馈列后送入洞察分析。
      </p>

      {/* Drop zone */}
      <Card
        className="text-center"
        style={{
          marginTop: "var(--space-5)",
          padding: "40px 24px",
          borderWidth: 2,
          borderStyle: "dashed",
          borderColor: dragging ? "var(--brand)" : "var(--border)",
          background: dragging ? "var(--brand-50)" : undefined,
          transition: "background 120ms ease-out, border-color 120ms ease-out",
        }}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPT}
          onChange={onFileChange}
          style={{ display: "none" }}
        />
        <div style={{ fontSize: 40, marginBottom: 12 }}>📁</div>
        <div className="h3" style={{ marginBottom: 8 }}>
          {dragging ? "松开以上传" : "拖拽文件到此处，或点击选择"}
        </div>
        <p className="text-muted" style={{ marginBottom: 16 }}>
          支持 CSV / XLSX / TXT，≤ 20MB；自动识别 UTF-8 与 GBK 编码
        </p>
        <div className="flex items-center justify-center flex-wrap gap-3">
          <Button
            variant="secondary"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
          >
            选择文件
          </Button>
          <label className="flex items-center gap-2 text-sm text-muted" style={{ cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={hasHeader}
              onChange={(e) => setHasHeader(e.target.checked)}
              disabled={uploading}
            />
            首行是表头
          </label>
        </div>

        {file && !uploading && !result && (
          <p className="text-muted" style={{ marginTop: 12, fontSize: "var(--text-xs)" }}>
            已选择：{file.name}（{Math.round(file.size / 1024)} KB）
          </p>
        )}
      </Card>

      {error && (
        <div className="mt-4">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}

      {uploading && (
        <Card className="mt-4" style={{ padding: "var(--space-5)" }}>
          <div className="flex items-center gap-3 text-muted text-sm">
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
            正在解析文件并检测编码…
          </div>
          <Skeleton width="60%" height={12} style={{ marginTop: "var(--space-3)" }} />
          <Skeleton width="40%" height={12} style={{ marginTop: "var(--space-2)" }} />
        </Card>
      )}

      {result && !uploading && (
        <Card className="mt-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <strong>{result.filename}</strong>
              <Badge tone="brand">{result.format?.toUpperCase()}</Badge>
              {result.truncated && <Badge tone="warning">已截断至 {rows.length} 行</Badge>}
            </div>
            <div className="flex items-center gap-2">
              <Stat label="行数" value={result.n_rows ?? 0} />
              <Stat label="列数" value={result.n_cols ?? 0} />
            </div>
          </div>

          <div
            className="flex items-center flex-wrap gap-3 mt-4"
            style={{ padding: "var(--space-3)", background: "var(--bg)", borderRadius: "var(--radius-md)" }}
          >
            <label className="flex items-center gap-2 text-sm text-secondary">
              反馈文本所在列：
              <select
                className="input"
                style={{ width: "auto", minWidth: 120 }}
                value={textCol}
                onChange={(e) => setTextCol(Number(e.target.value))}
              >
                {columns.map((c, i) => (
                  <option key={i} value={i}>{c}</option>
                ))}
              </select>
            </label>
            <span className="text-sm text-muted">
              该列共 <strong>{selectedTexts.length}</strong> 条非空文本
            </span>
            <Button
              variant="primary"
              size="sm"
              onClick={sendToInsights}
              disabled={selectedTexts.length < 3}
              style={{ marginLeft: "auto" }}
            >
              送入洞察分析 →
            </Button>
          </div>

          {selectedTexts.length > 0 && selectedTexts.length < 3 && (
            <Alert tone="warning" className="mt-3">
              反馈列至少需要 3 条非空文本才能聚类。请检查列选择或补充数据。
            </Alert>
          )}

          <div className="table-wrap mt-4">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  {columns.map((c, i) => (
                    <th
                      key={i}
                      style={{ color: i === textCol ? "var(--brand)" : undefined }}
                    >
                      {c} {i === textCol && "←"}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.map((r, ri) => (
                  <tr key={ri}>
                    <td>{ri + 1}</td>
                    {columns.map((_, ci) => (
                      <td
                        key={ci}
                        style={{
                          background: ci === textCol ? "var(--brand-50)" : undefined,
                          maxWidth: 320,
                        }}
                        className="truncate"
                        title={r[ci] ?? ""}
                      >
                        {(r[ci] ?? "").slice(0, 60) || "—"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {rows.length > PREVIEW_ROWS && (
            <p className="text-muted mt-3" style={{ fontSize: "var(--text-xs)" }}>
              仅预览前 {PREVIEW_ROWS} 行（共 {rows.length} 行）
            </p>
          )}
        </Card>
      )}

      {!file && !result && !uploading && (
        <div className="mt-5">
          <EmptyState icon="💡">
            没有文件？也可以直接前往
            <a href="/insights" onClick={(e) => { e.preventDefault(); navigate("/insights"); }} style={{ color: "var(--brand)", margin: "0 4px" }}>
              洞察主题页
            </a>
            使用内置 60 条示例数据体验。
          </EmptyState>
        </div>
      )}
    </section>
  );
}
