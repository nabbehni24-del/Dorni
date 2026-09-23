/* eslint-disable @next/next/no-html-link-for-pages */
import Image from "next/image";

export function DorniBrand({ compact = false }: { compact?: boolean }) {
  return (
    <a className={`brand ${compact ? "brand-compact" : ""}`} href="/" aria-label="دورني">
      <Image className="brand-wordmark" src="/dawrni-logo.svg" alt="دورني" width={857} height={363} priority />

    </a>
  );
}
