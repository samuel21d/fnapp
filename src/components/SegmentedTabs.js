import React from "react";
import { View, TouchableOpacity, Text, StyleSheet } from "react-native";

export default function SegmentedTabs({ tabs, value, onChange }) {
  // tabs: [{key:'abiertas', label:'Abiertas', count:3}, ...]
  return (
    <View style={styles.wrap}>
      {tabs.map((t) => {
        const active = value === t.key;
        return (
          <TouchableOpacity
            key={t.key}
            style={[styles.tab, active && styles.tabActive]}
            onPress={() => onChange(t.key)}
          >
            <Text style={[styles.label, active && styles.labelActive]}>
              {t.label}
            </Text>
            {(t.count ?? 0) > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{t.count}</Text>
              </View>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    backgroundColor: "#eef2f7",
    padding: 4,
    borderRadius: 12,
    marginHorizontal: 12,
    marginTop: 10,
    marginBottom: 6,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
  },
  tabActive: {
    backgroundColor: "#ffffff",
  },
  label: { fontWeight: "700", color: "#445" },
  labelActive: { color: "#0a58ca" },
  badge: {
    marginLeft: 6,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#dc3545",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  badgeText: { color: "#fff", fontSize: 12, fontWeight: "800" },
});
