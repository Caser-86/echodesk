import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  importFile,
  saveImportHandoff,
  type ImportResult,
} from "../api";

const PREVIEW_ROWS = 8;

export default function ImportPage() {
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [hasHeader, setHasHeader] = useState(true);
  // 选中的反馈列（多列时用户选择；单列文件自动选中）
  const [textCol, setTextCol] = useState(0);

  const rows = result?.rows ?? [];
  const columns = result?.columns ?? [];
  const preview = rows.slice(0, PREVIEW_ROWS);
  const selectedTexts = rows
    .map((r) => (r[textCol] ?? "").trim())
    .filter(Boolean);

  async function upload() {
    const file = fileRef.current?.files?.[0];
    if (!file || uploading) return;
    setUploading(true);
    setError("");
    setResult(null);
    try {
      const r = await importFile(file, hasHeader);
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

  /** 选中列的文本 → 交接洞察页 */
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
    <section style={{ maxWidth: 860, margin: "0 auto" }}>
      <h2 style={{ marginTop: 0 }}>导入数据</h2>
      <p style={{ color: "var(--text-muted)" }}>
        上传 CSV / Excel(.xlsx) / TXT 反馈文件，自动检测编码（UTF-8 / GBK），选择反馈列后送入洞察分析。
      </p>

      {/* 上传区 */}
      <div
        style={{
          background: "var(--surface)",
          border: "1px dashed var(--border)",
          borderRadius: 10,
          padding: 24,
          textAlign: "center",
        }}
      >
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.xlsx,.txt"
          onChange={() => { setResult(null); setError(""); }}
          style={{ display: "none" }}
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          style={{
            padding: "10px 28px",
            border: "1px solid var(--border)",
            borderRadius: 8,
            background: "#fff",
            fontSize: 14,
          }}
        >
          选择文件（CSV / XLSX / TXT，≤ 20MB）
        </button>{" "}
        <button
          onClick={upload}
          disabled={uploading || !fileRef.current?.files?.length}
          style={{
            padding: "10px 28px",
            border: "none",
            borderRadius: 8,
            background: "var(--brand)",
            color: "#fff",
            fontWeight: 600,
          }}
        >
          {uploading ? "解析中…" : "上传并解析"}
        </button>

        <div style={{ marginTop: 12, fontSize: 13, color: "var(--text-muted)" }}>
          <label>
            <input
              type="checkbox"
              checked={hasHeader}
              onChange={(e) => setHasHeader(e.target.checked)}
              disabled={uploading}
            />{" "}
            首行是表头（取消勾选则第一行也作为数据）
          </label>
        </div>

        {fileRef.current?.files?.[0] && (
          <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "8px 0 0" }}>
            已选择：{fileRef.current.files[0].name}（{Math.round(fileRef.current.files[0].size / 1024)} KB）
          </p>
        )}
      </div>

      {/* 错误 */}
      {error && (
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

      {/* 解析结果 */}
      {result && (
        <>
          <div
            style={{
              marginTop: 14,
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
              fontSize: 13,
            }}
          >
            <strong>{result.filename}</strong>
            <span style={{ color: "var(--text-muted)" }}>
              {result.n_rows} 行 · {result.n_cols} 列 · {result.format?.toUpperCase()}
            </span>
            {result.truncated && (
              <span
                style={{ padding: "2px 8px", borderRadius: 4, background: "#fef3c7", color: "#92400e" }}
                title={`文件超出单次分析上限，仅保留前 ${rows.length} 行`}
              >
                已截断至 {rows.length} 行
              </span>
            )}
          </div>

          {/* 列选择 */}
          <div
            style={{
              marginTop: 10,
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 10,
              padding: 16,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <label style={{ fontSize: 13, color: "var(--text-muted)" }}>
                反馈文本所在列：
                <select
                  value={textCol}
                  onChange={(e) => setTextCol(Number(e.target.value))}
                  style={{
                    marginLeft: 6,
                    padding: "6px 10px",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                  }}
                >
                  {columns.map((c, i) => (
                    <option key={i} value={i}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                该列共 {selectedTexts.length} 条非空文本
              </span>
              <button
                onClick={sendToInsights}
                disabled={selectedTexts.length < 3}
                style={{
                  marginLeft: "auto",
                  padding: "8px 22px",
                  border: "none",
                  borderRadius: 6,
                  background: selectedTexts.length < 3 ? "var(--text-muted)" : "var(--brand)",
                  color: "#fff",
                  fontWeight: 600,
                }}
              >
                送入洞察分析 →
              </button>
            </div>

            {/* 预览表 */}
            <div style={{ marginTop: 12, overflowX: "auto" }}>
              <table
                style={{
                  borderCollapse: "collapse",
                  width: "100%",
                  fontSize: 12,
                }}
              >
                <thead>
                  <tr>
                    <th style={thStyle}>#</th>
                    {columns.map((c, i) => (
                      <th key={i} style={{ ...thStyle, color: i === textCol ? "var(--brand)" : undefined }}>
                        {c}
                        {i === textCol ? " ←" : ""}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.map((r, ri) => (
                    <tr key={ri}>
                      <td style={tdStyle}>{ri + 1}</td>
                      {columns.map((_, ci) => (
                        <td
                          key={ci}
                          style={{
                            ...tdStyle,
                            background: ci === textCol ? "var(--brand-soft)" : undefined,
                          }}
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
              <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "8px 0 0" }}>
                仅预览前 {PREVIEW_ROWS} 行（共 {rows.length} 行）
              </p>
            )}
          </div>
        </>
      )}
    </section>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "6px 10px",
  borderBottom: "2px solid var(--border)",
  background: "#fafafa",
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  padding: "6px 10px",
  borderBottom: "1px solid var(--border)",
  maxWidth: 320,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};
