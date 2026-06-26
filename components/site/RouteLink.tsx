"use client";

import Link, { type LinkProps } from "next/link";
import type { PropsWithChildren, ReactNode } from "react";

type Params = Record<string, string | number>;

type RouteLinkProps = PropsWithChildren<{
  to: string;
  params?: Params;
  hash?: string;
  className?: string;
  title?: string;
  target?: string;
  rel?: string;
  onClick?: () => void;
}> &
  Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "className" | "onClick">;

function buildHref(to: string, params?: Params, hash?: string) {
  let href = to;

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      href = href.replace(`$${key}`, encodeURIComponent(String(value)));
    }
  }

  if (hash) {
    href += `#${hash}`;
  }

  return href;
}

export function RouteLink({
  to,
  params,
  hash,
  children,
  ...rest
}: RouteLinkProps) {
  const href = buildHref(to, params, hash);

  return (
    <Link href={href as LinkProps["href"]} {...rest}>
      {children as ReactNode}
    </Link>
  );
}
