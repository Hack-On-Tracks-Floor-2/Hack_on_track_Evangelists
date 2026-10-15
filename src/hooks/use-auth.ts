import { api } from "@/convex/_generated/api";
import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth, useQuery } from "convex/react";
import { useEffect, useState } from "react";

export function useAuth() {
  const { isLoading: isAuthLoading, isAuthenticated } = useConvexAuth();
  const user = useQuery(api.users.currentUser);
  const { signIn, signOut } = useAuthActions();

  // If the backend never answers (wrong/missing VITE_CONVEX_URL, deployment
  // paused), `user` stays `undefined` forever and every protected page would
  // spin forever. After 12s, stop loading and say so explicitly so callers
  // can render a diagnosed error instead of an endless spinner.
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    if (!isAuthLoading && user !== undefined) return;
    const t = setTimeout(() => setTimedOut(true), 12000);
    return () => clearTimeout(t);
  }, [isAuthLoading, user]);

  const backendUnreachable = timedOut && (isAuthLoading || user === undefined);
  // Derive isLoading directly from the dependencies instead of managing separate state
  const isLoading = (isAuthLoading || user === undefined) && !backendUnreachable;

  return {
    isLoading,
    isAuthenticated,
    user,
    signIn,
    signOut,
    backendUnreachable,
  };
}
