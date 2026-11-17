<template>
  <view
    class="brand-logo"
    :style="{
      width: size,
      height: size,
      backgroundImage: `url('${logoUrl}')`,
    }"
  ></view>
</template>

<script setup lang="ts">
defineProps({
  size: { type: String, default: '36px' },
})

const brandSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28" fill="none"><rect width="28" height="28" rx="8" fill="url(#g)"/><path d="M7.5 14L11.5 10L16.5 14L20.5 10" stroke="white" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/><path d="M7.5 18L11.5 14L16.5 18L20.5 14" stroke="white" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" opacity="0.65"/><defs><linearGradient id="g" x1="0" y1="0" x2="28" y2="28" gradientUnits="userSpaceOnUse"><stop stop-color="#9EAD80"/><stop offset="1" stop-color="#76855B"/></linearGradient></defs></svg>'
const logoUrl = `data:image/svg+xml,${encodeURIComponent(brandSvg)}`
</script>

<style scoped>
.brand-logo {
  display: inline-block;
  flex-shrink: 0;
  background-size: contain;
  background-repeat: no-repeat;
  background-position: center;
}
</style>
