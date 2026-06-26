import Link from "next/link";

export default function NotFoundPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f5f5f7] px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-[#0a0a0a]">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-[#0a0a0a]">
          Page not found
        </h2>
        <p className="mt-2 text-sm text-[#6a6a6a]">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-md bg-[#0a0a0a] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-black/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}
