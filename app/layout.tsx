import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "QueueWrite",
  description: "Reliable queue-first article production workstation"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
