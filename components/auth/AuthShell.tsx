"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { marketingUrl } from "@/lib/server/urls";

export function AuthShell({
  title,
  description,
  children,
  footer
}: {
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="grid min-h-screen place-items-center bg-[#f5f5f7] px-4 py-10 text-[#0a0a0a]">
      <div className="w-full max-w-md rounded-[28px] border border-black/8 bg-white p-8 shadow-[0_12px_50px_-24px_rgba(0,0,0,0.22)]">
        <Link href={marketingUrl("/")} className="inline-flex items-center gap-2 text-[15px] font-semibold tracking-tight">
          <span className="grid size-6 place-items-center rounded-md bg-[#0a0a0a] text-[10px] font-bold text-white">QW</span>
          QueueWrite
        </Link>
        <div className="mt-8">
          <h1 className="text-[32px] font-semibold leading-[1.02] tracking-[-0.04em]">{title}</h1>
          <p className="mt-3 text-[15px] leading-6 text-[#4a4a4a]">{description}</p>
        </div>
        <div className="mt-8">{children}</div>
        {footer ? <div className="mt-6 text-sm text-[#4a4a4a]">{footer}</div> : null}
      </div>
    </main>
  );
}
