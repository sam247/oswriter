import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { appUrl, isAppHost, isMarketingHost, isSplitHostDeployment, marketingUrl } from "@/lib/server/urls";

const MARKETING_ONLY_PREFIXES = ["/features", "/pricing", "/contact", "/blog"];
const APP_ONLY_PREFIXES = ["/login", "/signup", "/verify", "/forgot-password", "/reset-password", "/settings", "/projects", "/dashboard"];

export function middleware(req: NextRequest) {
  if (!isSplitHostDeployment()) return NextResponse.next();

  const host = req.headers.get("host");
  const pathname = req.nextUrl.pathname;
  const search = req.nextUrl.search;

  if (isAppHost(host)) {
    if (pathname === "/dashboard") {
      return NextResponse.redirect(new URL("/", req.url));
    }
    if (MARKETING_ONLY_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
      return NextResponse.redirect(marketingUrl(`${pathname}${search}`));
    }
    return NextResponse.next();
  }

  if (isMarketingHost(host)) {
    if (APP_ONLY_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
      const destination = pathname === "/dashboard" ? "/" : pathname;
      return NextResponse.redirect(appUrl(`${destination}${search}`));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|site/|.*\\..*).*)"]
};
