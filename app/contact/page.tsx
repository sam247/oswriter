import type { Metadata } from "next";
import ContactPage from "@/components/site/ContactPage";

export const metadata: Metadata = {
  title: "Contact — QueueWrite",
  description:
    "Get in touch with QueueWrite. General enquiries, support, sales, security disclosure and feature requests — routed to the right team.",
  openGraph: {
    title: "Contact — QueueWrite",
    description:
      "Reach the right team at QueueWrite — support, sales, security and product feedback.",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Contact — QueueWrite",
    description:
      "Get in touch with QueueWrite. General enquiries, support, sales, security disclosure and feature requests.",
  },
};

export default function ContactRoutePage() {
  return <ContactPage />;
}
