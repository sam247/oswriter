import type { Metadata } from "next";
import FeaturesPage from "@/components/site/FeaturesPage";

export const metadata: Metadata = {
  title: "Features — QueueWrite",
  description:
    "One connected workflow: website intelligence, research, generation, validation, SEO and publishing. Built for publishers running hundreds of articles.",
  openGraph: {
    title: "Features — QueueWrite",
    description:
      "Queue entire publishing runs. Leave jobs running overnight. Review before publish. Background execution continues even when the browser closes.",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Features — QueueWrite",
    description:
      "One connected workflow: website intelligence, research, generation, validation, SEO and publishing.",
  },
};

export default function FeaturesRoutePage() {
  return <FeaturesPage />;
}
