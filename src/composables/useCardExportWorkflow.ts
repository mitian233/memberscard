import { computed, readonly, ref, type ComputedRef, type Ref } from "vue";
import { copyCardPng, isPngClipboardAvailable } from "@/editor/clipboard";
import { downloadCardPng, CardDownloadError } from "@/editor/download";
import { exportCardPng } from "@/fabric/exportCard";
import type {
  CardDocument,
  CardTemplateDefinition,
  EditorAction,
  EditorStatus,
  ExportErrorCode,
} from "@/types/card";
import type { ShallowRef } from "vue";

export interface CardExportEditor {
  document: Readonly<ShallowRef<CardDocument>>;
  template: Readonly<ShallowRef<CardTemplateDefinition>>;
  status: Readonly<Ref<EditorStatus>>;
  isBusy: Readonly<Ref<boolean>>;
  canExport: Readonly<Ref<boolean>>;
  canCopy: Readonly<Ref<boolean>>;
  beginAction(action: EditorAction): boolean;
  finishAction(action: EditorAction, message: string): boolean;
  failAction(
    action: EditorAction,
    code: ExportErrorCode,
    message: string,
  ): boolean;
  setClipboardAvailable(available: boolean): void;
}

export interface CardExportServices {
  isPngClipboardAvailable(): boolean;
  exportCardPng(
    document: CardDocument,
    template: CardTemplateDefinition,
  ): Promise<Blob>;
  copyCardPng(blob: Blob): Promise<"copied" | "unsupported" | "denied">;
  downloadCardPng(blob: Blob, filename: string): void;
}

export interface UseCardExportWorkflowOptions {
  services?: Partial<CardExportServices>;
  filename?: (template: CardTemplateDefinition) => string;
}

export interface UseCardExportWorkflowReturn {
  copyUnavailableReason: Readonly<Ref<string>>;
  busy: ComputedRef<boolean>;
  canExport: ComputedRef<boolean>;
  canCopy: ComputedRef<boolean>;
  copyPng(): Promise<boolean>;
  savePng(): Promise<boolean>;
}

const CLIPBOARD_UNAVAILABLE = "当前浏览器不支持复制图片，请使用“保存 PNG”。";
const CLIPBOARD_DENIED = "无法复制图片，请使用“保存 PNG”。";
const CLIPBOARD_FAILED = "复制失败，请使用“保存 PNG”。";
const RENDER_FAILED = "图片导出失败，请重试。";
const DOWNLOAD_FAILED = "图片下载失败，请重试。";

function isOwnerAction(
  editor: CardExportEditor,
  action: EditorAction,
  ownerStatus: EditorStatus,
): boolean {
  const status = editor.status.value;
  return (
    status === ownerStatus &&
    status.state === "working" &&
    status.action === action
  );
}

function createServices(
  overrides: Partial<CardExportServices> | undefined,
): CardExportServices {
  return {
    isPngClipboardAvailable:
      overrides?.isPngClipboardAvailable ?? (() => isPngClipboardAvailable()),
    exportCardPng:
      overrides?.exportCardPng ??
      ((document, template) => exportCardPng(document, template)),
    copyCardPng: overrides?.copyCardPng ?? ((blob) => copyCardPng(blob)),
    downloadCardPng:
      overrides?.downloadCardPng ??
      ((blob, filename) => downloadCardPng(blob, filename)),
  };
}

export function useCardExportWorkflow(
  editor: CardExportEditor,
  options?: UseCardExportWorkflowOptions,
): UseCardExportWorkflowReturn {
  const services = createServices(options?.services);
  const unavailableReason = ref("");
  let clipboardAvailable: boolean;
  try {
    clipboardAvailable = services.isPngClipboardAvailable();
  } catch {
    clipboardAvailable = false;
  }
  editor.setClipboardAvailable(clipboardAvailable);
  unavailableReason.value = clipboardAvailable ? "" : CLIPBOARD_UNAVAILABLE;

  const busy = computed(() => editor.isBusy.value);
  const canExport = computed(() => editor.canExport.value);
  const canCopy = computed(() => editor.canCopy.value);

  const failCopy = (
    ownerStatus: EditorStatus,
    code: ExportErrorCode,
    message: string,
  ): boolean => {
    if (!isOwnerAction(editor, "copy", ownerStatus)) {
      return false;
    }
    const transitioned = editor.failAction("copy", code, message);
    if (transitioned) {
      unavailableReason.value = message;
    }
    return false;
  };

  const copyPng = async (): Promise<boolean> => {
    if (busy.value || !editor.beginAction("copy")) {
      return false;
    }

    const ownerStatus = editor.status.value;
    const document = editor.document.value;
    const template = editor.template.value;
    let blob: Blob;
    try {
      blob = await services.exportCardPng(document, template);
    } catch {
      return failCopy(ownerStatus, "clipboard-failed", CLIPBOARD_FAILED);
    }
    if (!isOwnerAction(editor, "copy", ownerStatus)) {
      return false;
    }

    let result: "copied" | "unsupported" | "denied";
    try {
      result = await services.copyCardPng(blob);
    } catch {
      return failCopy(ownerStatus, "clipboard-failed", CLIPBOARD_FAILED);
    }
    if (!isOwnerAction(editor, "copy", ownerStatus)) {
      return false;
    }

    if (result === "copied") {
      if (
        !isOwnerAction(editor, "copy", ownerStatus) ||
        !editor.finishAction("copy", "图片已复制。")
      ) {
        return false;
      }
      unavailableReason.value = "";
      return true;
    }
    if (result === "unsupported") {
      editor.setClipboardAvailable(false);
      return failCopy(
        ownerStatus,
        "clipboard-unsupported",
        CLIPBOARD_UNAVAILABLE,
      );
    }
    return failCopy(ownerStatus, "clipboard-denied", CLIPBOARD_DENIED);
  };

  const savePng = async (): Promise<boolean> => {
    if (busy.value || !editor.beginAction("export")) {
      return false;
    }

    const ownerStatus = editor.status.value;
    const document = editor.document.value;
    const template = editor.template.value;
    let blob: Blob;
    try {
      blob = await services.exportCardPng(document, template);
    } catch {
      if (isOwnerAction(editor, "export", ownerStatus)) {
        editor.failAction("export", "render-failed", RENDER_FAILED);
      }
      return false;
    }
    if (!isOwnerAction(editor, "export", ownerStatus)) {
      return false;
    }

    let filename: string;
    try {
      filename =
        options?.filename?.(template) ?? `members-card-${template.id}.png`;
    } catch (error) {
      if (isOwnerAction(editor, "export", ownerStatus)) {
        const message =
          error instanceof CardDownloadError && error.message.trim() !== ""
            ? error.message
            : DOWNLOAD_FAILED;
        editor.failAction("export", "download-failed", message);
      }
      return false;
    }

    if (!isOwnerAction(editor, "export", ownerStatus)) {
      return false;
    }

    try {
      services.downloadCardPng(blob, filename);
    } catch (error) {
      if (isOwnerAction(editor, "export", ownerStatus)) {
        const message =
          error instanceof CardDownloadError && error.message.trim() !== ""
            ? error.message
            : DOWNLOAD_FAILED;
        editor.failAction("export", "download-failed", message);
      }
      return false;
    }

    if (!isOwnerAction(editor, "export", ownerStatus)) {
      return false;
    }
    return editor.finishAction("export", "PNG 已保存。");
  };

  return {
    copyUnavailableReason: readonly(unavailableReason) as unknown as Readonly<
      Ref<string>
    >,
    busy,
    canExport,
    canCopy,
    copyPng,
    savePng,
  };
}
