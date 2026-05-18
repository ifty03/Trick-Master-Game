import React, { createContext, useContext, useEffect, useState } from "react";
import { useUser, useAuth } from "@clerk/expo";
import { setApiTokenGetter, apiFetch } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import type { Profile } from "@/types/game";

interface AuthContextValue {
  profile: Profile | null;
  isLoading: boolean;
  isSocketReady: boolean;
}

const AuthContext = createContext<AuthContextValue>({
  profile: null,
  isLoading: true,
  isSocketReady: false,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { user, isLoaded } = useUser();
  const { getToken } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSocketReady, setIsSocketReady] = useState(false);
  // Configure API token getter immediately during render so it is available before children mount
  setApiTokenGetter(async () => {
    try {
      return await getToken();
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (!isLoaded) return;

    if (!user) {
      setProfile(null);
      setIsSocketReady(true);
      setIsLoading(false);
      return;
    }

    const setup = async () => {
      try {
        const username =
          user.username ||
          user.firstName ||
          user.emailAddresses[0]?.emailAddress?.split("@")[0] ||
          "Player";

        const data = await apiFetch<Profile>("/profiles/sync", {
          method: "POST",
          body: JSON.stringify({ username }),
        });
        setProfile(data);

        getSocket().connect();
        setIsSocketReady(true);
      } catch (e) {
        console.error("Profile setup error:", e);
        setIsSocketReady(true);
      } finally {
        setIsLoading(false);
      }
    };

    setup();
  }, [isLoaded, user?.id]);

  return (
    <AuthContext.Provider value={{ profile, isLoading, isSocketReady }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthContext() {
  return useContext(AuthContext);
}
