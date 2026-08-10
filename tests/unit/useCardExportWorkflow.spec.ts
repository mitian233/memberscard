import { describe, expect, it, vi } from "vitest";
import { ref, shallowRef, type Ref, type ShallowRef } from "vue";
import { CardDownloadError } from "@/editor/download";
import type {
  CardDocument,
  CardTemplateDefinition,
  EditorAction,
  EditorStatus,
} from "@/types/card";
import type {
  CardExportEditor,
  CardExportServices,
} from "@/composables/useCardExportWorkflow";
import { useCardExportWorkflow } from "@/composables/useCardExportWorkflow";

function createTemplate(
  id: "current" | "legacy" = "current",
): CardTemplateDefinition {
  return {
    id,
    canvas: { width: 800, height: 500, radius: 24 },
    assets: { background: "background", logo: "logo" },
    defaults: {
      name: "",
      nameEn: "",
      bandName: "",
      avatar: { src: "", left: 10, top: 10, scale: 1 },
    },
    avatarFrame: { left: 10, top: 10, width: 120, height: 120, radius: 60 },
    fields: {},
    staticObjects: [],
  };
}

function createDocument(template: CardTemplateDefinition): CardDocument {
  return {
    templateId: template.id,
    name: "Member",
    nameEn: "Member",
    bandName: "Band",
    avatar: { ...template.defaults.avatar },
  };
}

function createEditor(template = createTemplate()) {
  const document = createDocument(template);
  const documentRef = shallowRef(document);
  const templateRef = shallowRef(template);
  const statusRef = shallowRef<EditorStatus>({ state: "idle" });
  const busyRef = ref(false);
  const canExportRef = ref(true);
  const canCopyRef = ref(true);
  const beginAllowed = ref(true);
  const updates: { type: string; args: unknown[] }[] = [];

  const editor: CardExportEditor = {
    document: documentRef as unknown as Readonly<ShallowRef<CardDocument>>,
    template: templateRef as unknown as Readonly<
      ShallowRef<CardTemplateDefinition>
    >,
    status: statusRef as unknown as Readonly<Ref<EditorStatus>>,
    isBusy: busyRef as Readonly<Ref<boolean>>,
    canExport: canExportRef as Readonly<Ref<boolean>>,
    canCopy: canCopyRef as Readonly<Ref<boolean>>,
    beginAction: vi.fn((action: EditorAction) => {
      if (!beginAllowed.value) return false;
      statusRef.value = { state: "working", action };
      updates.push({ type: "begin", args: [action] });
      return true;
    }),
    finishAction: vi.fn((action: EditorAction, message: string) => {
      if (
        statusRef.value.state !== "working" ||
        statusRef.value.action !== action
      ) {
        return false;
      }
      statusRef.value = { state: "success", action, message };
      updates.push({ type: "finish", args: [action, message] });
      return true;
    }),
    failAction: vi.fn((action, code, message) => {
      if (
        statusRef.value.state !== "working" ||
        statusRef.value.action !== action
      ) {
        return false;
      }
      statusRef.value = { state: "error", action, code, message };
      updates.push({ type: "fail", args: [action, code, message] });
      return true;
    }),
    setClipboardAvailable: vi.fn((available: boolean) => {
      updates.push({ type: "clipboard", args: [available] });
    }),
  };
  return {
    editor,
    document,
    template,
    statusRef,
    busyRef,
    canExportRef,
    canCopyRef,
    beginAllowed,
    updates,
  };
}

