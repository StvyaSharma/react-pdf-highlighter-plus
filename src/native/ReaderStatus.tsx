import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { ReaderState } from "../reader/types";

/** Presentation only: applications can replace it through renderStatus. */
export function ReaderStatus({
  state,
  retry,
}: {
  state: ReaderState;
  retry: () => void;
}) {
  if (state.status === "loading")
    return (
      <View pointerEvents="none" style={styles.overlay}>
        <ActivityIndicator accessibilityLabel="Loading EPUB" />
      </View>
    );
  if (!state.error) return null;
  return (
    <View style={styles.overlay}>
      <View style={styles.card} accessibilityRole="alert">
        <Text style={styles.message}>{state.error.message}</Text>
        {state.error.retryable ? (
          <Pressable
            accessibilityRole="button"
            onPress={retry}
            style={styles.button}
          >
            <Text>Retry</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  card: { padding: 16, margin: 16, backgroundColor: "white", borderRadius: 8 },
  message: { color: "#991b1b" },
  button: { padding: 12, alignSelf: "center" },
});
