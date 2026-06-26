import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { WriterApp } from "@/components/writer-app";
import HomePage from "@/components/site/HomePage";
import { getAuthSession } from "@/lib/server/auth";
import { isAppHost, isSplitHostDeployment } from "@/lib/server/urls";

export const metadata: Metadata = {
  title: "QueueWrite — The content operating system for publishers",
  description:
    "Run research, validation, SEO, internal linking, queue execution and publishing from a single workspace. Evidence-backed articles, reviewed before they go live.",
  openGraph: {
    title: "QueueWrite — The content operating system for publishers",
    description:
      "Run research, validation, SEO, internal linking, queue execution and publishing from a single workspace. Evidence-backed articles, reviewed before they go live.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "QueueWrite — The content operating system for publishers",
    description:
      "Run research, validation, SEO, internal linking, queue execution and publishing from a single workspace. Evidence-backed articles, reviewed before they go live.",
  },
};

export default async function Page() {
  const host = (await headers()).get("host");
  if (isSplitHostDeployment() && isAppHost(host)) {
    const session = await getAuthSession();
    if (!session) redirect("/login");
    return <WriterApp />;
  }
  return <HomePage />;
}
