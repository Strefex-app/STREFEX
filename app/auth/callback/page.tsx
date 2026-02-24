"use client";

import { useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

export default function AuthCallback() {
  useEffect(() => {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    supabase.auth.getSessionFromUrl();
  }, []);

  return <p>Confirming your email...</p>;
}
