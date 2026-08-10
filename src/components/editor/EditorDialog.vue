<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from "vue";

interface EditorDialogProps {
  open: boolean;
  title: string;
  closeLabel?: string;
}

const props = withDefaults(defineProps<EditorDialogProps>(), {
  closeLabel: "关闭",
});

const emit = defineEmits<{
  close: [];
}>();

let sequence = 0;
function createTitleId(): string {
  sequence += 1;
  return `editor-dialog-title-${sequence}`;
}

const titleId = createTitleId();
const panelRef = ref<HTMLElement | null>(null);
const closeButtonRef = ref<HTMLButtonElement | null>(null);
let opener: HTMLElement | null = null;
let mounted = true;
let closeSent = false;
let pendingRestore = false;

function getDocument(): Document | null {
  try {
    return typeof document === "undefined" ? null : document;
  } catch {
    return null;
  }
}

function captureOpener(): void {
  const currentDocument = getDocument();
  const active = currentDocument?.activeElement;
  opener =
    typeof HTMLElement !== "undefined" && active instanceof HTMLElement
      ? active
      : null;
}

function restoreFocus(): void {
  const previousOpener = opener;
  opener = null;
  pendingRestore = false;
  if (previousOpener === null || !previousOpener.isConnected) {
    return;
  }
  try {
    previousOpener.focus();
  } catch {
    // Focus restoration is best effort when a host removes the opener.
  }
}

async function focusCloseButton(): Promise<void> {
  await nextTick();
  if (!mounted || !props.open) {
    return;
  }
  try {
    closeButtonRef.value?.focus();
  } catch {
    // A host can remove the dialog between the tick and focus.
  }
}

function requestClose(): void {
  if (!mounted || !props.open || closeSent) {
    return;
  }
  closeSent = true;
  emit("close");
}

function isVisible(target: HTMLElement, panel: HTMLElement): boolean {
  let current: HTMLElement | null = target;
  while (current !== null && current !== panel) {
    if (current.hidden || current.getAttribute("aria-hidden") === "true") {
      return false;
    }
    const view: Window | null = current.ownerDocument.defaultView;
    const style = view?.getComputedStyle(current);
    if (style?.display === "none" || style?.visibility === "hidden") {
      return false;
    }
    current = current.parentElement;
  }
  return current === panel;
}

function isDisabled(target: HTMLElement): boolean {
  return (
    "disabled" in target && Boolean((target as HTMLButtonElement).disabled)
  );
}

function focusTargets(panel: HTMLElement): HTMLElement[] {
  const candidates = Array.from(
    panel.querySelectorAll<HTMLElement>(
      "button, a[href], input, select, textarea, [tabindex]",
    ),
  );
  return candidates.filter((target) => {
    if (target === panel || isDisabled(target) || !isVisible(target, panel)) {
      return false;
    }
    if (target.hasAttribute("tabindex")) {
      const tabIndex = Number.parseInt(
        target.getAttribute("tabindex") ?? "",
        10,
      );
      return Number.isFinite(tabIndex) && tabIndex >= 0;
    }
    return true;
  });
}

function handleKeydown(event: KeyboardEvent): void {
  if (!mounted || !props.open) {
    return;
  }
  if (event.key === "Escape") {
    event.preventDefault();
    requestClose();
    return;
  }
  if (event.key !== "Tab") {
    return;
  }

  const panel = panelRef.value;
  if (panel === null) {
    return;
  }
  const targets = focusTargets(panel);
  event.preventDefault();
  if (targets.length === 0) {
    panel.focus();
    return;
  }

  const active = panel.ownerDocument.activeElement;
  const index = active instanceof HTMLElement ? targets.indexOf(active) : -1;
  const nextIndex = event.shiftKey
    ? index <= 0
      ? targets.length - 1
      : index - 1
    : index < 0 || index === targets.length - 1
      ? 0
      : index + 1;
  targets[nextIndex]?.focus();
}

function handleBackdropClick(event: MouseEvent): void {
  if (!mounted || !props.open || event.target !== event.currentTarget) {
    return;
  }
  requestClose();
}

watch(
  () => props.open,
  (open, previous) => {
    if (open) {
      pendingRestore = false;
      closeSent = false;
      captureOpener();
      void focusCloseButton();
      return;
    }
    if (previous === true) {
      pendingRestore = true;
      void nextTick().then(() => {
        if (mounted) {
          restoreFocus();
        }
      });
    }
  },
  { immediate: true, flush: "post" },
);

onBeforeUnmount(() => {
  if (props.open || pendingRestore) {
    restoreFocus();
  }
  mounted = false;
});
</script>

<template>
  <div
    v-if="props.open"
    class="modal modal-open editor-dialog-backdrop"
    @pointerdown="handleBackdropClick"
    @click="handleBackdropClick"
  >
    <section
      ref="panelRef"
      class="modal-box card editor-dialog-panel bg-base-100 text-base-content shadow-xl"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="titleId"
      tabindex="-1"
      @keydown="handleKeydown"
    >
      <header class="flex items-start justify-between gap-4 editor-dialog-header">
        <h2 :id="titleId" class="card-title editor-dialog-title">
          {{ props.title }}
        </h2>
        <button
          ref="closeButtonRef"
          class="btn btn-sm btn-ghost editor-dialog-close"
          type="button"
          :aria-label="props.closeLabel"
          @click="requestClose"
        >
          {{ props.closeLabel }}
        </button>
      </header>
      <div class="mt-4 editor-dialog-body">
        <slot />
      </div>
      <div v-if="$slots.actions" class="modal-action editor-dialog-actions">
        <slot name="actions" />
      </div>
    </section>
  </div>
</template>

<style scoped>
.editor-dialog-backdrop {
  box-sizing: border-box;
  z-index: 1000;
  padding: max(1rem, env(safe-area-inset-top))
    max(1rem, env(safe-area-inset-right)) max(1rem, env(safe-area-inset-bottom))
    max(1rem, env(safe-area-inset-left));
  overflow: auto;
}

.editor-dialog-panel {
  box-sizing: border-box;
  width: min(100%, 40rem);
  max-height: min(
    100%,
    calc(100dvh - 2rem - env(safe-area-inset-top) - env(safe-area-inset-bottom))
  );
  overflow: auto;
  padding: max(1rem, env(safe-area-inset-top))
    max(1rem, env(safe-area-inset-right)) max(1rem, env(safe-area-inset-bottom))
    max(1rem, env(safe-area-inset-left));
}

.editor-dialog-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.editor-dialog-title {
  margin: 0;
  font-size: 1.25rem;
  line-height: 1.35;
}

.editor-dialog-close {
  min-width: 44px;
  min-height: 44px;
  flex: 0 0 auto;
}

.editor-dialog-body {
  margin-top: 1rem;
}

.editor-dialog-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 1.25rem;
}

.editor-dialog-actions :deep(button),
.editor-dialog-actions :deep(a) {
  min-width: 44px;
  min-height: 44px;
}

.editor-dialog-close:focus-visible,
.editor-dialog-panel :deep(:focus-visible) {
  outline: 3px solid hsl(var(--p));
  outline-offset: 3px;
}
</style>
