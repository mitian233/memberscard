<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  toRaw,
  useId,
  watch,
} from "vue";
import type {
  CanvasSettledPayload,
  CanvasSyncRequest,
} from "@/composables/useCardEditor";
import {
  createCardCanvasController,
  type CardCanvasController,
} from "@/fabric/cardCanvasController";
import {
  createCardCanvasSession,
  type CardCanvasSession,
  type CreateCardCanvasSessionOptions,
} from "@/fabric/cardCanvasSession";
import type {
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
  controller?: CardCanvasController;
  disabled?: boolean;
  loading?: boolean;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  ready: [payload: CanvasSettledPayload];
  "resource-error": [
    payload: {
      revision: number;
      status: Extract<ResourceStatus, { state: "error" }>;
    },
  ];
  change: [patch: CardPatch, source: "canvas"];
  "selection-change": [selection: EditorSelection];
  "edit-cancel": [field: CardField, restoredValue: string];
  "validation-error": [field: CardField, error: FieldValidationError | null];
}>();

const controller =
  props.controller === undefined
    ? createCardCanvasController()
    : toRaw(props.controller);
const idPrefix = `fabric-card-canvas-${useId()}`;
const headingId = `${idPrefix}-heading`;
const summaryId = `${idPrefix}-summary`;

const hostRef = ref<HTMLElement | null>(null);
const lowerCanvasRef = ref<HTMLCanvasElement | null>(null);
const pendingSubmits = ref(0);
const isMounted = ref(false);
const busy = computed(() => props.loading === true || pendingSubmits.value > 0);

let canvas: ReturnType<CardCanvasController["createCanvas"]> | undefined;
let session: CardCanvasSession | undefined;
let observer: ResizeObserver | undefined;
let frameId: number | undefined;
let stopRevisionWatch: (() => void) | undefined;
let disposeStarted = false;
const handledResourceRevisions = new Set<number>();

const summaryLines = computed(() => {
  const lines = [
    ...(props.template.fields.name !== undefined
      ? [`姓名：${props.document.name}`]
      : []),
    ...(props.template.fields.nameEn !== undefined
      ? [`英文名：${props.document.nameEn}`]
      : []),
    ...(props.template.fields.bandName !== undefined
      ? [`乐队名：${props.document.bandName}`]
      : []),
  ];
  if (
    props.template.fields.birthday !== undefined &&
    props.document.birthday !== undefined
  ) {
    lines.push(`出生日期：${props.document.birthday}`);
  }
  lines.push(props.document.avatar.src ? "头像已加载" : "头像未加载");
  lines.push("也可在检查器中使用键盘编辑");
  return lines;
});

function setUpperCanvasAttributes(): void {
  const upper = canvas?.raw.upperCanvasEl;
  if (upper === undefined) return;

  upper.classList.add("preview-canvas-upper");
  upper.classList.toggle("is-disabled", props.disabled === true);
  upper.setAttribute("tabindex", props.disabled === true ? "-1" : "0");
  upper.setAttribute("aria-label", "可编辑会员证预览");
  upper.setAttribute("aria-describedby", summaryId);
  upper.setAttribute(
    "aria-disabled",
    props.disabled === true ? "true" : "false",
  );
  upper.setAttribute("aria-busy", busy.value ? "true" : "false");

  const host = hostRef.value;
  if (host !== null && upper.parentElement === null) {
    host.appendChild(upper);
  }
}

function notifyResourceError(
  payload: Parameters<
    NonNullable<CreateCardCanvasSessionOptions["callbacks"]>["onResourceError"]
  >[0],
): void {
  if (!isMounted.value) return;
  handledResourceRevisions.add(payload.revision);
  emit("resource-error", payload);
}

function notifySubmitFailure(request: CanvasSyncRequest, error: unknown): void {
  if (
    !isMounted.value ||
    request.revision !== props.syncRequest.revision ||
    handledResourceRevisions.has(request.revision)
  ) {
    return;
  }

  let status: Extract<ResourceStatus, { state: "error" }>;
  try {
    status = controller.classifyResourceError(
      error,
      request.document,
      request.template,
    );
  } catch {
    return;
  }
  notifyResourceError({ revision: request.revision, status });
}

function submitCurrentRequest(): void {
  const request = toRaw(props.syncRequest);
  pendingSubmits.value += 1;
  let submission: Promise<void>;
  try {
    submission = session?.submit(request) ?? Promise.resolve();
  } catch (error) {
    notifySubmitFailure(request, error);
    pendingSubmits.value -= 1;
    setUpperCanvasAttributes();
    return;
  }

  void Promise.resolve(submission)
    .catch((error: unknown) => {
      notifySubmitFailure(request, error);
    })
    .finally(() => {
      pendingSubmits.value = Math.max(0, pendingSubmits.value - 1);
      setUpperCanvasAttributes();
    });
}

