import Image from "next/image";
import type { MouseEventHandler } from "react";

export function DorniBrand({ compact = false, href = "/", onClick }: { compact?: boolean; href?: string; onClick?: MouseEventHandler<HTMLAnchorElement> }) {
  return (
    <a className={`brand ${compact ? "brand-compact" : ""}`} href={href} onClick={onClick} aria-label="دورني">
      <Image className="brand-wordmark" src="/dawrni-wordmark.png" alt="دورني" width={2027} height={776} priority />

    </a>
  );
}
