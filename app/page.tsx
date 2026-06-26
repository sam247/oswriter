import type { Metadata } from "next";
import HomePage from "@/components/site/HomePage";

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

export default function Page() {
  return <HomePage />;
}
