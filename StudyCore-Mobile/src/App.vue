<script setup lang="ts">
import { onLaunch, onShow, onHide } from "@dcloudio/uni-app";
import { connectRealtimeSync, disconnectRealtimeSync } from "@/api/sync";
import { useAuthStore } from "@/store/useAuthStore";
import { useSyncStore } from "@/store/useSyncStore";
import { useDeviceStore } from "@/store/useDeviceStore";
import { watch } from "vue";

onLaunch(async () => {
  console.log("App Launch");
  const deviceStore = useDeviceStore();
  deviceStore.detect();

  const authStore = useAuthStore();

  if (authStore.token) {
    const syncStore = useSyncStore();
    await syncStore.initE2EE();
    connectRealtimeSync();
  }

  watch(() => authStore.token, async (newToken) => {
    if (newToken) {
      const syncStore = useSyncStore();
      await syncStore.initE2EE();
      connectRealtimeSync();
    } else {
      disconnectRealtimeSync();
    }
  });
});

onShow(() => {
  console.log("App Show");
  const deviceStore = useDeviceStore();
  deviceStore.detect();
});

onHide(() => {
  console.log("App Hide");
  disconnectRealtimeSync();
});
</script>

<style>
@import './styles/index.css';
</style>
