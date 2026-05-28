import { useEffect, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { fetchAreaProgress, type AreaProgress } from "@/lib/streets";

export default function ProgressScreen() {
  const [items, setItems] = useState<AreaProgress[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    setRefreshing(true);
    try {
      setItems(await fetchAreaProgress());
    } catch (e) {
      console.warn(e);
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Kerületek</Text>
      <FlatList
        data={items}
        keyExtractor={(it) => String(it.area_id)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />}
        ListEmptyComponent={
          <Text style={styles.empty}>
            Még nincs adat. Kezdj el sétálni és gyere vissza!
          </Text>
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.area_name}</Text>
              <Text style={styles.sub}>
                {item.streets_completed} / {item.streets_total} utca teljesítve
              </Text>
            </View>
            <Text style={styles.pct}>
              {Math.round(item.area_coverage_ratio * 100)}%
            </Text>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  title: { fontSize: 28, fontWeight: "700", marginBottom: 12 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e5e7eb",
  },
  name: { fontSize: 16, fontWeight: "600" },
  sub: { fontSize: 13, color: "#6b7280", marginTop: 2 },
  pct: { fontSize: 18, fontWeight: "700", color: "#3a86ff" },
  empty: { textAlign: "center", color: "#6b7280", marginTop: 40 },
});
