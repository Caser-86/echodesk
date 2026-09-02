interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  className?: string;
  style?: React.CSSProperties;
}

export default function Skeleton({ width = "100%", height = 16, className = "", style }: SkeletonProps) {
  const w = width === undefined ? "100%" : width;
  const h = height === undefined ? 16 : height;
  return (
    <div
      className={`skeleton ${className}`}
      style={{ width: w, height: h, display: "inline-block", ...style }}
    />
  );
}
