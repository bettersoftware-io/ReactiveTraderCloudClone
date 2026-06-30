import { StyleSheet, Text, View } from "react-native";

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 18, fontWeight: "600" },
});

export default function IndexScreen(): React.JSX.Element {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>RTC Mobile — Phase 1 scaffold</Text>
    </View>
  );
}
