/* eslint-disable @next/next/no-html-link-for-pages */
import Image from "next/image";

export function DorniBrand({ compact = false }: { compact?: boolean }) {
  return (
    <a className={`brand ${compact ? "brand-compact" : ""}`} href="/" aria-label="دورني">
      <Image className="brand-wordmark" src="/dawrni-wordmark.png" alt="دورني" width={2027} height={776} priority />

    </a>
  );
}
