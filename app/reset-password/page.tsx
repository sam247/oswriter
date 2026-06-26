import type { Metadata } from "next";
import { AuthInfoPage } from "@/components/auth/AuthInfoPage";

export const metadata: Metadata = {
  title: "Reset Password — QueueWrite",
  description: "QueueWrite uses one-time sign-in codes instead of passwords."
};

export default function ResetPasswordPage() {
  return (
    <AuthInfoPage
      title="QueueWrite uses sign-in codes"
      description="Password reset is not part of the current authentication model. Request a fresh sign-in code instead."
      primaryHref="/login"
      primaryLabel="Back to sign in"
    />
  );
}
