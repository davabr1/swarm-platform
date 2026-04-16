"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ListSkillRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/profile#list-skill");
  }, [router]);
  return (
    <div className="min-h-screen flex items-center justify-center text-muted text-sm">
      redirecting → /profile#list-skill
    </div>
  );
}
