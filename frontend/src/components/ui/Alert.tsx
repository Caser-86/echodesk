import type { ReactNode } from "react";

type Tone = "danger" | "warning" | "info" | "success";

interface AlertProps {
  tone: Tone;
  children: ReactNode;
  className?: string;
  title?: string;
}

export default function Alert({ tone, children, className = "", title }: AlertProps) {
  return (
    <div className={`alert alert-${tone} ${className}`}>
      {title && <strong style={{ display: "block", marginBottom: 4 }}>{title}</strong>}
      {children}
    </div>
  );
}
