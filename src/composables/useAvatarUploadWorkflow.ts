import {
  computed,
  readonly,
  ref,
  type ComputedRef,
  type Ref,
  type ShallowRef,
} from "vue";
import { AvatarUploadError, loadAvatarFile } from "@/editor/avatarUpload";
import type {
  AvatarTransform,
  AvatarUploadErrorCode,
  CardTemplateDefinition,
} from "@/types/card";

export type AvatarUploadStatus =
  | { state: "idle" }
  | { state: "working" }
  | { state: "success"; message: string }
  | { state: "error"; code: AvatarUploadErrorCode; message: string };

export interface AvatarUploadEditor {
  template: Readonly<ShallowRef<CardTemplateDefinition>>;
  isBusy: Readonly<Ref<boolean>>;
  updateAvatar(value: AvatarTransform): void;
}

export interface UseAvatarUploadWorkflowReturn {
  status: Readonly<Ref<AvatarUploadStatus>>;
  message: ComputedRef<string>;
  working: ComputedRef<boolean>;
  upload(file: File): Promise<boolean>;
}

const SUCCESS_MESSAGE = "头像已更新。";
const UNKNOWN_ERROR_MESSAGE = "图片加载失败，请重新选择。";

function hasSameTemplate(
  first: CardTemplateDefinition,
  second: CardTemplateDefinition,
): boolean {
  return first === second && first.id === second.id;
}

export function useAvatarUploadWorkflow(
  editor: AvatarUploadEditor,
  loader: typeof loadAvatarFile = loadAvatarFile,
): UseAvatarUploadWorkflowReturn {
  const status = ref<AvatarUploadStatus>({ state: "idle" });
  const latestToken = ref(0);

  const message = computed(() => {
    const current = status.value;
    return current.state === "success" || current.state === "error"
      ? current.message
      : "";
  });
  const working = computed(() => status.value.state === "working");

  const upload = async (file: File): Promise<boolean> => {
    if (editor.isBusy.value) {
      return false;
    }

    const token = latestToken.value + 1;
    latestToken.value = token;
    const template = editor.template.value;
    status.value = { state: "working" };

    let result: AvatarTransform;
    try {
      result = await loader(file, template.avatarFrame);
    } catch (error) {
      if (token !== latestToken.value) {
        return false;
      }
      if (!hasSameTemplate(editor.template.value, template)) {
        status.value = { state: "idle" };
        return false;
      }

      if (error instanceof AvatarUploadError) {
        status.value = {
          state: "error",
          code: error.code,
          message: error.message,
        };
      } else {
        status.value = {
          state: "error",
          code: "load-failed",
          message: UNKNOWN_ERROR_MESSAGE,
        };
      }
      return false;
    }

    if (token !== latestToken.value) {
      return false;
    }
    if (!hasSameTemplate(editor.template.value, template)) {
      status.value = { state: "idle" };
      return false;
    }

    editor.updateAvatar({ ...result });
    status.value = { state: "success", message: SUCCESS_MESSAGE };
    return true;
  };

  return {
    status: readonly(status) as unknown as Readonly<Ref<AvatarUploadStatus>>,
    message,
    working,
    upload,
  };
}
