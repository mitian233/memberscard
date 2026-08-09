import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { toRaw } from "vue";
import { currentCardTemplate } from "@/templates/currentCardTemplate";
import { legacyCardTemplate } from "@/templates/legacyCardTemplate";
import { createCardDocument } from "@/editor/cardDocument";
import type {
  CanvasSettledPayload,
  CanvasSyncRequest,
} from "@/composables/useCardEditor";
import type { CardCanvasController } from "@/fabric/cardCanvasController";
import type {
  CardDocument,
  CardField,
  CardPatch,
  CardTemplateDefinition,
  EditorSelection,
  FieldValidationError,
  ResourceStatus,
} from "@/types/card";
import type { InspectorGroup } from "@/components/editor/CardInspector.vue";
import CardEditorWorkspace from "@/components/editor/CardEditorWorkspace.vue";

const childStubs = vi.hoisted(() => ({
  toolbar: {
    name: "CardToolbarStub",
    props: {
      templateId: { type: String, required: true },
      dirty: { type: Boolean, required: true },
      busy: { type: Boolean, required: true },
    },
    emits: ["template-change", "reset-all"],
    template: '<header data-child="toolbar" />',
  },
  canvas: {
    name: "FabricCardCanvasStub",
    props: {
      document: { type: Object, required: true },
      template: { type: Object, required: true },
      syncRequest: { type: Object, required: true },
      controller: { type: Object, required: false },
      disabled: { type: Boolean, required: true },
      loading: { type: Boolean, required: true },
    },
    emits: [
      "ready",
      "resource-error",
      "change",
      "selection-change",
      "edit-cancel",
      "validation-error",
    ],
    template: '<section data-child="canvas" />',
  },
  inspector: {
    name: "CardInspectorStub",
    props: {
      document: { type: Object, required: true },
      template: { type: Object, required: true },
      activeGroup: { type: String, required: true },
      fieldErrors: { type: Object, required: true },
      disabled: { type: Boolean, required: true },
    },
    emits: [
      "update:activeGroup",
      "update-field",
      "update-avatar",
      "reset-field",
      "reset-avatar",
      "avatar-file",
    ],
    template: '<aside data-child="inspector" />',
  },
  exports: {
    name: "ExportActionsStub",
    props: {
      busy: { type: Boolean, required: true },
      isExporting: { type: Boolean, required: true },
      canExport: { type: Boolean, required: true },
      canCopy: { type: Boolean, required: true },
      statusMessage: { type: String, required: true },
      copyUnavailableReason: { type: String, required: false },
    },
    emits: ["copy", "export"],
    template: '<section data-child="exports" />',
  },
}));

vi.mock("@/components/editor/CardToolbar.vue", () => ({
  default: childStubs.toolbar,
}));
vi.mock("@/components/editor/FabricCardCanvas.vue", () => ({
  default: childStubs.canvas,
}));
vi.mock("@/components/editor/CardInspector.vue", () => ({
  default: childStubs.inspector,
}));
vi.mock("@/components/editor/ExportActions.vue", () => ({
  default: childStubs.exports,
}));

const source = readFileSync(
  resolve(process.cwd(), "src/components/editor/CardEditorWorkspace.vue"),
  "utf8",
);
const wrappers: VueWrapper[] = [];

function createRequest(
  cardDocument: CardDocument,
  template: CardTemplateDefinition,
  revision = 1,
): CanvasSyncRequest {
  return {
    revision,
    kind: "replace",
    source: "system",
    document: cardDocument,
    template,
  };
}

function mountWorkspace(
  overrides: Partial<{
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
  }> = {},
): VueWrapper {
  const template = overrides.template ?? currentCardTemplate;
  const cardDocument = overrides.document ?? createCardDocument(template);
  const syncRequest =
    overrides.syncRequest ?? createRequest(cardDocument, template, 1);
  const wrapper = mount(CardEditorWorkspace, {
    attachTo: document.body,
    props: {
      document: cardDocument,
      template,
      syncRequest,
      activeGroup: overrides.activeGroup ?? "basic",
      fieldErrors: overrides.fieldErrors ?? {},
      resourceStatus: overrides.resourceStatus ?? { state: "ready" },
      uploadMessage: overrides.uploadMessage ?? "",
      dirty: overrides.dirty ?? false,
      busy: overrides.busy ?? false,
      isExporting: overrides.isExporting ?? false,
      canExport: overrides.canExport ?? true,
      canCopy: overrides.canCopy ?? true,
      statusMessage: overrides.statusMessage ?? "",
      ...(overrides.copyUnavailableReason === undefined
        ? {}
        : { copyUnavailableReason: overrides.copyUnavailableReason }),
      canvasController: overrides.canvasController,
    },
  });
  wrappers.push(wrapper);
  return wrapper;
}

function child(wrapper: VueWrapper, name: keyof typeof childStubs): VueWrapper {
  return wrapper.findComponent({ name: childStubs[name].name });
}

