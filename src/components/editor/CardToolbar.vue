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
  <header
    class="card card-toolbar border border-base-300 bg-base-100 text-base-content shadow-sm"
  >
    <div class="card-body toolbar-layout">
      <div class="toolbar-heading">
        <h1 class="card-title toolbar-title">买够会员证编辑器</h1>
        <p class="toolbar-helper text-base-content/60">It's MyGO!!!!!</p>
      </div>

      <div class="join toolbar-controls" role="toolbar" aria-label="编辑器工具">
        <button
          class="btn join-item toolbar-control toolbar-template"
          :class="props.templateId === 'current' ? 'btn-primary' : 'btn-ghost'"
          type="button"
          data-template="current"
          :aria-pressed="props.templateId === 'current'"
          :disabled="props.busy"
          @click="selectTemplate('current')"
        >
          新版
        </button>
        <button
          class="btn join-item toolbar-control toolbar-template"
          :class="props.templateId === 'legacy' ? 'btn-primary' : 'btn-ghost'"
          type="button"
          data-template="legacy"
          :aria-pressed="props.templateId === 'legacy'"
          :disabled="props.busy"
          @click="selectTemplate('legacy')"
        >
          经典版
        </button>
        <button
          class="btn btn-ghost join-item toolbar-control toolbar-reset"
          type="button"
          data-reset-all
          :disabled="props.busy"
          @click="resetAll"
        >
          全部重置
        </button>
      </div>

      <p
        class="badge toolbar-status"
        :class="props.dirty ? 'badge-primary' : 'badge-ghost'"
        role="status"
      >
        {{ props.dirty ? "已修改" : "默认状态" }}
      </p>
    </div>
  </header>
</template>

<style scoped>
.card-toolbar {
  border-radius: 1rem;
}

.toolbar-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 1rem;
  padding: 1rem 1.125rem;
}

.toolbar-heading {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  min-width: 0;
}

.toolbar-title,
.toolbar-helper,
.toolbar-status {
  margin: 0;
}

.toolbar-title {
  font-size: 1.125rem;
  line-height: 1.3;
}

.toolbar-helper,
.toolbar-status {
  font-size: 0.875rem;
  line-height: 1.5;
}

.toolbar-controls {
  display: flex;
  flex-wrap: wrap;
  justify-self: end;
  overflow: hidden;
}

.toolbar-control {
  box-sizing: border-box;
  min-height: 44px;
}

.toolbar-control:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.toolbar-control:focus-visible {
  outline: 3px solid hsl(var(--p));
  outline-offset: 2px;
}

.toolbar-status {
  justify-self: end;
  white-space: nowrap;
}

@media (max-width: 48rem) {
  .toolbar-layout {
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 0.75rem;
  }

  .toolbar-controls {
    grid-column: 1 / -1;
    grid-row: 2;
    justify-self: stretch;
  }

  .toolbar-control {
    flex: 1 1 0;
  }

  .toolbar-status {
    grid-column: 2;
    grid-row: 1;
  }
}
</style>
