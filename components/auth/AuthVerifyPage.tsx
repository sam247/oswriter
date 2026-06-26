"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { AuthShell } from "@/components/auth/AuthShell";

export function AuthVerifyPage({
  email,
  purpose
}: {
  email: string;
  purpose: "login" | "signup";
}) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  const title = useMemo(
    () => purpose === "signup" ? "Enter your signup code" : "Enter your sign-in code",
    [purpose]
  );

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const response = await fetch("/api/auth/verify-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, code, purpose })
    });
    const payload = await response.json().catch(() => ({})) as { error?: string };
    setLoading(false);
    if (!response.ok) {
      setError(payload.error ?? "Unable to verify your code.");
      return;
    }
    router.push("/");
    router.refresh();
  }

  async function resend() {
    setResending(true);
    setError("");
    const response = await fetch("/api/auth/request-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, purpose })
    });
    const payload = await response.json().catch(() => ({})) as { error?: string };
    setResending(false);
    if (!response.ok) {
      setError(payload.error ?? "Unable to resend your code.");
    }
  }

  return (
    <AuthShell
      title={title}
      description={`We sent a 6-digit code to ${email || "your email"}. It expires in 10 minutes and can only be used once.`}
      footer={
        <>
          Wrong email?{" "}
          <Link href={purpose === "signup" ? "/signup" : "/login"} className="font-medium text-[#0a0a0a] underline">
            Start again
          </Link>
          .
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-[#0a0a0a]">Verification code</span>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]{6}"
            autoComplete="one-time-code"
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
            autoFocus
            required
            className="h-12 w-full rounded-2xl border border-black/10 bg-[#fafafa] px-4 text-sm tracking-[0.35em] outline-none transition focus:border-black/30"
            placeholder="000000"
          />
        </label>
        {error ? <p className="text-sm text-[#b42318]">{error}</p> : null}
        <button
          type="submit"
          disabled={loading || code.length !== 6}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#0a0a0a] px-4 text-sm font-medium text-white hover:bg-black disabled:cursor-not-allowed disabled:opacity-70"
        >
          {loading ? <Loader2 className="size-4 animate-spin" /> : null}
          Verify code
        </button>
        <button
          type="button"
          disabled={resending}
          onClick={resend}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-black/10 bg-white px-4 text-sm font-medium text-[#0a0a0a] hover:bg-[#f7f7f7] disabled:cursor-not-allowed disabled:opacity-70"
        >
          {resending ? <Loader2 className="size-4 animate-spin" /> : null}
          Resend code
        </button>
      </form>
    </AuthShell>
  );
}
