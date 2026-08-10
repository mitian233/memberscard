<script setup lang="ts">
import NewEditorGuideModal from "@/components/NewEditorGuideModal.vue";
import OldVerCard from "@/components/oldVerCard.vue";
import DefaultLayout from "@/layouts/default.vue";
</script>

<template>
  <DefaultLayout>
    <OldVerCard />
  </DefaultLayout>
  <NewEditorGuideModal
    cookie-name="new-editor-guide-legacy-dismissed"
    target-path="/editor/legacy"
  />
</template>

<style scoped></style>
