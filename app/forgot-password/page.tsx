import type { Metadata } from "next";
import { AuthInfoPage } from "@/components/auth/AuthInfoPage";

export const metadata: Metadata = {
  title: "Account Access — QueueWrite",
  description: "QueueWrite uses one-time sign-in codes instead of passwords."
};

export default function ForgotPasswordPage() {
  return (
    <AuthInfoPage
      title="No password reset needed"
      description="QueueWrite signs you in with a one-time email code, so there is no password to reset. Use the sign-in flow to receive a fresh code."
      primaryHref="/login"
      primaryLabel="Send a sign-in code"
    />
  );
}
