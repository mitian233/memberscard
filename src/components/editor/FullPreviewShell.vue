<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref } from "vue";

const emit = defineEmits<{
  open: [];
  close: [];
}>();

let titleSequence = 0;
function createTitleId(): string {
  titleSequence += 1;
  return `full-preview-title-${titleSequence}`;
}

const titleId = createTitleId();
const expanded = ref(false);
const triggerRef = ref<HTMLButtonElement | null>(null);
const closeRef = ref<HTMLButtonElement | null>(null);
const overlayRef = ref<HTMLElement | null>(null);
let opener: HTMLElement | null = null;
let pendingRestore = false;
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
    typeof HTMLElement !== "undefined" &&
    active instanceof HTMLElement &&
    active !== currentDocument?.body &&
    active !== currentDocument?.documentElement
      ? active
      : triggerRef.value;
}

function restoreFocus(): void {
  const previous = opener;
  opener = null;
  pendingRestore = false;
  if (previous === null || !previous.isConnected) {
    return;
  }
  try {
    previous.focus();
  } catch {
    // Focus restoration is best effort when the host removes the opener.
  }
}

async function focusCloseButton(): Promise<void> {
  await nextTick();
  if (!mounted || !expanded.value) {
    return;
  }
  try {
    closeRef.value?.focus();
  } catch {
    // Hosts may remove the shell between state transition and the tick.
  }
}

function openPreview(): void {
  if (!mounted || expanded.value) {
    return;
  }
  captureOpener();
  closeSent = false;
  pendingRestore = false;
  expanded.value = true;
  emit("open");
  void focusCloseButton();
}

function closePreview(): void {
  if (!mounted || !expanded.value || closeSent) {
    return;
  }
  closeSent = true;
  expanded.value = false;
  pendingRestore = true;
  emit("close");
  void nextTick().then(() => {
    if (mounted) {
      restoreFocus();
    }
  });
}

function isVisible(target: HTMLElement, overlay: HTMLElement): boolean {
  let current: HTMLElement | null = target;
  while (current !== null && current !== overlay) {
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
  return current === overlay;
}

function focusTargets(overlay: HTMLElement): HTMLElement[] {
  const candidates = Array.from(
    overlay.querySelectorAll<HTMLElement>(
      "button, a[href], input, select, textarea, [tabindex]",
    ),
  );
  return candidates.filter((target) => {
    if (target === overlay || !isVisible(target, overlay)) {
      return false;
    }
    if (
      "disabled" in target &&
      Boolean((target as HTMLButtonElement).disabled)
    ) {
      return false;
    }
    if (!target.hasAttribute("tabindex")) {
      return true;
    }
    const tabIndex = Number.parseInt(target.getAttribute("tabindex") ?? "", 10);
    return Number.isFinite(tabIndex) && tabIndex >= 0;
  });
}

function handleKeydown(event: KeyboardEvent): void {
  if (!mounted || !expanded.value) {
    return;
  }
  if (event.key === "Escape") {
    event.preventDefault();
    closePreview();
    return;
  }
  if (event.key !== "Tab") {
    return;
  }
  const overlay = overlayRef.value;
  if (overlay === null) {
    return;
  }
  const targets = focusTargets(overlay);
  event.preventDefault();
  if (targets.length === 0) {
    overlay.focus();
    return;
  }
  const active = overlay.ownerDocument.activeElement;
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
  if (!mounted || !expanded.value || event.target !== event.currentTarget) {
    return;
  }
  closePreview();
}

onBeforeUnmount(() => {
  if (expanded.value || pendingRestore) {
    restoreFocus();
  }
  mounted = false;
});
</script>

<template>
  <div class="full-preview-shell" :class="{ 'is-expanded': expanded }">
    <button
      v-show="!expanded"
      ref="triggerRef"
      class="btn btn-sm btn-ghost full-preview-trigger"
      type="button"
      @click="openPreview"
    >
      完整预览
    </button>

    <div
      ref="overlayRef"
      class="full-preview-overlay"
      :role="expanded ? 'dialog' : undefined"
      :aria-modal="expanded ? 'true' : undefined"
      :aria-labelledby="expanded ? titleId : undefined"
      tabindex="-1"
      @keydown="handleKeydown"
      @click="handleBackdropClick"
    >
      <section
        class="card full-preview-panel bg-base-100 text-base-content shadow-xl"
      >
        <header class="full-preview-header">
          <h2 :id="titleId" class="card-title full-preview-title">
            完整会员证预览
          </h2>
          <button
            v-if="expanded"
            ref="closeRef"
            class="btn btn-sm btn-ghost full-preview-close"
            type="button"
            aria-label="关闭完整预览"
            @click="closePreview"
          >
            关闭完整预览
          </button>
        </header>
        <div class="full-preview-content">
          <slot />
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.full-preview-shell {
  box-sizing: border-box;
  min-width: 0;
  width: 100%;
}

.full-preview-trigger {
  display: none;
  min-width: 44px;
  min-height: 44px;
  align-items: center;
  justify-content: center;
}

.full-preview-trigger:focus-visible,
.full-preview-close:focus-visible {
  outline: 3px solid hsl(var(--p));
  outline-offset: 3px;
}

.full-preview-shell.is-expanded {
  position: fixed;
  inset: 0;
  z-index: 1000;
  box-sizing: border-box;
  overflow: auto;
  padding: max(1rem, env(safe-area-inset-top))
    max(1rem, env(safe-area-inset-right)) max(1rem, env(safe-area-inset-bottom))
    max(1rem, env(safe-area-inset-left));
  background: hsl(var(--n));
}

.full-preview-overlay {
  display: grid;
  min-width: 0;
  min-height: 100%;
  place-items: center;
}

.full-preview-panel {
  box-sizing: border-box;
  width: min(100%, 60rem);
  max-width: 100%;
  min-width: 0;
  overflow: auto;
  padding: 1rem;
  border-radius: 1rem;
}

.full-preview-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.full-preview-title {
  margin: 0;
  font-size: 1.25rem;
  line-height: 1.35;
}

.full-preview-close {
  min-width: 44px;
  min-height: 44px;
  flex: 0 0 auto;
}

.full-preview-content {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  margin-top: 1rem;
  overflow-x: auto;
}

@media (max-width: 64rem) {
  .full-preview-trigger {
    display: inline-flex;
  }
}
</style>
