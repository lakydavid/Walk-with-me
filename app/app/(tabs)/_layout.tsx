import { Tabs } from "expo-router";

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index"     options={{ title: "Térkép" }} />
      <Tabs.Screen name="progress"  options={{ title: "Haladás" }} />
      <Tabs.Screen name="profile"   options={{ title: "Profil" }} />
    </Tabs>
  );
}
