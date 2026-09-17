import Link from "next/link";

export function DorniBrand({ compact = false }: { compact?: boolean }) {
  return (
    <Link className={`brand ${compact ? "brand-compact" : ""}`} href="/" aria-label="دورني">
      <span className="brand-mark"><span /></span>
      <span><b>دورني</b><small>DORNI</small></span>
    </Link>
  );
}
