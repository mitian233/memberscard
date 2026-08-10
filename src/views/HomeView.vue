<script setup lang="ts">
import MembersCard from "@/components/membersCard.vue";
import NewEditorGuideModal from "@/components/NewEditorGuideModal.vue";
import DefaultLayout from "@/layouts/default.vue";
</script>

<template>
  <DefaultLayout>
    <MembersCard />
  </DefaultLayout>
  <NewEditorGuideModal
    cookie-name="new-editor-guide-current-dismissed"
    target-path="/editor/current"
  />
</template>

<style scoped></style>
