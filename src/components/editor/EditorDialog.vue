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

function isVisible(target: HTMLElement): boolean {
  if (target.hidden || target.getAttribute("aria-hidden") === "true") {
    return false;
  }
  const view = target.ownerDocument.defaultView;
  const style = view?.getComputedStyle(target);
  return style?.display !== "none" && style?.visibility !== "hidden";
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
    if (isDisabled(target) || !isVisible(target)) {
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
      closeSent = false;
      captureOpener();
      void focusCloseButton();
      return;
    }
    if (previous === true) {
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
  if (props.open) {
    restoreFocus();
  }
  mounted = false;
});
</script>

<template>
  <div
    v-if="props.open"
    class="editor-dialog-backdrop"
    @click="handleBackdropClick"
  >
    <section
      ref="panelRef"
      class="editor-dialog-panel"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="titleId"
      tabindex="-1"
      @keydown="handleKeydown"
    >
      <header class="editor-dialog-header">
        <h2 :id="titleId" class="editor-dialog-title">{{ props.title }}</h2>
        <button
          ref="closeButtonRef"
          class="editor-dialog-close"
          type="button"
          :aria-label="props.closeLabel"
          @click="requestClose"
        >
          {{ props.closeLabel }}
        </button>
      </header>
      <div class="editor-dialog-body">
        <slot />
      </div>
      <div v-if="$slots.actions" class="editor-dialog-actions">
        <slot name="actions" />
      </div>
    </section>
  </div>
</template>

<style scoped>
.editor-dialog-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: grid;
  place-items: center;
  padding: max(1rem, env(safe-area-inset-top))
    max(1rem, env(safe-area-inset-right)) max(1rem, env(safe-area-inset-bottom))
    max(1rem, env(safe-area-inset-left));
  background: rgb(15 23 42 / 0.62);
}

.editor-dialog-panel {
  width: min(100%, 40rem);
  max-height: calc(
    100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom)
  );
  overflow: auto;
  padding: max(1rem, env(safe-area-inset-top))
    max(1rem, env(safe-area-inset-right)) max(1rem, env(safe-area-inset-bottom))
    max(1rem, env(safe-area-inset-left));
  border: 1px solid rgb(148 163 184 / 0.4);
  border-radius: 1rem;
  background: #fff;
  color: #0f172a;
  box-shadow: 0 1.25rem 3rem rgb(15 23 42 / 0.24);
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
  border: 1px solid #cbd5e1;
  border-radius: 0.625rem;
  background: #fff;
  color: #0f172a;
  cursor: pointer;
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
  outline: 3px solid #2563eb;
  outline-offset: 3px;
}
</style>
