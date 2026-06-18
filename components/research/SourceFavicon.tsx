"use client";

import { Globe2 } from "lucide-react";
import { useState } from "react";
import { getFaviconUrl } from "@/lib/ui/favicon";
import { cn } from "@/lib/utils";

interface SourceFaviconProps {
  url: string;
  className?: string;
}

export function SourceFavicon({ url, className }: SourceFaviconProps) {
  const faviconUrl = getFaviconUrl(url);
  const [failed, setFailed] = useState(!faviconUrl);
  const containerClassName = cn("grid size-[18px] shrink-0 place-items-center overflow-hidden rounded-sm border border-line bg-surface-1", className);

  if (failed) {
    return (
      <span className={containerClassName} aria-hidden="true">
        <Globe2 className="size-3 text-ink-subtle" />
      </span>
    );
  }

  return (
    <span className={containerClassName} aria-hidden="true">
      <img
        src={faviconUrl}
        alt=""
        width={16}
        height={16}
        className="size-4 object-contain"
        onError={() => setFailed(true)}
      />
    </span>
  );
}
