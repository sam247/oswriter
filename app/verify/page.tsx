import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthVerifyPage } from "@/components/auth/AuthVerifyPage";
import { getAuthSession } from "@/lib/server/auth";

export const metadata: Metadata = {
  title: "Verify Code — QueueWrite",
  description: "Enter the one-time verification code sent to your email."
};

export default async function VerifyPage({
  searchParams
}: {
  searchParams: Promise<{ email?: string; purpose?: string }>;
}) {
  if (await getAuthSession()) redirect("/");
  const params = await searchParams;
  return (
    <AuthVerifyPage
      email={params.email ?? ""}
      purpose={params.purpose === "signup" ? "signup" : "login"}
    />
  );
}
