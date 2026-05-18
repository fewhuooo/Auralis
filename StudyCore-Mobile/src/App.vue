<script setup lang="ts">
import { onLaunch, onShow, onHide } from "@dcloudio/uni-app";
import { connectRealtimeSync, disconnectRealtimeSync } from "@/api/sync";
import { useAuthStore } from "@/store/useAuthStore";
import { watch } from "vue";

onLaunch(() => {
  console.log("App Launch");
  const authStore = useAuthStore();
  
  // 仅在已登录状态下建立 WebSocket 连接
  if (authStore.token) {
    connectRealtimeSync();
  }

  // 监听 token 变化，登录后建立连接，登出后断开连接
  watch(() => authStore.token, (newToken) => {
    if (newToken) {
      connectRealtimeSync();
    } else {
      disconnectRealtimeSync();
    }
  });
});

onShow(() => {
  console.log("App Show");
});
onHide(() => {
  console.log("App Hide");
  disconnectRealtimeSync();
});
</script>
<style>
@import './styles/index.css';
</style>
