/* eslint-disable @next/next/no-html-link-for-pages */
import Image from "next/image";

export function DorniBrand({ compact = false }: { compact?: boolean }) {
  return (
    <a className={`brand ${compact ? "brand-compact" : ""}`} href="/" aria-label="دورني">
      <Image className="brand-mark" src="/dorni-logo.svg" alt="" width={42} height={42} priority />
      <span><b>دورني</b><small>DORNI</small></span>
    </a>
  );
}
