import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { nextTick, toRaw } from "vue";
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

const childStubs = vi.hoisted(() => {
  const canvasLifecycle = {
    mounted: 0,
    unmounted: 0,
  };
  return {
    canvasLifecycle,
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
      mounted() {
        canvasLifecycle.mounted += 1;
      },
      unmounted() {
        canvasLifecycle.unmounted += 1;
      },
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
  };
});

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

function extractCssBlock(css: string, openingPattern: RegExp): string | null {
  const match = openingPattern.exec(css);
  if (!match) {
    return null;
  }
  const openingBrace = css.indexOf("{", match.index);
  if (openingBrace < 0) {
    return null;
  }
  let depth = 0;
  for (let index = openingBrace; index < css.length; index += 1) {
    const character = css[index];
    if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        return css.slice(openingBrace + 1, index);
      }
    }
  }
  return null;
}

afterEach(async () => {
  for (const wrapper of wrappers.splice(0)) {
    if (wrapper.exists()) await wrapper.unmount();
  }
});

describe("CardEditorWorkspace", () => {
  it("wraps one persistent Canvas in the real full-preview shell", async () => {
    const mountedBefore = childStubs.canvasLifecycle.mounted;
    const unmountedBefore = childStubs.canvasLifecycle.unmounted;
    const wrapper = mountWorkspace();
    const shell = wrapper.findComponent({ name: "FullPreviewShell" });
    expect(
      wrapper.findAllComponents({ name: "FullPreviewShell" }),
    ).toHaveLength(1);
    expect(shell.exists()).toBe(true);
    expect(
      shell.findAllComponents({ name: "FabricCardCanvasStub" }),
    ).toHaveLength(1);
    const canvas = child(wrapper, "canvas");
    expect(canvas.element.closest(".full-preview-content")).not.toBeNull();
    expect(canvas.element.closest(".full-preview-shell")).toBe(shell.element);
    const canvasElement = canvas.element;
    const canvasVm = canvas.vm;
    const canvasDocument = toRaw(canvas.props("document"));
    const canvasTemplate = toRaw(canvas.props("template"));
    const canvasRequest = toRaw(canvas.props("syncRequest"));
    const canvasController = toRaw(canvas.props("controller"));
    const canvasDisabled = canvas.props("disabled");
    const canvasLoading = canvas.props("loading");

    expect(wrapper.get(".full-preview-content").isVisible()).toBe(true);
    expect(wrapper.get(".full-preview-trigger").text()).toBe("完整预览");
    await shell.get(".full-preview-trigger").trigger("click");
    await nextTick();
    await flushPromises();
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true);
    expect(wrapper.find('[role="dialog"] h2').text()).toBe("完整会员证预览");
    expect(document.activeElement).toBe(
      wrapper.get(".full-preview-close").element,
    );

    await shell.get(".full-preview-close").trigger("click");
    await nextTick();
    await shell.get(".full-preview-trigger").trigger("click");
    await nextTick();
    expect(
      wrapper.findAllComponents({ name: "FabricCardCanvasStub" }),
    ).toHaveLength(1);
    expect(child(wrapper, "canvas").element).toBe(canvasElement);
    expect(child(wrapper, "canvas").vm).toBe(canvasVm);
    expect(childStubs.canvasLifecycle.mounted - mountedBefore).toBe(1);
    expect(childStubs.canvasLifecycle.unmounted - unmountedBefore).toBe(0);
    expect(toRaw(child(wrapper, "canvas").props("document"))).toBe(
      canvasDocument,
    );
    expect(toRaw(child(wrapper, "canvas").props("template"))).toBe(
      canvasTemplate,
    );
    expect(toRaw(child(wrapper, "canvas").props("syncRequest"))).toBe(
      canvasRequest,
    );
    expect(toRaw(child(wrapper, "canvas").props("controller"))).toBe(
      canvasController,
    );
    expect(child(wrapper, "canvas").props("disabled")).toBe(canvasDisabled);
    expect(child(wrapper, "canvas").props("loading")).toBe(canvasLoading);

    const patch: CardPatch = {
      type: "field",
      field: "name",
      value: "保留事件",
    };
    canvas.vm.$emit("change", patch, "canvas");
    expect(wrapper.emitted("canvas-change")).toEqual([[patch, "canvas"]]);

    const escape = new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    });
    wrapper.get('[role="dialog"]').element.dispatchEvent(escape);
    expect(escape.defaultPrevented).toBe(true);
    await nextTick();
    await flushPromises();
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
    expect(document.activeElement).toBe(
      wrapper.get(".full-preview-trigger").element,
    );
    expect(wrapper.emitted("canvas-change")).toEqual([[patch, "canvas"]]);
    expect(shell.emitted("open")).toEqual([[], []]);
    expect(shell.emitted("close")).toEqual([[], []]);

    await wrapper.unmount();
    expect(childStubs.canvasLifecycle.unmounted - unmountedBefore).toBe(1);
  });

  it("renders one labelled main in reading order with exact current/legacy props", () => {
    for (const template of [currentCardTemplate, legacyCardTemplate]) {
      const cardDocument = createCardDocument(template);
      const request = createRequest(cardDocument, template);
      const controller = {} as CardCanvasController;
      const fieldErrors: Readonly<
        Partial<Record<CardField, FieldValidationError>>
      > = {
        name: {
          field: "name",
          code: "text-too-wide",
          message: "过长",
        },
      };
      const wrapper = mountWorkspace({
        template,
        document: cardDocument,
        syncRequest: request,
        canvasController: controller,
        activeGroup: "avatar",
        fieldErrors,
        dirty: true,
      });
      const main = wrapper.get("main");
      expect(main.classes()).toEqual(
        expect.arrayContaining(["bg-neutral", "text-neutral-content"]),
      );
      expect(wrapper.findAll("main")).toHaveLength(1);
      expect(main.attributes("aria-label")).toBe("会员证编辑器");
      const order = [...main.element.children].map(
        (element) => element.tagName,
      );
      expect(order).toEqual(["DIV", "DIV"]);
      const toolbarWrapper = main.get(".editor-toolbar-wrapper").element;
      const workspaceGrid = main.get(".editor-workspace-grid").element;
      const previewRegion = main.get(".editor-preview-region").element;
      const controls = main.get(".editor-controls").element;
      expect(main.element.children[0]).toBe(toolbarWrapper);
      expect(main.element.children[1]).toBe(workspaceGrid);
      expect(workspaceGrid.children[0]).toBe(previewRegion);
      expect(workspaceGrid.children[1]).toBe(controls);
      expect(
        Array.from(main.element.children).indexOf(toolbarWrapper),
      ).toBeLessThan(Array.from(main.element.children).indexOf(workspaceGrid));
      expect(
        Array.from(workspaceGrid.children).indexOf(previewRegion),
      ).toBeLessThan(Array.from(workspaceGrid.children).indexOf(controls));
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
      expect(child(wrapper, "inspector").props("activeGroup")).toBe("avatar");
      expect(toRaw(child(wrapper, "inspector").props("fieldErrors"))).toBe(
        fieldErrors,
      );
      expect(child(wrapper, "exports").props("canExport")).toBe(true);
      expect(main.get(".editor-preview-region").classes()).toContain(
        "rounded-box",
      );
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

    expect(wrapper.emitted("template-change")).toHaveLength(1);
    expect(wrapper.emitted("template-change")?.[0]?.[0]).toBe("legacy");
    expect(wrapper.emitted("reset-all")).toHaveLength(1);
    expect(wrapper.emitted("reset-all")).toEqual([[]]);
    expect(wrapper.emitted("update:activeGroup")).toHaveLength(1);
    expect(wrapper.emitted("update:activeGroup")?.[0]?.[0]).toBe("avatar");
    expect(wrapper.emitted("update-field")).toHaveLength(1);
    expect(wrapper.emitted("update-field")?.[0]?.[0]).toBe("name");
    expect(wrapper.emitted("update-field")?.[0]?.[1]).toBe("新名字");
    expect(wrapper.emitted("update-avatar")).toHaveLength(1);
    expect(wrapper.emitted("update-avatar")?.[0]?.[0]).toBe(avatar.value);
    expect(wrapper.emitted("reset-field")).toHaveLength(1);
    expect(wrapper.emitted("reset-field")?.[0]?.[0]).toBe("name");
    expect(wrapper.emitted("reset-avatar")).toHaveLength(1);
    expect(wrapper.emitted("reset-avatar")).toEqual([[]]);
    expect(wrapper.emitted("avatar-file")).toHaveLength(1);
    expect(wrapper.emitted("avatar-file")?.[0]?.[0]).toBe(file);
    expect(wrapper.emitted("copy")).toHaveLength(1);
    expect(wrapper.emitted("copy")).toEqual([[]]);
    expect(wrapper.emitted("export")).toHaveLength(1);
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
    const resourcePayload = { revision: 1, status: resource };
    canvas.vm.$emit("ready", ready);
    canvas.vm.$emit("resource-error", resourcePayload);
    canvas.vm.$emit("change", patch, "canvas");
    canvas.vm.$emit("selection-change", selection);
    canvas.vm.$emit("edit-cancel", "name", "恢复名");
    canvas.vm.$emit("validation-error", "name", error);

    expect(wrapper.emitted("canvas-ready")).toHaveLength(1);
    expect(wrapper.emitted("canvas-ready")?.[0]?.[0]).toBe(ready);
    expect(wrapper.emitted("resource-error")).toHaveLength(1);
    expect(wrapper.emitted("resource-error")?.[0]?.[0]).toBe(resourcePayload);
    expect(wrapper.emitted("canvas-change")).toHaveLength(1);
    expect(wrapper.emitted("canvas-change")?.[0]?.[0]).toBe(patch);
    expect(wrapper.emitted("canvas-change")?.[0]?.[1]).toBe("canvas");
    expect(wrapper.emitted("selection-change")).toHaveLength(1);
    expect(wrapper.emitted("selection-change")?.[0]?.[0]).toBe(selection);
    expect(wrapper.emitted("edit-cancel")).toHaveLength(1);
    expect(wrapper.emitted("edit-cancel")?.[0]?.[0]).toBe("name");
    expect(wrapper.emitted("edit-cancel")?.[0]?.[1]).toBe("恢复名");
    expect(wrapper.emitted("validation-error")).toHaveLength(1);
    expect(wrapper.emitted("validation-error")?.[0]?.[0]).toBe("name");
    expect(wrapper.emitted("validation-error")?.[0]?.[1]).toBe(error);
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
      expect(
        resourceRegion.classes(
          testCase.status.state === "error" ||
            testCase.status.state === "degraded"
            ? "alert"
            : "badge",
        ),
      ).toBe(true);
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

    const emptyUploadWrapper = mountWorkspace({ uploadMessage: "" });
    const emptyUploadRegion = emptyUploadWrapper.get("[data-upload-status]");
    expect(emptyUploadRegion.exists()).toBe(true);
    expect(emptyUploadRegion.text()).toBe("");
    expect(emptyUploadRegion.attributes("role")).toBe("status");
    expect(emptyUploadRegion.attributes("aria-live")).toBe("polite");
    expect(emptyUploadRegion.attributes("aria-atomic")).toBe("true");
  });

  it("keeps the responsive workspace CSS contracts scoped and gradient-free", () => {
    const scopedStyle = source.match(
      /<style\s+scoped>([\s\S]*?)<\/style>/i,
    )?.[1];
    expect(scopedStyle).toBeTruthy();
    expect(scopedStyle).not.toMatch(/gradient/i);
    expect(scopedStyle).not.toMatch(/position\s*:\s*fixed/i);
    expect(source).not.toMatch(/full-preview-trigger|完整预览/);
    expect(source).toMatch(
      /\.card-editor-workspace\s*\{[^}]*max-width:\s*90rem[^}]*margin:\s*0 auto[^}]*padding:\s*1rem\s+clamp\(/,
    );
    expect(source).toMatch(
      /\.editor-preview-region\s*\{[^}]*position:\s*sticky/,
    );
    expect(source).toMatch(
      /grid-template-columns:\s*minmax\(0,\s*13fr\)\s+minmax\(320px,\s*7fr\)/,
    );
    const mobileMedia = extractCssBlock(
      source,
      /@media\s*\(\s*max-width:\s*64rem\s*\)\s*\{/i,
    );
    expect(mobileMedia).toBeTruthy();
    expect(mobileMedia).toMatch(
      /\.editor-toolbar-wrapper\s*\{[^}]*position:\s*sticky/,
    );
    expect(mobileMedia).toMatch(
      /\.editor-workspace-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/,
    );
    expect(mobileMedia).toMatch(
      /\.editor-preview-region\s*\{[^}]*position:\s*static/,
    );
    expect(mobileMedia).toMatch(
      /\.editor-export-wrapper\s*\{[^}]*padding-bottom:\s*calc\(1rem\s*\+\s*env\(safe-area-inset-bottom\)\)/,
    );
    expect(source).toMatch(/\.editor-controls\s*\{[^}]*min-width:\s*0/);
    expect(source).toMatch(
      /:deep\(\.card-inspector\)\s*\{[^}]*min-width:\s*0[^}]*width:\s*100%/,
    );
  });
});
