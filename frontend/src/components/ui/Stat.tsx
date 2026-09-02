interface StatProps {
  label: string;
  value: string | number;
  className?: string;
}

export default function Stat({ label, value, className = "" }: StatProps) {
  return (
    <span className={`stat ${className}`}>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
    </span>
  );
}
