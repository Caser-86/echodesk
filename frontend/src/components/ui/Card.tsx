import type { DragEvent, ReactNode } from "react";

interface CardProps {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  style?: React.CSSProperties;
  onDragOver?: (e: DragEvent<HTMLDivElement>) => void;
  onDragLeave?: (e: DragEvent<HTMLDivElement>) => void;
  onDrop?: (e: DragEvent<HTMLDivElement>) => void;
}

export default function Card({ children, className = "", hover = false, style, onDragOver, onDragLeave, onDrop }: CardProps) {
  const classes = ["card", hover ? "card-hover" : "", className].filter(Boolean).join(" ");
  return (
    <div className={classes} style={style} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
      {children}
    </div>
  );
}
