<script setup lang="ts">
import { computed, ref } from "vue";
import CardEditorWorkspace from "@/components/editor/CardEditorWorkspace.vue";
import EditorDialog from "@/components/editor/EditorDialog.vue";
import type { InspectorGroup } from "@/components/editor/CardInspector.vue";
import {
  type CardTemplateRegistry,
  useCardEditor,
} from "@/composables/useCardEditor";
import { useAvatarUploadWorkflow } from "@/composables/useAvatarUploadWorkflow";
import {
  type UseCardExportWorkflowOptions,
  useCardExportWorkflow,
} from "@/composables/useCardExportWorkflow";
import { loadAvatarFile } from "@/editor/avatarUpload";
import type { CardCanvasController } from "@/fabric/cardCanvasController";
import { currentCardTemplate } from "@/templates/currentCardTemplate";
import { legacyCardTemplate } from "@/templates/legacyCardTemplate";
import type {
  CardField,
  CardPatch,
  EditorSelection,
  FieldValidationError,
  ResourceStatus,
  TemplateId,
} from "@/types/card";

interface Props {
  initialTemplateId: TemplateId;
  canvasController?: CardCanvasController;
  avatarLoader?: typeof loadAvatarFile;
  exportOptions?: UseCardExportWorkflowOptions;
}

const props = defineProps<Props>();

const templates: CardTemplateRegistry = {
  current: currentCardTemplate,
  legacy: legacyCardTemplate,
};

const editor = useCardEditor({
  templates,
  initialTemplateId: props.initialTemplateId,
});
const avatarWorkflow = useAvatarUploadWorkflow(editor, props.avatarLoader);
const exportWorkflow = useCardExportWorkflow(editor, props.exportOptions);

const activeGroup = ref<InspectorGroup>("basic");
const templateDialogOpen = ref(false);

const avatarWorking = computed(() => avatarWorkflow.working.value);
const busy = computed(() => editor.isBusy.value || avatarWorking.value);
const canExport = computed(
  () => editor.canExport.value && !avatarWorking.value,
);
const canCopy = computed(
  () => exportWorkflow.canCopy.value && !avatarWorking.value,
);
const document = computed(() => editor.document.value);
const template = computed(() => editor.template.value);
const canvasSyncRequest = computed(() => editor.canvasSyncRequest.value);
const fieldErrors = computed(() => editor.fieldErrors.value);
const resourceStatus = computed(() => editor.resourceStatus.value);
const uploadMessage = computed(() => avatarWorkflow.message.value);
const dirty = computed(() => editor.isDirty.value);
const isExporting = computed(() => editor.isExporting.value);
const statusMessage = computed(() => editor.statusMessage.value);
const copyUnavailableReason = computed(
  () => exportWorkflow.copyUnavailableReason.value,
);

function handleTemplateChange(id: TemplateId): void {
  const result = editor.requestTemplateChange(id);
  if (result === "confirmation-required") {
    templateDialogOpen.value = true;
    return;
  }
  if (result === "changed") {
    activeGroup.value = "basic";
  }
}

function cancelTemplateChange(): void {
  editor.cancelTemplateChange();
  templateDialogOpen.value = false;
}

function confirmTemplateChange(): void {
  const confirmed = editor.confirmTemplateChange();
  templateDialogOpen.value = false;
  if (confirmed !== null) {
    activeGroup.value = "basic";
  }
}

function handleCanvasSettled(
  payload: Parameters<typeof editor.handleCanvasSettled>[0],
): void {
  editor.handleCanvasSettled(payload);
}

function handleCanvasFailure(
  revision: number,
  status: Extract<ResourceStatus, { state: "error" }>,
): void {
  editor.handleCanvasFailure(revision, status);
}

function handleCanvasPatch(patch: CardPatch, source: "canvas"): void {
  editor.handleCanvasPatch(patch, source);
}

function handleSelectionChange(selection: EditorSelection): void {
  editor.handleSelectionChange(selection);
}

function handleFieldValidation(
  field: CardField,
  error: FieldValidationError | null,
): void {
  editor.handleFieldValidation(field, error);
}

function handleEditCancel(field: CardField, restoredValue: string): void {
  // The canvas has already restored its own value; this event is informational.
  void field;
  void restoredValue;
}

function handleResetAll(): void {
  editor.resetAll();
  activeGroup.value = "basic";
}
</script>

<template>
  <CardEditorWorkspace
    :document="document"
    :template="template"
    :sync-request="canvasSyncRequest"
    :active-group="activeGroup"
    :field-errors="fieldErrors"
    :resource-status="resourceStatus"
    :upload-message="uploadMessage"
    :dirty="dirty"
    :busy="busy"
    :is-exporting="isExporting"
    :can-export="canExport"
    :can-copy="canCopy"
    :status-message="statusMessage"
    :copy-unavailable-reason="copyUnavailableReason"
    :canvas-controller="props.canvasController"
    @update:active-group="activeGroup = $event"
    @template-change="handleTemplateChange"
    @reset-all="handleResetAll"
    @canvas-ready="handleCanvasSettled"
    @resource-error="handleCanvasFailure($event.revision, $event.status)"
    @canvas-change="handleCanvasPatch"
    @selection-change="handleSelectionChange"
    @edit-cancel="handleEditCancel"
    @validation-error="handleFieldValidation"
    @update-field="editor.updateField"
    @update-avatar="editor.updateAvatar"
    @reset-field="editor.resetField"
    @reset-avatar="editor.resetAvatar"
    @avatar-file="void avatarWorkflow.upload($event)"
    @copy="void exportWorkflow.copyPng()"
    @export="void exportWorkflow.savePng()"
  />

  <EditorDialog
    :open="templateDialogOpen"
    title="切换会员证模板？"
    @close="cancelTemplateChange"
  >
    <p>当前修改将被重置。</p>
    <template #actions>
      <div class="template-dialog-actions">
        <button
          class="btn btn-ghost template-dialog-cancel"
          type="button"
          @click="cancelTemplateChange"
        >
          保留当前修改
        </button>
        <button
          class="btn btn-primary template-dialog-confirm"
          type="button"
          @click="confirmTemplateChange"
        >
          继续切换
        </button>
      </div>
    </template>
  </EditorDialog>
</template>

<style scoped>
.template-dialog-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.template-dialog-actions :deep(button) {
  min-width: 44px;
  min-height: 44px;
}

.template-dialog-actions :deep(button:focus-visible) {
  outline: 3px solid #2563eb;
  outline-offset: 3px;
}
</style>
