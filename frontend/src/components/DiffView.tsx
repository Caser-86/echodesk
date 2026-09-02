import { useMemo } from "react";
import { Card } from "./ui";

interface DiffViewProps {
  before: string;
  after: string;
}

/** 轻量级行级 diff：用于展示 AI 原稿 vs 人工修改 */
export default function DiffView({ before, after }: DiffViewProps) {
  const diff = useMemo(() => computeLineDiff(before, after), [before, after]);
  return (
    <Card style={{ padding: 0, overflow: "hidden" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          borderBottom: "1px solid var(--border)",
          background: "var(--surface-hover)",
          fontSize: "var(--text-xs)",
          fontWeight: 600,
          color: "var(--text-secondary)",
        }}
      >
        <div style={{ padding: "var(--space-2) var(--space-3)", borderRight: "1px solid var(--border)" }}>AI 原稿</div>
        <div style={{ padding: "var(--space-2) var(--space-3)" }}>人工修改后</div>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          fontFamily: "var(--font-mono)",
          fontSize: "var(--text-xs)",
          lineHeight: 1.6,
        }}
      >
        <div style={{ borderRight: "1px solid var(--border)" }}>
          {diff.map((d, i) => (
            <div
              key={`l-${i}`}
              style={{
                padding: "2px var(--space-3)",
                background: d.type === "removed" ? "var(--danger-50)" : d.type === "unchanged" ? undefined : "#f9fafb",
                color: d.type === "removed" ? "var(--danger)" : "var(--text-muted)",
                minHeight: 22,
                textDecoration: d.type === "removed" ? "line-through" : undefined,
              }}
            >
              {d.before || "\u00a0"}
            </div>
          ))}
        </div>
        <div>
          {diff.map((d, i) => (
            <div
              key={`r-${i}`}
              style={{
                padding: "2px var(--space-3)",
                background: d.type === "added" ? "var(--success-50)" : d.type === "unchanged" ? undefined : "#f9fafb",
                color: d.type === "added" ? "#047857" : "var(--text-muted)",
                minHeight: 22,
              }}
            >
              {d.after || "\u00a0"}
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

type DiffLine = { type: "unchanged" | "added" | "removed"; before: string; after: string };

function computeLineDiff(before: string, after: string): DiffLine[] {
  const a = before.split("\n");
  const b = after.split("\n");
  const res: DiffLine[] = [];
  let i = 0, j = 0;
  while (i < a.length || j < b.length) {
    const al = a[i];
    const bl = b[j];
    if (i < a.length && j < b.length && al === bl) {
      res.push({ type: "unchanged", before: al, after: bl });
      i++; j++;
    } else if (j >= b.length || (i < a.length && a.slice(i).includes(bl))) {
      res.push({ type: "removed", before: al, after: "" });
      i++;
    } else {
      res.push({ type: "added", before: "", after: bl });
      j++;
    }
  }
  return res;
}
