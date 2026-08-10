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
  <section
    class="card export-actions border border-base-300 bg-base-100 text-base-content shadow-sm"
    :aria-labelledby="headingId"
  >
    <div class="card-body export-body">
      <div class="export-heading">
        <h2 :id="headingId" class="card-title export-title">导出图片</h2>
        <span class="badge badge-ghost badge-sm">PNG · 4×</span>
      </div>

      <div class="export-controls">
        <button
          class="btn btn-outline export-action"
          type="button"
          data-action="copy"
          :disabled="copyDisabled"
          :aria-describedby="
            props.copyUnavailableReason ? copyHelpId : undefined
          "
          @click="requestCopy"
        >
          <span
            v-if="props.busy && !props.isExporting"
            class="loading loading-spinner loading-xs"
            aria-hidden="true"
          />
          {{ copyLabel }}
        </button>
        <button
          class="btn btn-primary export-action"
          type="button"
          data-action="export"
          :disabled="exportDisabled"
          @click="requestExport"
        >
          <span
            v-if="props.busy && props.isExporting"
            class="loading loading-spinner loading-xs"
            aria-hidden="true"
          />
          {{ exportLabel }}
        </button>
      </div>

      <p
        v-if="props.copyUnavailableReason"
        :id="copyHelpId"
        class="alert alert-warning copy-help"
        data-copy-help
      >
        {{ props.copyUnavailableReason }}
      </p>

      <p
        class="export-status text-base-content/60"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {{ props.statusMessage }}
      </p>
    </div>
  </section>
</template>

<style scoped>
.export-actions {
  border-radius: 1rem;
}

.export-body {
  gap: 0.875rem;
  padding: 1rem;
}

.export-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.export-title,
.copy-help,
.export-status {
  margin: 0;
}

.export-title {
  font-size: 1rem;
  line-height: 1.4;
}

.export-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.export-action {
  box-sizing: border-box;
  flex: 1 1 9rem;
  min-height: 44px;
}

.export-action:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.export-action:focus-visible {
  outline: 3px solid hsl(var(--p));
  outline-offset: 2px;
}

.copy-help,
.export-status {
  font-size: 0.875rem;
  line-height: 1.5;
}

.copy-help {
  padding: 0.75rem;
}

.export-status {
  min-height: 1.5em;
}
</style>
