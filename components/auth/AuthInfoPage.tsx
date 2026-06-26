import Link from "next/link";
import { AuthShell } from "@/components/auth/AuthShell";

export function AuthInfoPage({
  title,
  description,
  primaryHref = "/login",
  primaryLabel = "Go to sign in"
}: {
  title: string;
  description: string;
  primaryHref?: string;
  primaryLabel?: string;
}) {
  return (
    <AuthShell title={title} description={description}>
      <Link
        href={primaryHref}
        className="flex h-12 w-full items-center justify-center rounded-2xl bg-[#0a0a0a] px-4 text-sm font-medium text-white hover:bg-black"
      >
        {primaryLabel}
      </Link>
    </AuthShell>
  );
}
