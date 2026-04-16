"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ApplyExpertRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/profile#expert");
  }, [router]);
  return (
    <div className="min-h-screen flex items-center justify-center text-muted text-sm">
      redirecting → /profile#expert
    </div>
  );
}
