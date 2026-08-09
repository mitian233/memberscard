import { describe, expect, it, vi } from "vitest";
import { ref, shallowRef, type Ref, type ShallowRef } from "vue";
import { AvatarUploadError } from "@/editor/avatarUpload";
import type {
  AvatarFrameDefinition,
  AvatarTransform,
  CardTemplateDefinition,
} from "@/types/card";
import type { AvatarUploadEditor } from "@/composables/useAvatarUploadWorkflow";
import { useAvatarUploadWorkflow } from "@/composables/useAvatarUploadWorkflow";

function createFrame(): AvatarFrameDefinition {
  return { left: 10, top: 20, width: 120, height: 120, radius: 60 };
}

function createTemplate(
  id: "current" | "legacy" = "current",
): CardTemplateDefinition {
  const frame = createFrame();
  return {
    id,
    canvas: { width: 800, height: 500, radius: 24 },
    assets: { background: "background", logo: "logo" },
    defaults: {
      name: "",
      nameEn: "",
      bandName: "",
      avatar: { src: "", left: frame.left, top: frame.top, scale: 1 },
    },
    avatarFrame: frame,
    fields: {},
    staticObjects: [],
  };
}

function createEditor(template = createTemplate()) {
  const templateRef = shallowRef(template);
  const busyRef = ref(false);
  const updates: AvatarTransform[] = [];
  const editor: AvatarUploadEditor = {
    template: templateRef as unknown as Readonly<
      ShallowRef<CardTemplateDefinition>
    >,
    isBusy: busyRef as Readonly<Ref<boolean>>,
    updateAvatar: vi.fn((value: AvatarTransform) => {
      updates.push(value);
    }),
  };
  return { editor, templateRef, busyRef, updates };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function createFile(name = "avatar.png"): File {
  return new File(["avatar"], name, { type: "image/png" });
}

const transform: AvatarTransform = {
  src: "data:image/png;base64,abc",
  left: 12,
  top: 34,
  scale: 1.2,
};

describe("useAvatarUploadWorkflow", () => {
  it("starts idle, derives working/message, and skips a busy editor", async () => {
    const { editor, busyRef } = createEditor();
    const loader = vi.fn(async () => transform);
    const workflow = useAvatarUploadWorkflow(editor, loader);

    expect(workflow.status.value).toEqual({ state: "idle" });
    expect(workflow.message.value).toBe("");
    expect(workflow.working.value).toBe(false);

    busyRef.value = true;
    await expect(workflow.upload(createFile())).resolves.toBe(false);
    expect(loader).not.toHaveBeenCalled();
    expect(workflow.status.value).toEqual({ state: "idle" });
  });

  it("uses the exact file/frame, waits for resolution, and clones a successful result", async () => {
    const template = createTemplate();
    const { editor, updates } = createEditor(template);
    const pending = deferred<AvatarTransform>();
    const uploadFile = createFile();
    const loader = vi.fn((file: File, frame: AvatarFrameDefinition) => {
      expect(file).toBe(uploadFile);
      expect(frame).toBe(template.avatarFrame);
      return pending.promise;
    });
    const workflow = useAvatarUploadWorkflow(editor, loader);

    const operation = workflow.upload(uploadFile);
    expect(workflow.status.value).toEqual({ state: "working" });
    expect(workflow.working.value).toBe(true);
    expect(updates).toHaveLength(0);

    const result = { ...transform };
    pending.resolve(result);
    await expect(operation).resolves.toBe(true);
    expect(updates).toHaveLength(1);
    expect(updates[0]).toEqual(transform);
    expect(updates[0]).not.toBe(result);
    result.left = 999;
    expect(updates[0].left).toBe(transform.left);
    expect(workflow.status.value).toEqual({
      state: "success",
      message: "头像已更新。",
    });
    expect(workflow.message.value).toBe("头像已更新。");
    expect(workflow.working.value).toBe(false);
  });

  it("maps typed and unknown failures without updating the editor", async () => {
    const { editor, updates } = createEditor();
    const typed = new AvatarUploadError(
      "unsupported-type",
      "请选择 JPG、PNG 或 WebP 图片。",
    );
    const typedLoader = vi.fn(async () => {
      throw typed;
    });
    const typedWorkflow = useAvatarUploadWorkflow(editor, typedLoader);
    await expect(typedWorkflow.upload(createFile())).resolves.toBe(false);
    expect(typedWorkflow.status.value).toEqual({
      state: "error",
      code: "unsupported-type",
      message: typed.message,
    });
    expect(updates).toHaveLength(0);

    const unknownLoader = vi.fn(async () => {
      throw new Error("secret details");
    });
    const unknownWorkflow = useAvatarUploadWorkflow(editor, unknownLoader);
    await expect(
      unknownWorkflow.upload(createFile("second.png")),
    ).resolves.toBe(false);
    expect(unknownWorkflow.status.value).toEqual({
      state: "error",
      code: "load-failed",
      message: "图片加载失败，请重新选择。",
    });
    expect(updates).toHaveLength(0);
  });

  it("supersedes uploads regardless of completion order", async () => {
    for (const secondCompletesFirst of [true, false]) {
      const { editor, updates } = createEditor();
      const first = deferred<AvatarTransform>();
      const second = deferred<AvatarTransform>();
      const loader = vi.fn((file: File) =>
        file.name === "first.png" ? first.promise : second.promise,
      );
      const workflow = useAvatarUploadWorkflow(editor, loader);
      const firstOperation = workflow.upload(createFile("first.png"));
      const secondOperation = workflow.upload(createFile("second.png"));
      const firstResult = { ...transform, left: 1 };
      const secondResult = { ...transform, left: 2 };

      if (secondCompletesFirst) {
        second.resolve(secondResult);
        await expect(secondOperation).resolves.toBe(true);
        first.resolve(firstResult);
      } else {
        first.resolve(firstResult);
        await expect(firstOperation).resolves.toBe(false);
        second.resolve(secondResult);
      }
      await expect(firstOperation).resolves.toBe(false);
      await expect(secondOperation).resolves.toBe(true);
      expect(updates).toEqual([{ ...secondResult }]);
      expect(workflow.status.value).toEqual({
        state: "success",
        message: "头像已更新。",
      });
    }
  });

  it("restores idle when the current upload completes after a template change", async () => {
    const template = createTemplate();
    const { editor, templateRef, updates } = createEditor(template);
    const pending = deferred<AvatarTransform>();
    const workflow = useAvatarUploadWorkflow(
      editor,
      vi.fn(() => pending.promise),
    );
    const operation = workflow.upload(createFile());

    templateRef.value = createTemplate("current");
    pending.resolve(transform);
    await expect(operation).resolves.toBe(false);
    expect(updates).toHaveLength(0);
    expect(workflow.status.value).toEqual({ state: "idle" });
  });

  it("does not mutate frozen inputs/results and exposes readonly status", async () => {
    const template = createTemplate();
    Object.freeze(template.avatarFrame);
    Object.freeze(template);
    const result = Object.freeze({ ...transform });
    const { editor, updates } = createEditor(template);
    const file = createFile();
    Object.freeze(file);
    const loader = vi.fn(
      async (receivedFile: File, frame: AvatarFrameDefinition) => {
        expect(receivedFile).toBe(file);
        expect(frame).toBe(template.avatarFrame);
        return result;
      },
    );
    const workflow = useAvatarUploadWorkflow(editor, loader);

    await expect(workflow.upload(file)).resolves.toBe(true);
    expect(updates[0]).toEqual(result);
    Reflect.set(workflow.status, "value", { state: "idle" });
    expect(workflow.status.value).toEqual({
      state: "success",
      message: "头像已更新。",
    });
  });
});
