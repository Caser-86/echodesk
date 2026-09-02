import type { ReactNode } from "react";
import Card from "./Card";

interface EmptyStateProps {
  children: ReactNode;
  icon?: string;
}

export default function EmptyState({ children, icon = "📦" }: EmptyStateProps) {
  return (
    <Card className="text-center" style={{ padding: "40px 24px", borderStyle: "dashed" }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>{icon}</div>
      <div style={{ color: "var(--text-muted)", fontSize: "var(--text-sm)" }}>{children}</div>
    </Card>
  );
}
