import React from "react";
// @ts-expect-error - Clerk exports UserProfile on Web targets but type definitions target React Native
import { UserProfile } from "@clerk/expo";
import { View, StyleSheet } from "react-native";

export default function UserProfileWrapper() {
  return (
    <View style={styles.container}>
      <UserProfile />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 20,
  },
});
