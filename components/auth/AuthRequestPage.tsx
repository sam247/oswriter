"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { AuthShell } from "@/components/auth/AuthShell";

export function AuthRequestPage({ purpose }: { purpose: "login" | "signup" }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const response = await fetch("/api/auth/request-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, purpose })
    });
    const payload = await response.json().catch(() => ({})) as { error?: string };
    setLoading(false);
    if (!response.ok) {
      setError(payload.error ?? "Unable to send your code.");
      return;
    }
    router.push(`/verify?purpose=${purpose}&email=${encodeURIComponent(email.trim())}`);
  }

  return (
    <AuthShell
      title={purpose === "signup" ? "Create your QueueWrite account" : "Sign in to QueueWrite"}
      description={purpose === "signup"
        ? "Enter your email and we’ll send a one-time code to create your workspace."
        : "Enter your email and we’ll send a one-time code to open your workspace."}
      footer={purpose === "signup"
        ? <>Already have an account? <Link href="/login" className="font-medium text-[#0a0a0a] underline">Sign in</Link>.</>
        : <>New to QueueWrite? <Link href="/signup" className="font-medium text-[#0a0a0a] underline">Create an account</Link>.</>}
    >
      <form onSubmit={submit} className="space-y-4">
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-[#0a0a0a]">Email</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            autoFocus
            required
            className="h-12 w-full rounded-2xl border border-black/10 bg-[#fafafa] px-4 text-sm outline-none transition focus:border-black/30"
            placeholder="you@company.com"
          />
        </label>
        {error ? <p className="text-sm text-[#b42318]">{error}</p> : null}
        <button
          type="submit"
          disabled={loading}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#0a0a0a] px-4 text-sm font-medium text-white hover:bg-black disabled:cursor-not-allowed disabled:opacity-70"
        >
          {loading ? <Loader2 className="size-4 animate-spin" /> : null}
          {purpose === "signup" ? "Send signup code" : "Send sign-in code"}
        </button>
      </form>
    </AuthShell>
  );
}
