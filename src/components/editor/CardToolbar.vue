<script setup lang="ts">
import type { TemplateId } from "@/types/card";

const props = defineProps<{
  templateId: TemplateId;
  dirty: boolean;
  busy: boolean;
}>();

const emit = defineEmits<{
  "template-change": [id: TemplateId];
  "reset-all": [];
}>();

function selectTemplate(id: TemplateId) {
  if (props.busy || props.templateId === id) return;
  emit("template-change", id);
}

function resetAll() {
  if (props.busy) return;
  emit("reset-all");
}
</script>

<template>
  <header class="card-toolbar">
    <div class="toolbar-heading">
      <h1 class="toolbar-title">会员证编辑器</h1>
      <p class="toolbar-helper">直接编辑预览，同屏调整</p>
    </div>

    <div class="toolbar-controls" role="toolbar" aria-label="编辑器工具">
      <button
        class="toolbar-control toolbar-template"
        type="button"
        data-template="current"
        :aria-pressed="props.templateId === 'current'"
        :disabled="props.busy"
        @click="selectTemplate('current')"
      >
        新版
      </button>
      <button
        class="toolbar-control toolbar-template"
        type="button"
        data-template="legacy"
        :aria-pressed="props.templateId === 'legacy'"
        :disabled="props.busy"
        @click="selectTemplate('legacy')"
      >
        经典版
      </button>
      <button
        class="toolbar-control toolbar-reset"
        type="button"
        data-reset-all
        :disabled="props.busy"
        @click="resetAll"
      >
        全部重置
      </button>
    </div>

    <p class="toolbar-status" role="status">
      {{ props.dirty ? "已修改" : "默认状态" }}
    </p>
  </header>
</template>

<style scoped>
.card-toolbar {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1rem;
  border: 1px solid #d8dee8;
  border-radius: 0.75rem;
  background: #f7f9fc;
  color: #1f2937;
}

.toolbar-heading {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.toolbar-title,
.toolbar-helper,
.toolbar-status {
  margin: 0;
}

.toolbar-title {
  font-size: 1.25rem;
  line-height: 1.35;
}

.toolbar-helper,
.toolbar-status {
  color: #526174;
  font-size: 0.875rem;
  line-height: 1.5;
}

.toolbar-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.toolbar-control {
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

.toolbar-template[aria-pressed="true"] {
  border-color: #2563eb;
  background: #eff6ff;
  color: #1d4ed8;
  font-weight: 700;
}

.toolbar-control:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.toolbar-control:focus-visible {
  outline: 3px solid #2563eb;
  outline-offset: 2px;
}
</style>
