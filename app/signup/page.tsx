import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthRequestPage } from "@/components/auth/AuthRequestPage";
import { getAuthSession } from "@/lib/server/auth";

export const metadata: Metadata = {
  title: "Create Account — QueueWrite",
  description: "Create your QueueWrite workspace with a one-time email code."
};

export default async function SignupPage() {
  if (await getAuthSession()) redirect("/");
  return <AuthRequestPage purpose="signup" />;
}
