import type { Metadata } from "next";
import BlogIndexPage from "@/components/site/BlogIndexPage";

export const metadata: Metadata = {
  title: "Blog — QueueWrite",
  description:
    "Field notes on content operations, publishing workflows, SEO and the engineering behind QueueWrite.",
  openGraph: {
    title: "Blog — QueueWrite",
    description:
      "Field notes on content operations, publishing workflows and the engineering behind QueueWrite.",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Blog — QueueWrite",
    description:
      "Field notes on content operations, publishing workflows and the engineering behind QueueWrite.",
  },
};

export default function BlogRoutePage() {
  return <BlogIndexPage />;
}
