/* eslint-disable @next/next/no-html-link-for-pages */

export function DorniBrand({ compact = false }: { compact?: boolean }) {
  return (
    <a className={`brand ${compact ? "brand-compact" : ""}`} href="/" aria-label="دورني">
      <span className="brand-mark"><span /></span>
      <span><b>دورني</b><small>DORNI</small></span>
    </a>
  );
}
