import type { Metadata } from "next";
import PricingPage from "@/components/site/PricingPage";

export const metadata: Metadata = {
  title: "Pricing — QueueWrite",
  description:
    "Pricing built around workflows, not tokens. Choose a fully managed experience or connect your own AI providers.",
  openGraph: {
    title: "Pricing — QueueWrite",
    description:
      "Managed and BYOK plans for QueueWrite — the content operations platform that handles research, writing and publishing.",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Pricing — QueueWrite",
    description:
      "Pricing built around workflows, not tokens. Choose a fully managed experience or connect your own AI providers.",
  },
};

export default function PricingRoutePage() {
  return <PricingPage />;
}