function createServices(): CardExportServices {
  return {
    isPngClipboardAvailable: vi.fn(() => true),
    exportCardPng: vi.fn(async () => new Blob(["png"], { type: "image/png" })),
    copyCardPng: vi.fn(async () => "copied" as const),
    downloadCardPng: vi.fn(),
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function replaceAction(
  statusRef: Ref<EditorStatus>,
  action: EditorAction,
): void {
  statusRef.value = { state: "working", action };
}

describe("useCardExportWorkflow", () => {
  it("checks capability once and derives reason/busy/capabilities", () => {
    for (const [available, reason] of [
      [true, ""],
      [false, "当前浏览器不支持复制图片，请使用“保存 PNG”。"],
    ] as const) {
      const fake = createEditor();
      const services = createServices();
      services.isPngClipboardAvailable = vi.fn(() => available);
      const workflow = useCardExportWorkflow(fake.editor, { services });
      expect(services.isPngClipboardAvailable).toHaveBeenCalledTimes(1);
      expect(fake.editor.setClipboardAvailable).toHaveBeenCalledWith(available);
      expect(workflow.copyUnavailableReason.value).toBe(reason);
      expect(workflow.busy.value).toBe(false);
      expect(workflow.canExport.value).toBe(true);
      expect(workflow.canCopy.value).toBe(true);
      fake.busyRef.value = true;
      fake.canExportRef.value = false;
      fake.canCopyRef.value = false;
      expect(workflow.busy.value).toBe(true);
      expect(workflow.canExport.value).toBe(false);
      expect(workflow.canCopy.value).toBe(false);
    }

    const throwing = createEditor();
    const services = createServices();
    services.isPngClipboardAvailable = vi.fn(() => {
      throw new Error("capability");
    });
    const workflow = useCardExportWorkflow(throwing.editor, { services });
    expect(workflow.copyUnavailableReason.value).toBe(
      "当前浏览器不支持复制图片，请使用“保存 PNG”。",
    );
    expect(throwing.editor.setClipboardAvailable).toHaveBeenCalledWith(false);
  });

  it("makes busy and beginAction-false calls no-ops", async () => {
    const fake = createEditor();
    const services = createServices();
    const workflow = useCardExportWorkflow(fake.editor, { services });
    fake.busyRef.value = true;
    await expect(workflow.copyPng()).resolves.toBe(false);
    await expect(workflow.savePng()).resolves.toBe(false);
    fake.busyRef.value = false;
    fake.beginAllowed.value = false;
    await expect(workflow.copyPng()).resolves.toBe(false);
    await expect(workflow.savePng()).resolves.toBe(false);
    expect(services.exportCardPng).not.toHaveBeenCalled();
    expect(services.copyCardPng).not.toHaveBeenCalled();
    expect(services.downloadCardPng).not.toHaveBeenCalled();
  });

  it("handles copied, unsupported, denied, and thrown copy paths", async () => {
    const cases = [
      {
        result: "copied" as const,
        reason: "",
        finish: ["copy", "图片已复制。"],
      },
      {
        result: "unsupported" as const,
        reason: "当前浏览器不支持复制图片，请使用“保存 PNG”。",
        fail: [
          "copy",
          "clipboard-unsupported",
          "当前浏览器不支持复制图片，请使用“保存 PNG”。",
        ],
      },
      {
        result: "denied" as const,
        reason: "无法复制图片，请使用“保存 PNG”。",
        fail: ["copy", "clipboard-denied", "无法复制图片，请使用“保存 PNG”。"],
      },
    ];
    for (const testCase of cases) {
      const fake = createEditor();
      const services = createServices();
      services.copyCardPng = vi.fn(async () => testCase.result);
      const workflow = useCardExportWorkflow(fake.editor, { services });
      await expect(workflow.copyPng()).resolves.toBe(
        testCase.result === "copied",
      );
      expect(workflow.copyUnavailableReason.value).toBe(testCase.reason);
      if (testCase.finish) {
        expect(fake.editor.finishAction).toHaveBeenCalledWith(
          ...testCase.finish,
        );
      } else {
        expect(fake.editor.failAction).toHaveBeenCalledWith(...testCase.fail!);
      }
    }

    for (const stage of ["export", "copy"] as const) {
      const fake = createEditor();
      const services = createServices();
      if (stage === "export") {
        services.exportCardPng = vi.fn(async () => {
          throw new Error("render details");
        });
      } else {
        services.copyCardPng = vi.fn(async () => {
          throw new Error("copy details");
        });
      }
      const workflow = useCardExportWorkflow(fake.editor, { services });
      await expect(workflow.copyPng()).resolves.toBe(false);
      expect(fake.editor.failAction).toHaveBeenCalledWith(
        "copy",
        "clipboard-failed",
        "复制失败，请使用“保存 PNG”。",
      );
      expect(workflow.copyUnavailableReason.value).toBe(
        "复制失败，请使用“保存 PNG”。",
      );
    }
  });

  it("stops deferred copy side effects when its action is replaced", async () => {
    const fake = createEditor();
    const services = createServices();
    const pendingExport = deferred<Blob>();
    services.exportCardPng = vi.fn(() => pendingExport.promise);
    const workflow = useCardExportWorkflow(fake.editor, { services });
    const operation = workflow.copyPng();
    replaceAction(fake.statusRef, "export");
    pendingExport.resolve(new Blob(["png"], { type: "image/png" }));
    await expect(operation).resolves.toBe(false);
    expect(services.copyCardPng).not.toHaveBeenCalled();

    const fake2 = createEditor();
    const services2 = createServices();
    const pendingCopy = deferred<"copied" | "unsupported" | "denied">();
    services2.copyCardPng = vi.fn(() => pendingCopy.promise);
    const workflow2 = useCardExportWorkflow(fake2.editor, {
      services: services2,
    });
    const operation2 = workflow2.copyPng();
    replaceAction(fake2.statusRef, "export");
    pendingCopy.resolve("copied");
    await expect(operation2).resolves.toBe(false);
    expect(fake2.editor.finishAction).not.toHaveBeenCalled();
    expect(workflow2.copyUnavailableReason.value).toBe("");
  });

  it("requires the exact owner status object for copy/save continuation", async () => {
    const copyAfterExport = createEditor();
    const copyExportServices = createServices();
    const copyExport = deferred<Blob>();
    copyExportServices.exportCardPng = vi.fn(() => copyExport.promise);
    const copyWorkflow = useCardExportWorkflow(copyAfterExport.editor, {
      services: copyExportServices,
    });
    const copyOperation = copyWorkflow.copyPng();
    copyExport.resolve(new Blob(["png"], { type: "image/png" }));
    replaceAction(copyAfterExport.statusRef, "copy");
    await expect(copyOperation).resolves.toBe(false);
    expect(copyExportServices.copyCardPng).not.toHaveBeenCalled();

    const copyAfterClipboard = createEditor();
    const copyClipboardServices = createServices();
    const copyResult = deferred<"copied" | "unsupported" | "denied">();
    copyClipboardServices.copyCardPng = vi.fn(() => copyResult.promise);
    const copyClipboardWorkflow = useCardExportWorkflow(
      copyAfterClipboard.editor,
      { services: copyClipboardServices },
    );
    const copyClipboardOperation = copyClipboardWorkflow.copyPng();
    copyResult.resolve("copied");
    replaceAction(copyAfterClipboard.statusRef, "copy");
    await expect(copyClipboardOperation).resolves.toBe(false);
    expect(copyAfterClipboard.editor.finishAction).not.toHaveBeenCalled();

    const saveAfterExport = createEditor();
    const saveExportServices = createServices();
    const saveExport = deferred<Blob>();
    saveExportServices.exportCardPng = vi.fn(() => saveExport.promise);
    const filename = vi.fn(() => "same-action.png");
    const saveWorkflow = useCardExportWorkflow(saveAfterExport.editor, {
      services: saveExportServices,
      filename,
    });
    const saveOperation = saveWorkflow.savePng();
    saveExport.resolve(new Blob(["png"], { type: "image/png" }));
    replaceAction(saveAfterExport.statusRef, "export");
    await expect(saveOperation).resolves.toBe(false);
    expect(filename).not.toHaveBeenCalled();
    expect(saveExportServices.downloadCardPng).not.toHaveBeenCalled();

    const saveDuringFilename = createEditor();
    const saveDuringFilenameServices = createServices();
    const saveDuringFilenameWorkflow = useCardExportWorkflow(
      saveDuringFilename.editor,
      {
        services: saveDuringFilenameServices,
        filename: () => {
          replaceAction(saveDuringFilename.statusRef, "export");
          return "replaced.png";
        },
      },
    );
    await expect(saveDuringFilenameWorkflow.savePng()).resolves.toBe(false);
    expect(saveDuringFilenameServices.downloadCardPng).not.toHaveBeenCalled();
    expect(saveDuringFilename.editor.finishAction).not.toHaveBeenCalled();
  });

  it("forwards fresh default and partial service wrappers without import-time globals", async () => {
    vi.resetModules();
    const blob = new Blob(["png"], { type: "image/png" });
    const capability = vi.fn(() => true);
    const exported = vi.fn(async () => blob);
    const copied = vi.fn(async () => "copied" as const);
    const downloaded = vi.fn();
    class MockCardDownloadError extends Error {}
    vi.doMock("@/editor/clipboard", () => ({
      isPngClipboardAvailable: capability,
      copyCardPng: copied,
    }));
    vi.doMock("@/fabric/exportCard", () => ({
      exportCardPng: exported,
    }));
    vi.doMock("@/editor/download", () => ({
      CardDownloadError: MockCardDownloadError,
      downloadCardPng: downloaded,
    }));
    const documentDescriptor = Object.getOwnPropertyDescriptor(
      globalThis,
      "document",
    );
    const urlDescriptor = Object.getOwnPropertyDescriptor(globalThis, "URL");
    const originalURL = globalThis.URL;
    let globalReads = 0;
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      get() {
        globalReads += 1;
        throw new Error("document read during import");
      },
    });
    Object.defineProperty(globalThis, "URL", {
      configurable: true,
      get() {
        const stack = new Error().stack ?? "";
        if (/src[\\/]composables[\\/]/i.test(stack)) {
          globalReads += 1;
          throw new Error("URL read during import");
        }
        return originalURL;
      },
    });

    try {
      const freshModule = await import("@/composables/useCardExportWorkflow");
      const fake = createEditor();
      const workflow = freshModule.useCardExportWorkflow(fake.editor);
      expect(capability).toHaveBeenCalledTimes(1);
      await expect(workflow.copyPng()).resolves.toBe(true);
      await expect(workflow.savePng()).resolves.toBe(true);
      expect(exported).toHaveBeenCalledWith(fake.document, fake.template);
      expect(copied).toHaveBeenCalledWith(blob);
      expect(downloaded).toHaveBeenCalledWith(blob, "members-card-current.png");

      const partialExport = vi.fn(async () => blob);
      const partialFake = createEditor();
      const partialWorkflow = freshModule.useCardExportWorkflow(
        partialFake.editor,
        {
          services: { exportCardPng: partialExport },
        },
      );
      await expect(partialWorkflow.savePng()).resolves.toBe(true);
      expect(partialExport).toHaveBeenCalledWith(
        partialFake.document,
        partialFake.template,
      );
      expect(globalReads).toBe(0);
    } finally {
      if (documentDescriptor === undefined) {
        Reflect.deleteProperty(globalThis, "document");
      } else {
        Object.defineProperty(globalThis, "document", documentDescriptor);
      }
      if (urlDescriptor === undefined) {
        Reflect.deleteProperty(globalThis, "URL");
      } else {
        Object.defineProperty(globalThis, "URL", urlDescriptor);
      }
      vi.doUnmock("@/editor/clipboard");
      vi.doUnmock("@/fabric/exportCard");
      vi.doUnmock("@/editor/download");
      vi.resetModules();
    }
  });

  it("saves with exact snapshots and default or injected filenames", async () => {
    for (const filename of [undefined, vi.fn(() => "custom.png")]) {
      const fake = createEditor();
      const services = createServices();
      const blob = new Blob(["png"], { type: "image/png" });
      services.exportCardPng = vi.fn(async (document, template) => {
        expect(document).toBe(fake.document);
        expect(template).toBe(fake.template);
        return blob;
      });
      const workflow = useCardExportWorkflow(fake.editor, {
        services,
        ...(filename === undefined ? {} : { filename }),
      });
      await expect(workflow.savePng()).resolves.toBe(true);
      expect(services.downloadCardPng).toHaveBeenCalledWith(
        blob,
        filename === undefined ? "members-card-current.png" : "custom.png",
      );
    }
  });

  it("classifies export versus filename/download failures", async () => {
    const exportFailure = createEditor();
    const exportServices = createServices();
    exportServices.exportCardPng = vi.fn(async () => {
      throw new Error("render details");
    });
    const exportWorkflow = useCardExportWorkflow(exportFailure.editor, {
      services: exportServices,
    });
    await expect(exportWorkflow.savePng()).resolves.toBe(false);
    expect(exportFailure.editor.failAction).toHaveBeenCalledWith(
      "export",
      "render-failed",
      "图片导出失败，请重试。",
    );

    const filenameFailure = createEditor();
    const filenameServices = createServices();
    const filenameWorkflow = useCardExportWorkflow(filenameFailure.editor, {
      services: filenameServices,
      filename: () => {
        throw new Error("filename details");
      },
    });
    await expect(filenameWorkflow.savePng()).resolves.toBe(false);
    expect(filenameFailure.editor.failAction).toHaveBeenCalledWith(
      "export",
      "download-failed",
      "图片下载失败，请重试。",
    );

    const typedFailure = createEditor();
    const typedServices = createServices();
    typedServices.downloadCardPng = vi.fn(() => {
      throw new CardDownloadError("safe download message");
    });
    const typedWorkflow = useCardExportWorkflow(typedFailure.editor, {
      services: typedServices,
    });
    await expect(typedWorkflow.savePng()).resolves.toBe(false);
    expect(typedFailure.editor.failAction).toHaveBeenCalledWith(
      "export",
      "download-failed",
      "safe download message",
    );
  });

  it("stops deferred save before filename/download when action is replaced", async () => {
    const fake = createEditor();
    const services = createServices();
    const pending = deferred<Blob>();
    services.exportCardPng = vi.fn(() => pending.promise);
    const filename = vi.fn(() => "custom.png");
    const workflow = useCardExportWorkflow(fake.editor, { services, filename });
    const operation = workflow.savePng();
    replaceAction(fake.statusRef, "copy");
    pending.resolve(new Blob(["png"], { type: "image/png" }));
    await expect(operation).resolves.toBe(false);
    expect(filename).not.toHaveBeenCalled();
    expect(services.downloadCardPng).not.toHaveBeenCalled();
  });

  it("requires successful finish transitions and preserves frozen inputs/options", async () => {
    const fake = createEditor();
    Object.freeze(fake.editor);
    Object.freeze(fake.document);
    Object.freeze(fake.template);
    const services = Object.freeze(createServices());
    const options = Object.freeze({ services });
    const workflow = useCardExportWorkflow(fake.editor, options);
    vi.mocked(fake.editor.finishAction).mockReturnValue(false);
    await expect(workflow.copyPng()).resolves.toBe(false);
    expect(workflow.copyUnavailableReason.value).toBe("");
    Reflect.set(workflow.copyUnavailableReason, "value", "mutated");
    expect(workflow.copyUnavailableReason.value).toBe("");

    vi.mocked(fake.editor.finishAction).mockReturnValue(false);
    await expect(workflow.savePng()).resolves.toBe(false);
    expect(services.downloadCardPng).toHaveBeenCalledTimes(1);
    expect(Object.keys(options)).toEqual(["services"]);
    expect(Object.keys(services)).toEqual([
      "isPngClipboardAvailable",
      "exportCardPng",
      "copyCardPng",
      "downloadCardPng",
    ]);
  });
});