function scheduleMeasurement(): void {
  if (!isMounted.value) return;
  if (frameId !== undefined) {
    cancelAnimationFrame(frameId);
  }
  frameId = requestAnimationFrame(() => {
    frameId = undefined;
    if (!isMounted.value) return;
    const host = hostRef.value;
    const adapter = canvas;
    if (host === null || adapter === undefined) return;

    const rect = host.getBoundingClientRect();
    const availableWidth = rect.width;
    const availableHeight = rect.height;
    if (
      !Number.isFinite(availableWidth) ||
      !Number.isFinite(availableHeight) ||
      availableWidth <= 0 ||
      availableHeight <= 0
    ) {
      return;
    }

    const scale = Math.min(
      availableWidth / adapter.width,
      availableHeight / adapter.height,
    );
    if (!Number.isFinite(scale) || scale <= 0) return;

    const cssWidth = Math.round(adapter.width * scale);
    const cssHeight = Math.round(adapter.height * scale);
    if (cssWidth <= 0 || cssHeight <= 0) return;
    adapter.raw.setDimensions(
      { width: cssWidth, height: cssHeight },
      { cssOnly: true },
    );
  });
}

function createSession(): void {
  const adapter = canvas;
  if (adapter === undefined) return;

  const keyTarget =
    typeof globalThis.document === "undefined"
      ? undefined
      : globalThis.document;
  session = createCardCanvasSession({
    canvas: adapter,
    controller,
    pointerTarget: adapter.raw.upperCanvasEl,
    keyTarget,
    callbacks: {
      interactionEnabled: () => props.disabled !== true,
      onSettled: (payload) => {
        if (isMounted.value) emit("ready", payload);
      },
      onResourceError: notifyResourceError,
      onDocumentPatch: (patch, source) => {
        if (isMounted.value) emit("change", patch, source);
      },
      onSelectionChange: (selection) => {
        if (isMounted.value) emit("selection-change", selection);
      },
      onFieldValidation: (field, error) => {
        if (isMounted.value) emit("validation-error", field, error);
      },
      onEditCancel: (field, restoredValue) => {
        if (isMounted.value) emit("edit-cancel", field, restoredValue);
      },
    },
  });
}

function setupResizeObserver(): void {
  const host = hostRef.value;
  if (host === null || typeof ResizeObserver === "undefined") return;

  observer = new ResizeObserver(() => {
    scheduleMeasurement();
  });
  observer.observe(host);
  scheduleMeasurement();
}

onMounted(() => {
  isMounted.value = true;
  const lowerCanvas = lowerCanvasRef.value;
  if (lowerCanvas === null) return;

  canvas = controller.createCanvas(lowerCanvas);
  setUpperCanvasAttributes();
  createSession();
  setupResizeObserver();
  stopRevisionWatch = watch(
    () => props.syncRequest.revision,
    () => {
      submitCurrentRequest();
    },
    { immediate: true, flush: "post" },
  );
  setUpperCanvasAttributes();
});

onBeforeUnmount(() => {
  isMounted.value = false;
  stopRevisionWatch?.();
  stopRevisionWatch = undefined;
  observer?.disconnect();
  observer = undefined;
  if (frameId !== undefined) {
    cancelAnimationFrame(frameId);
    frameId = undefined;
  }

  if (!disposeStarted) {
    disposeStarted = true;
    try {
      void Promise.resolve(session?.dispose()).catch(() => undefined);
    } catch {
      // A cleanup error must not escape Vue's unmount lifecycle.
    }
  }
});

watch(busy, () => {
  setUpperCanvasAttributes();
});

watch(
  () => props.disabled,
  () => {
    setUpperCanvasAttributes();
  },
);
</script>

<template>
  <section
    class="fabric-card-canvas rounded-box bg-base-100 text-base-content"
    :aria-labelledby="headingId"
    :aria-busy="busy ? 'true' : undefined"
    :aria-disabled="props.disabled ? 'true' : 'false'"
  >
    <h2 :id="headingId" class="preview-heading">会员证预览</h2>
    <div ref="hostRef" class="preview-host">
      <canvas ref="lowerCanvasRef" class="preview-canvas" aria-hidden="true" />
      <div v-if="busy" class="loading-overlay" aria-live="polite">
        <span class="loading loading-spinner loading-md" aria-hidden="true" />
        <span>正在加载预览…</span>
      </div>
    </div>
    <p :id="summaryId" class="visually-hidden" data-card-summary>
      <span v-for="line in summaryLines" :key="line">{{ line }}</span>
    </p>
  </section>
</template>

<style scoped>
.fabric-card-canvas {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  overflow: auto;
  padding: 1rem;
}

.preview-heading {
  margin: 0 0 0.75rem;
  font-size: 1.25rem;
  line-height: 1.35;
}

.preview-host {
  position: relative;
  display: flex;
  width: 100%;
  min-width: 0;
  aspect-ratio: 3 / 2;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 0.75rem;
  background: hsl(var(--b2));
}

.preview-canvas {
  display: block;
  max-width: 100%;
  height: auto;
}

:deep(.preview-canvas-upper) {
  touch-action: none;
}

:deep(.preview-canvas-upper.is-disabled) {
  pointer-events: none;
}

.loading-overlay {
  position: absolute;
  inset: 0;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 0.75rem;
  pointer-events: none;
  background: hsl(var(--b1) / 85%);
  color: hsl(var(--bc));
  font-weight: 600;
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.visually-hidden span {
  display: block;
}
</style>
