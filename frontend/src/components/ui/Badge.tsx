type Tone = "negative" | "positive" | "neutral" | "warning" | "brand" | "success";

interface BadgeProps {
  tone: Tone;
  children: React.ReactNode;
  className?: string;
  title?: string;
}

export default function Badge({ tone, children, className = "", title }: BadgeProps) {
  return (
    <span className={`badge badge-${tone} ${className}`} title={title}>
      {children}
    </span>
  );
}
