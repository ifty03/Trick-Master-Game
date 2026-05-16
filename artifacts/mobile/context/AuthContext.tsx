import React, { createContext, useContext, useEffect, useState } from "react";
import { useAuth, useUser } from "@clerk/expo";
import { getSupabase, getSupabaseWithToken } from "@/lib/supabase";
import type { Profile } from "@/types/game";

interface AuthContextValue {
  profile: Profile | null;
  isLoading: boolean;
  getClient: () => ReturnType<typeof getSupabaseWithToken>;
}

const AuthContext = createContext<AuthContextValue>({
  profile: null,
  isLoading: true,
  getClient: () => getSupabase(),
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { getToken } = useAuth();
  const { user, isLoaded } = useUser();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoaded || !user) {
      setIsLoading(false);
      return;
    }

    const setup = async () => {
      try {
        const t = await getToken();
        setToken(t);

        const client = getSupabaseWithToken(t);
        const username =
          user.username ||
          user.firstName ||
          user.emailAddresses[0]?.emailAddress?.split("@")[0] ||
          "Player";

        const { data, error } = await client
          .from("profiles")
          .upsert(
            { clerk_user_id: user.id, username },
            { onConflict: "clerk_user_id" }
          )
          .select()
          .single();

        if (!error && data) {
          setProfile(data as Profile);
        }
      } catch (e) {
        console.error("Profile setup error:", e);
      } finally {
        setIsLoading(false);
      }
    };

    setup();
  }, [isLoaded, user]);

  const getClient = () => getSupabaseWithToken(token);

  return (
    <AuthContext.Provider value={{ profile, isLoading, getClient }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthContext() {
  return useContext(AuthContext);
}
