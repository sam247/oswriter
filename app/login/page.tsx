import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthRequestPage } from "@/components/auth/AuthRequestPage";
import { getAuthSession } from "@/lib/server/auth";

export const metadata: Metadata = {
  title: "Sign In — QueueWrite",
  description: "Receive a one-time email code to sign in to your QueueWrite workspace."
};

export default async function LoginPage() {
  if (await getAuthSession()) redirect("/");
  return <AuthRequestPage purpose="login" />;
}
