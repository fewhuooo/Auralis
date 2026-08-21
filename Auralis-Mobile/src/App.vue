<script setup lang="ts">
import { onLaunch, onShow, onHide } from "@dcloudio/uni-app";
import { connectRealtimeSync, disconnectRealtimeSync } from "@/api/sync";
import { useAuthStore } from "@/store/useAuthStore";
import { useSyncStore } from "@/store/useSyncStore";
import { useTaskStore } from "@/store/useTaskStore";
import { watch } from "vue";
import { localDb } from "@/services/localDb";

async function startAuthenticatedRuntime() {
  await localDb.init();
  useTaskStore().loadPomodoroCount();
  const syncStore = useSyncStore();
  await syncStore.initE2EE();
  await syncStore.triggerSync();
  await connectRealtimeSync();
}

onLaunch(async () => {
  console.log("App Launch");

  const authStore = useAuthStore();

  if (authStore.token && await authStore.restoreSession()) {
    await startAuthenticatedRuntime();
  }

  watch(() => authStore.token, async (newToken) => {
    if (newToken) {
      await startAuthenticatedRuntime();
    } else {
      disconnectRealtimeSync();
    }
  });
});

onShow(() => {
  console.log("App Show");
  if (useAuthStore().isAuthenticated) void connectRealtimeSync();
});

onHide(() => {
  console.log("App Hide");
  disconnectRealtimeSync();
});
</script>

<style>
@import './styles/index.css';
</style>
