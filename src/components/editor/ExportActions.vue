<script setup lang="ts">
import { computed, useId } from "vue";

const props = defineProps<{
  busy: boolean;
  isExporting: boolean;
  canExport: boolean;
  canCopy: boolean;
  statusMessage: string;
  copyUnavailableReason?: string;
}>();

const emit = defineEmits<{
  copy: [];
  export: [];
}>();

const idPrefix = `export-actions-${useId()}`;
const headingId = `${idPrefix}-title`;
const copyHelpId = `${idPrefix}-copy-help`;

const copyLabel = computed(() =>
  props.busy && !props.isExporting ? "正在复制…" : "复制图片",
);
const exportLabel = computed(() =>
  props.busy && props.isExporting ? "正在导出…" : "保存 PNG",
);
const copyDisabled = computed(() => props.busy || !props.canCopy);
const exportDisabled = computed(() => props.busy || !props.canExport);

function requestCopy() {
  if (copyDisabled.value) return;
  emit("copy");
}

function requestExport() {
  if (exportDisabled.value) return;
  emit("export");
}
</script>

<template>
  <section class="export-actions" :aria-labelledby="headingId">
    <h2 :id="headingId" class="export-title">导出图片</h2>

    <div class="export-controls">
      <button
        class="export-action"
        type="button"
        data-action="copy"
        :disabled="copyDisabled"
        :aria-describedby="props.copyUnavailableReason ? copyHelpId : undefined"
        @click="requestCopy"
      >
        {{ copyLabel }}
      </button>
      <button
        class="export-action"
        type="button"
        data-action="export"
        :disabled="exportDisabled"
        @click="requestExport"
      >
        {{ exportLabel }}
      </button>
    </div>

    <p
      v-if="props.copyUnavailableReason"
      :id="copyHelpId"
      class="copy-help"
      data-copy-help
    >
      {{ props.copyUnavailableReason }}
    </p>

    <p
      class="export-status"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {{ props.statusMessage }}
    </p>
  </section>
</template>

<style scoped>
.export-actions {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1rem;
  border: 1px solid #d8dee8;
  border-radius: 0.75rem;
  background: #f7f9fc;
  color: #1f2937;
}

.export-title,
.copy-help,
.export-status {
  margin: 0;
}

.export-title {
  font-size: 1.125rem;
  line-height: 1.4;
}

.export-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.export-action {
  box-sizing: border-box;
  min-height: 44px;
  border: 1px solid #c4ccd8;
  border-radius: 0.5rem;
  background: #fff;
  color: #334155;
  cursor: pointer;
  font: inherit;
  padding: 0.5rem 0.875rem;
}

.export-action:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.export-action:focus-visible {
  outline: 3px solid #2563eb;
  outline-offset: 2px;
}

.copy-help,
.export-status {
  color: #526174;
  font-size: 0.875rem;
  line-height: 1.5;
}
</style>
