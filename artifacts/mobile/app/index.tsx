import { useAuth } from "@clerk/expo";
import { Redirect } from "expo-router";
import { View, ActivityIndicator } from "react-native";
import colors from "@/constants/colors";

export default function Index() {
  const { isSignedIn, isLoaded } = useAuth();

  if (!isLoaded) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.light.background }}>
        <ActivityIndicator color={colors.light.gold} size="large" />
      </View>
    );
  }

  if (isSignedIn) {
    return <Redirect href="/(home)/lobby" />;
  }

  return <Redirect href="/(auth)/sign-in" />;
}
