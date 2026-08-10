<script setup lang="ts">
import { computed } from "vue";
import CardInspector, {
  type InspectorGroup,
} from "@/components/editor/CardInspector.vue";
import CardToolbar from "@/components/editor/CardToolbar.vue";
import ExportActions from "@/components/editor/ExportActions.vue";
import FabricCardCanvas from "@/components/editor/FabricCardCanvas.vue";
import FullPreviewShell from "@/components/editor/FullPreviewShell.vue";
import type {
  CanvasSettledPayload,
  CanvasSyncRequest,
} from "@/composables/useCardEditor";
import type { CardCanvasController } from "@/fabric/cardCanvasController";
import type {
  AvatarTransform,
  CardDocument,
  CardField,
  CardPatch,
  CardTemplateDefinition,
  EditorSelection,
  FieldValidationError,
  ResourceStatus,
} from "@/types/card";

interface Props {
  document: CardDocument;
  template: CardTemplateDefinition;
  syncRequest: CanvasSyncRequest;
  activeGroup: InspectorGroup;
  fieldErrors: Readonly<Partial<Record<CardField, FieldValidationError>>>;
  resourceStatus: ResourceStatus;
  uploadMessage: string;
  dirty: boolean;
  busy: boolean;
  isExporting: boolean;
  canExport: boolean;
  canCopy: boolean;
  statusMessage: string;
  copyUnavailableReason?: string;
  canvasController?: CardCanvasController;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  "update:activeGroup": [group: InspectorGroup];
  "template-change": [id: "current" | "legacy"];
  "reset-all": [];
  "canvas-ready": [payload: CanvasSettledPayload];
  "resource-error": [
    payload: {
      revision: number;
      status: Extract<ResourceStatus, { state: "error" }>;
    },
  ];
  "canvas-change": [patch: CardPatch, source: "canvas"];
  "selection-change": [selection: EditorSelection];
  "edit-cancel": [field: CardField, restoredValue: string];
  "validation-error": [field: CardField, error: FieldValidationError | null];
  "update-field": [field: CardField, value: string];
  "update-avatar": [value: AvatarTransform];
  "reset-field": [field: CardField];
  "reset-avatar": [];
  "avatar-file": [file: File];
  copy: [];
  export: [];
}>();

const resourceMessage = computed(() => {
  switch (props.resourceStatus.state) {
    case "loading":
      return "正在加载画布资源…";
    case "ready":
      return "预览已就绪。";
    case "degraded":
    case "error":
      return props.resourceStatus.message;
  }
  return "";
});

const resourceRecovery = computed(() => {
  if (props.resourceStatus.state !== "error") {
    return "";
  }
  return props.resourceStatus.recoverable
    ? "请检查资源或重新上传头像后重试。"
    : "请刷新页面后重试。";
});

function forwardCanvasChange(patch: CardPatch, source: "canvas"): void {
  emit("canvas-change", patch, source);
}

function forwardEditCancel(field: CardField, restoredValue: string): void {
  emit("edit-cancel", field, restoredValue);
}

function forwardValidationError(
  field: CardField,
  error: FieldValidationError | null,
): void {
  emit("validation-error", field, error);
}

function forwardFieldUpdate(field: CardField, value: string): void {
  emit("update-field", field, value);
}
</script>

<template>
  <main class="card-editor-workspace" aria-label="会员证编辑器">
    <div class="editor-toolbar-wrapper">
      <CardToolbar
        :template-id="props.template.id"
        :dirty="props.dirty"
        :busy="props.busy"
        @template-change="emit('template-change', $event)"
        @reset-all="emit('reset-all')"
      />
    </div>

    <div class="editor-workspace-grid">
      <section class="editor-preview-region" aria-label="会员证预览">
        <FullPreviewShell>
          <FabricCardCanvas
            :document="props.document"
            :template="props.template"
            :sync-request="props.syncRequest"
            :controller="props.canvasController"
            :disabled="props.busy"
            :loading="props.resourceStatus.state === 'loading'"
            @ready="emit('canvas-ready', $event)"
            @resource-error="emit('resource-error', $event)"
            @change="forwardCanvasChange"
            @selection-change="emit('selection-change', $event)"
            @edit-cancel="forwardEditCancel"
            @validation-error="forwardValidationError"
          />
        </FullPreviewShell>
      </section>

      <aside class="editor-controls" aria-label="编辑控制">
        <CardInspector
          :document="props.document"
          :template="props.template"
          :active-group="props.activeGroup"
          :field-errors="props.fieldErrors"
          :disabled="props.busy"
          @update:active-group="emit('update:activeGroup', $event)"
          @update-field="forwardFieldUpdate"
          @update-avatar="emit('update-avatar', $event)"
          @reset-field="emit('reset-field', $event)"
          @reset-avatar="emit('reset-avatar')"
          @avatar-file="emit('avatar-file', $event)"
        />

        <div class="editor-status-stack">
          <p
            class="editor-upload-status"
            data-upload-status
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            {{ props.uploadMessage }}
          </p>
          <p
            class="editor-resource-status"
            data-resource-status
            role="status"
            aria-live="polite"
          >
            {{ resourceMessage }}
          </p>
          <p
            v-if="resourceRecovery"
            class="editor-resource-recovery"
            data-resource-recovery
          >
            {{ resourceRecovery }}
          </p>
        </div>

        <div class="editor-export-wrapper">
          <ExportActions
            :busy="props.busy"
            :is-exporting="props.isExporting"
            :can-export="props.canExport"
            :can-copy="props.canCopy"
            :status-message="props.statusMessage"
            :copy-unavailable-reason="props.copyUnavailableReason"
            @copy="emit('copy')"
            @export="emit('export')"
          />
        </div>
      </aside>
    </div>
  </main>
</template>

<style scoped>
.card-editor-workspace {
  box-sizing: border-box;
  width: 100%;
  max-width: 90rem;
  min-width: 0;
  margin: 0 auto;
  padding: 1rem clamp(1rem, 4vw, 2.5rem) 2rem;
  color: #1f2937;
}

.editor-toolbar-wrapper {
  min-width: 0;
  margin-bottom: 1rem;
}

.editor-workspace-grid {
  display: grid;
  grid-template-columns: minmax(0, 13fr) minmax(320px, 7fr);
  align-items: start;
  gap: 1rem;
}

.editor-preview-region {
  position: sticky;
  top: 1rem;
  min-width: 0;
  align-self: start;
}

.editor-controls {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 1rem;
}

.editor-controls :deep(.card-inspector) {
  box-sizing: border-box;
  min-width: 0;
  width: 100%;
}

.editor-status-stack {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 0.375rem;
}

.editor-upload-status,
.editor-resource-status,
.editor-resource-recovery {
  margin: 0;
  color: #334155;
  font-size: 0.875rem;
  line-height: 1.5;
}

.editor-upload-status {
  min-height: 1.5em;
}

.editor-resource-recovery {
  color: #7f1d1d;
}

.editor-export-wrapper {
  min-width: 0;
}

@media (max-width: 64rem) {
  .editor-toolbar-wrapper {
    position: sticky;
    top: 0;
    z-index: 20;
  }

  .editor-workspace-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .editor-preview-region {
    position: static;
  }

  .editor-controls {
    min-width: 0;
  }

  .editor-export-wrapper {
    padding-bottom: calc(1rem + env(safe-area-inset-bottom));
  }
}
</style>