afterEach(async () => {
  for (const wrapper of wrappers.splice(0)) {
    if (wrapper.exists()) await wrapper.unmount();
  }
});

describe("CardEditorWorkspace", () => {
  it("renders one labelled main in reading order with exact current/legacy props", () => {
    for (const template of [currentCardTemplate, legacyCardTemplate]) {
      const cardDocument = createCardDocument(template);
      const request = createRequest(cardDocument, template);
      const controller = {} as CardCanvasController;
      const wrapper = mountWorkspace({
        template,
        document: cardDocument,
        syncRequest: request,
        canvasController: controller,
        dirty: true,
      });
      const main = wrapper.get("main");
      expect(wrapper.findAll("main")).toHaveLength(1);
      expect(main.attributes("aria-label")).toBe("会员证编辑器");
      const order = [...main.element.children].map(
        (element) => element.tagName,
      );
      expect(order).toEqual(["DIV", "DIV"]);
      expect(main.get("[data-child=toolbar]").exists()).toBe(true);
      expect(main.get("[data-child=canvas]").exists()).toBe(true);
      expect(main.get("aside[aria-label='编辑控制']").exists()).toBe(true);
      expect(child(wrapper, "toolbar").props("templateId")).toBe(template.id);
      expect(child(wrapper, "toolbar").props("dirty")).toBe(true);
      expect(toRaw(child(wrapper, "canvas").props("document"))).toBe(
        cardDocument,
      );
      expect(toRaw(child(wrapper, "canvas").props("template"))).toBe(template);
      expect(toRaw(child(wrapper, "canvas").props("syncRequest"))).toBe(
        request,
      );
      expect(toRaw(child(wrapper, "canvas").props("controller"))).toBe(
        controller,
      );
      expect(toRaw(child(wrapper, "inspector").props("document"))).toBe(
        cardDocument,
      );
      expect(toRaw(child(wrapper, "inspector").props("template"))).toBe(
        template,
      );
      expect(child(wrapper, "exports").props("canExport")).toBe(true);
    }
  });

  it("forwards every toolbar, inspector, and export event with exact payloads", () => {
    const wrapper = mountWorkspace();
    const toolbar = child(wrapper, "toolbar");
    const inspector = child(wrapper, "inspector");
    const exports = child(wrapper, "exports");
    const avatar: CardPatch = {
      type: "avatar",
      value: { src: "avatar", left: 1, top: 2, scale: 0.5 },
    };
    const file = new File(["avatar"], "avatar.png", { type: "image/png" });

    toolbar.vm.$emit("template-change", "legacy");
    toolbar.vm.$emit("reset-all");
    inspector.vm.$emit("update:activeGroup", "avatar");
    inspector.vm.$emit("update-field", "name", "新名字");
    inspector.vm.$emit("update-avatar", avatar.value);
    inspector.vm.$emit("reset-field", "name");
    inspector.vm.$emit("reset-avatar");
    inspector.vm.$emit("avatar-file", file);
    exports.vm.$emit("copy");
    exports.vm.$emit("export");

    expect(wrapper.emitted("template-change")).toEqual([["legacy"]]);
    expect(wrapper.emitted("reset-all")).toEqual([[]]);
    expect(wrapper.emitted("update:activeGroup")).toEqual([["avatar"]]);
    expect(wrapper.emitted("update-field")).toEqual([["name", "新名字"]]);
    expect(wrapper.emitted("update-avatar")).toEqual([[avatar.value]]);
    expect(wrapper.emitted("reset-field")).toEqual([["name"]]);
    expect(wrapper.emitted("reset-avatar")).toEqual([[]]);
    expect(wrapper.emitted("avatar-file")).toEqual([[file]]);
    expect(wrapper.emitted("copy")).toEqual([[]]);
    expect(wrapper.emitted("export")).toEqual([[]]);
  });

  it("forwards every canvas event with exact payloads and source", () => {
    const wrapper = mountWorkspace();
    const canvas = child(wrapper, "canvas");
    const ready: CanvasSettledPayload = {
      revision: 1,
      resourceStatus: { state: "ready" },
      fieldErrors: [],
    };
    const resource: Extract<ResourceStatus, { state: "error" }> = {
      state: "error",
      code: "logo-load-failed",
      message: "logo failed",
      recoverable: true,
    };
    const patch: CardPatch = {
      type: "field",
      field: "name",
      value: "画布名字",
    };
    const selection: EditorSelection = { type: "avatar" };
    const error: FieldValidationError = {
      field: "name",
      code: "text-too-wide",
      message: "过长",
    };
    canvas.vm.$emit("ready", ready);
    canvas.vm.$emit("resource-error", { revision: 1, status: resource });
    canvas.vm.$emit("change", patch, "canvas");
    canvas.vm.$emit("selection-change", selection);
    canvas.vm.$emit("edit-cancel", "name", "恢复名");
    canvas.vm.$emit("validation-error", "name", error);

    expect(wrapper.emitted("canvas-ready")).toEqual([[ready]]);
    expect(wrapper.emitted("resource-error")).toEqual([
      [{ revision: 1, status: resource }],
    ]);
    expect(wrapper.emitted("canvas-change")).toEqual([[patch, "canvas"]]);
    expect(wrapper.emitted("selection-change")).toEqual([[selection]]);
    expect(wrapper.emitted("edit-cancel")).toEqual([["name", "恢复名"]]);
    expect(wrapper.emitted("validation-error")).toEqual([["name", error]]);
  });

  it("renders loading, ready, degraded, and error recovery status text", async () => {
    const cases: readonly {
      status: ResourceStatus;
      message: string;
      recovery?: string;
    }[] = [
      { status: { state: "loading" }, message: "正在加载画布资源…" },
      { status: { state: "ready" }, message: "预览已就绪。" },
      {
        status: {
          state: "degraded",
          code: "font-fallback",
          message: "字体降级",
        },
        message: "字体降级",
      },
      {
        status: {
          state: "error",
          code: "logo-load-failed",
          message: "Logo 失败",
          recoverable: true,
        },
        message: "Logo 失败",
        recovery: "请检查资源或重新上传头像后重试。",
      },
      {
        status: {
          state: "error",
          code: "background-load-failed",
          message: "背景失败",
          recoverable: false,
        },
        message: "背景失败",
        recovery: "请刷新页面后重试。",
      },
    ];
    for (const testCase of cases) {
      const wrapper = mountWorkspace({ resourceStatus: testCase.status });
      const resourceRegion = wrapper.get("[data-resource-status]");
      expect(resourceRegion.attributes("role")).toBe("status");
      expect(resourceRegion.attributes("aria-live")).toBe("polite");
      expect(resourceRegion.text()).toBe(testCase.message);
      if (testCase.recovery) {
        expect(wrapper.get("[data-resource-recovery]").text()).toBe(
          testCase.recovery,
        );
      } else {
        expect(wrapper.find("[data-resource-recovery]").exists()).toBe(false);
      }
      expect(child(wrapper, "canvas").props("loading")).toBe(
        testCase.status.state === "loading",
      );
      await wrapper.unmount();
    }
  });

  it("propagates upload status, disabled state, capabilities, and messages", () => {
    const wrapper = mountWorkspace({
      uploadMessage: "图片加载失败，请重新选择。",
      busy: true,
      isExporting: true,
      canExport: false,
      canCopy: false,
      statusMessage: "正在导出图片…",
      copyUnavailableReason: "请使用保存 PNG",
      resourceStatus: { state: "loading" },
    });
    const uploadRegion = wrapper.get("[data-upload-status]");
    expect(uploadRegion.attributes("role")).toBe("status");
    expect(uploadRegion.attributes("aria-live")).toBe("polite");
    expect(uploadRegion.attributes("aria-atomic")).toBe("true");
    expect(uploadRegion.text()).toBe("图片加载失败，请重新选择。");
    expect(child(wrapper, "toolbar").props("busy")).toBe(true);
    expect(child(wrapper, "inspector").props("disabled")).toBe(true);
    expect(child(wrapper, "canvas").props("disabled")).toBe(true);
    expect(child(wrapper, "canvas").props("loading")).toBe(true);
    expect(child(wrapper, "exports").props()).toMatchObject({
      busy: true,
      isExporting: true,
      canExport: false,
      canCopy: false,
      statusMessage: "正在导出图片…",
      copyUnavailableReason: "请使用保存 PNG",
    });
  });

  it("keeps the responsive workspace CSS contracts scoped and gradient-free", () => {
    const scopedStyle = source.match(
      /<style\s+scoped>([\s\S]*?)<\/style>/i,
    )?.[1];
    expect(scopedStyle).toBeTruthy();
    expect(scopedStyle).not.toMatch(/gradient/i);
    expect(scopedStyle).not.toMatch(/position\s*:\s*fixed/i);
    expect(source).toMatch(
      /grid-template-columns:\s*minmax\(0,\s*13fr\)\s+minmax\(320px,\s*7fr\)/,
    );
    expect(source).toMatch(/@media\s*\(max-width:\s*64rem\)/);
    expect(source).toMatch(
      /@media[\s\S]*?\.editor-toolbar-wrapper\s*\{[^}]*position:\s*sticky/,
    );
    expect(source).toMatch(
      /\.editor-export-wrapper\s*\{[^}]*padding-bottom:\s*calc\(1rem\s*\+\s*env\(safe-area-inset-bottom\)\)/,
    );
    expect(source).toMatch(/\.editor-controls\s*\{[^}]*min-width:\s*0/);
    expect(source).toMatch(
      /:deep\(\.card-inspector\)\s*\{[^}]*min-width:\s*0[^}]*width:\s*100%/,
    );
  });
});
