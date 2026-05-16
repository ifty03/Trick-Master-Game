import { Redirect, Stack } from "expo-router";
import { useAuth } from "@clerk/expo";
import { AuthProvider } from "@/context/AuthContext";

export default function HomeLayout() {
  const { isSignedIn } = useAuth();

  if (!isSignedIn) return <Redirect href="/(auth)/sign-in" />;

  return (
    <AuthProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="lobby" />
        <Stack.Screen name="room/[id]" />
        <Stack.Screen name="game/[id]" />
        <Stack.Screen name="leaderboard/[id]" />
      </Stack>
    </AuthProvider>
  );
}
