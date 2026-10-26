import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const { data } = await supabase.auth.getUser();
      if (!active) return;
      setUser(data.user);
      if (data.user) {
        const { data: roles } = await supabase
          .from("user_roles").select("role").eq("user_id", data.user.id);
        if (active) setIsAdmin(!!roles?.some((r) => r.role === "admin"));
      } else setIsAdmin(false);
      if (active) setLoading(false);
    };
    load();
    const { data: sub } = supabase.auth.onAuthStateChange((e) => {
      if (e === "SIGNED_IN" || e === "SIGNED_OUT" || e === "USER_UPDATED") load();
    });
    return () => { active = false; sub.subscription.unsubscribe(); };
  }, []);

  return { user, isAdmin, loading };
}
