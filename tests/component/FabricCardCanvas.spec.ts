import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import type {
  CanvasSettledPayload,
  CanvasSyncRequest,
} from "@/composables/useCardEditor";
import type { CardCanvasController } from "@/fabric/cardCanvasController";
import type {
  CardCanvasSession,
  CreateCardCanvasSessionOptions,
} from "@/fabric/cardCanvasSession";
import type { FabricCardScene, InteractiveCanvasAdapter } from "@/fabric/types";
import { createCardDocument } from "@/editor/cardDocument";
import { currentCardTemplate } from "@/templates/currentCardTemplate";
import type {
  CardDocument,
  CardPatch,
  CardTemplateDefinition,
  EditorSelection,
  FieldValidationError,
  ResourceStatus,
} from "@/types/card";

const moduleMocks = vi.hoisted(() => ({
  createCardCanvasController: vi.fn(),
  createCardCanvasSession: vi.fn(),
}));

vi.mock("@/fabric/cardCanvasController", () => moduleMocks);
vi.mock("@/fabric/cardCanvasSession", () => moduleMocks);

import FabricCardCanvas from "@/components/editor/FabricCardCanvas.vue";

const canvasSource = readFileSync(
  resolve(process.cwd(), "src/components/editor/FabricCardCanvas.vue"),
  "utf8",
);

type FakeRawCanvas = {
  upperCanvasEl: HTMLCanvasElement;
  width: number;
  height: number;
  setDimensions: ReturnType<typeof vi.fn>;
};

interface FakeCanvas extends InteractiveCanvasAdapter {
  raw: FakeRawCanvas;
}

interface FakeResizeObserver {
  callback: ResizeObserverCallback;
  observe: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
}

const resizeObservers: FakeResizeObserver[] = [];
const frames = new Map<number, FrameRequestCallback>();
let nextFrameId = 1;

function installLayoutFakes(): void {
  class TestResizeObserver implements ResizeObserver {
    readonly callback: ResizeObserverCallback;
    readonly observe = vi.fn();
    readonly disconnect = vi.fn();

    constructor(callback: ResizeObserverCallback) {
      this.callback = callback;
      resizeObservers.push(this);
    }

    unobserve = vi.fn();
  }

  vi.stubGlobal("ResizeObserver", TestResizeObserver);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    const id = nextFrameId++;
    frames.set(id, callback);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    frames.delete(id);
  });
}

function flushAnimationFrames(): void {
  const pending = [...frames.entries()];
  frames.clear();
  for (const [, callback] of pending) {
    callback(performance.now());
  }
}

function createFakeCanvas(): FakeCanvas {
  const upperCanvasEl = document.createElement("canvas");
  const setDimensions = vi.fn();
  const raw = {
    upperCanvasEl,
    width: 960,
    height: 640,
    setDimensions,
  } as unknown as FakeRawCanvas;

  return {
    raw,
    width: 960,
    height: 640,
    clear: vi.fn(),
    add: vi.fn(),
    remove: vi.fn(),
    requestRenderAll: vi.fn(),
    discardActiveObject: vi.fn(),
    dispose: vi.fn(async () => undefined),
  };
}

function createFakeScene(): FabricCardScene {
  return {
    avatar: {} as FabricCardScene["avatar"],
    fields: {},
    objects: [],
    resourceStatus: { state: "ready" },
    fieldErrors: [],
    disposeObjectListeners: vi.fn(),
  };
}

function createFakeController(canvas: FakeCanvas): CardCanvasController {
  return {
    measureText: vi.fn(() => 0),
    createCanvas: vi.fn(() => canvas),
    render: vi.fn(async () => createFakeScene()),
    applyPatch: vi.fn(() => ({
      kind: "requires-render",
      reason: "avatar-source-changed",
    })),
    bind: vi.fn(() => vi.fn()),
    classifyResourceError: vi.fn(() => ({
      state: "error",
      code: "background-load-failed",
      message: "preview failed",
      recoverable: true,
    })),
  };
}

function createRequest(
  document: CardDocument,
  template: CardTemplateDefinition,
  revision = 1,
): CanvasSyncRequest {
  return {
    revision,
    kind: "replace",
    source: "system",
    document,
    template,
  };
}

function mountCanvas(
  overrides: Partial<{
    document: CardDocument;
    template: CardTemplateDefinition;
    syncRequest: CanvasSyncRequest;
    controller: CardCanvasController;
    disabled: boolean;
    loading: boolean;
  }> = {},
): VueWrapper {
  const template = overrides.template ?? currentCardTemplate;
  const document = overrides.document ?? createCardDocument(template);
  const syncRequest =
    overrides.syncRequest ?? createRequest(document, template, 1);

  return mount(FabricCardCanvas, {
    attachTo: document.body,
    props: {
      document,
      template,
      syncRequest,
      controller: overrides.controller,
      disabled: overrides.disabled ?? false,
      loading: overrides.loading ?? false,
    },
  });
}

let canvas: FakeCanvas;
let controller: CardCanvasController;
let session: CardCanvasSession;
let sessionOptions: CreateCardCanvasSessionOptions | undefined;

beforeEach(() => {
  vi.clearAllMocks();
  resizeObservers.length = 0;
  frames.clear();
  nextFrameId = 1;
  canvas = createFakeCanvas();
  controller = createFakeController(canvas);
  sessionOptions = undefined;
  session = {
    submit: vi.fn(async () => undefined),
    dispose: vi.fn(async () => undefined),
  };
  moduleMocks.createCardCanvasController.mockReturnValue(controller);
  moduleMocks.createCardCanvasSession.mockImplementation(
    (options: CreateCardCanvasSessionOptions) => {
      sessionOptions = options;
      return session;
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("FabricCardCanvas", () => {
  it("renders the semantic preview, summary, and exact Fabric targets", async () => {
    const document = createCardDocument(currentCardTemplate);
    const request = createRequest(document, currentCardTemplate, 1);
    const wrapper = mountCanvas({ document, syncRequest: request, controller });
    await nextTick();

    const section = wrapper.get("section.fabric-card-canvas");
    const heading = section.get("h2");
    expect(heading.text()).toBe("会员证预览");
    expect(section.attributes("aria-labelledby")).toBe(
      heading.attributes("id"),
    );
    expect(section.get("canvas.preview-canvas").attributes("aria-hidden")).toBe(
      "true",
    );

    const summary = section.get("[data-card-summary]");
    expect(summary.text()).toContain(document.name);
    expect(summary.text()).toContain(document.nameEn);
    expect(summary.text()).toContain(document.bandName);
    expect(summary.text()).toContain(document.birthday);
    expect(summary.text()).toContain("头像已加载");
    expect(summary.text()).toContain("检查器");
    expect(summary.text()).toContain("键盘");

    expect(controller.createCanvas).toHaveBeenCalledTimes(1);
    expect(controller.createCanvas).toHaveBeenCalledWith(
      section.get("canvas.preview-canvas").element,
    );
    expect(sessionOptions?.canvas).toBe(canvas);
    expect(sessionOptions?.controller).toBe(controller);
    expect(sessionOptions?.pointerTarget).toBe(canvas.raw.upperCanvasEl);
    expect(sessionOptions?.keyTarget).toBe(globalThis.document);
    expect(sessionOptions?.callbacks.interactionEnabled()).toBe(true);

    const upper = canvas.raw.upperCanvasEl;
    expect(upper.getAttribute("tabindex")).toBe("0");
    expect(upper.getAttribute("aria-label")).toBe("可编辑会员证预览");
    expect(upper.getAttribute("aria-describedby")).toBe(
      summary.attributes("id"),
    );
    expect(session?.submit).toHaveBeenCalledTimes(1);
    expect(session?.submit).toHaveBeenCalledWith(request);
    expect(
      (session.submit as ReturnType<typeof vi.fn>).mock.calls[0]?.[0],
    ).toBe(request);
  });

  it("watches only the sync revision while keeping the summary current", async () => {
    const original = createCardDocument(currentCardTemplate);
    const wrapper = mountCanvas({ document: original, controller });
    await nextTick();
    expect(session.submit).toHaveBeenCalledTimes(1);

    const sameRevision = { ...original, name: "同修订摘要" };
    await wrapper.setProps({ document: sameRevision });
    expect(wrapper.get("[data-card-summary]").text()).toContain("同修订摘要");
    expect(session.submit).toHaveBeenCalledTimes(1);

    const nextRequest = createRequest(sameRevision, currentCardTemplate, 2);
    await wrapper.setProps({ syncRequest: nextRequest });
    await nextTick();
    expect(session.submit).toHaveBeenCalledTimes(2);
    expect(session.submit).toHaveBeenLastCalledWith(nextRequest);

    sameRevision.name = "原地改变不触发";
    await nextTick();
    expect(session.submit).toHaveBeenCalledTimes(2);
  });

  it("forwards every session event with exact payloads and guards callbacks after unmount", async () => {
    const wrapper = mountCanvas({ controller });
    await nextTick();
    const callbacks = sessionOptions?.callbacks;
    expect(callbacks).toBeDefined();

    const settled: CanvasSettledPayload = {
      revision: 1,
      resourceStatus: { state: "ready" },
      fieldErrors: [],
    };
    const errorStatus: Extract<ResourceStatus, { state: "error" }> = {
      state: "error",
      code: "logo-load-failed",
      message: "logo unavailable",
      recoverable: true,
    };
    const patch: CardPatch = { type: "field", field: "name", value: "新名字" };
    const selection: EditorSelection = { type: "field", field: "name" };
    const validation: FieldValidationError = {
      field: "name",
      code: "text-too-wide",
      message: "内容过长",
    };

    callbacks?.onSettled(settled);
    callbacks?.onResourceError({ revision: 1, status: errorStatus });
    callbacks?.onDocumentPatch(patch, "canvas");
    callbacks?.onSelectionChange(selection);
    callbacks?.onFieldValidation("name", validation);
    callbacks?.onEditCancel("name", "旧名字");

    expect(wrapper.emitted("ready")).toEqual([[settled]]);
    expect(wrapper.emitted("resource-error")).toEqual([
      [{ revision: 1, status: errorStatus }],
    ]);
    expect(wrapper.emitted("change")).toEqual([[patch, "canvas"]]);
    expect(wrapper.emitted("selection-change")).toEqual([[selection]]);
    expect(wrapper.emitted("validation-error")).toEqual([["name", validation]]);
    expect(wrapper.emitted("edit-cancel")).toEqual([["name", "旧名字"]]);

    const emitSpy = vi.spyOn(
      wrapper.vm as unknown as { $emit: (...args: unknown[]) => void },
      "$emit",
    );
    const emittedCallCount = emitSpy.mock.calls.length;
    await wrapper.unmount();
    callbacks?.onSettled(settled);
    callbacks?.onResourceError({ revision: 1, status: errorStatus });
    callbacks?.onDocumentPatch(patch, "canvas");
    expect(emitSpy.mock.calls.length).toBe(emittedCallCount);
  });

  it("uses one default controller per instance and preserves injected identity", async () => {
    const injected = controller;
    const injectedWrapper = mountCanvas({ controller: injected });
    await nextTick();
    expect(moduleMocks.createCardCanvasController).not.toHaveBeenCalled();
    await injectedWrapper.unmount();

    const defaultWrapper = mountCanvas();
    await nextTick();
    expect(moduleMocks.createCardCanvasController).toHaveBeenCalledTimes(1);
    expect(sessionOptions?.controller).toBe(controller);
    await defaultWrapper.unmount();
  });

  it("tracks deferred busy work and classifies a rejected submit once", async () => {
    let rejectSubmit: ((error: unknown) => void) | undefined;
    session.submit = vi.fn(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectSubmit = reject;
        }),
    );

    const wrapper = mountCanvas({ controller });
    await nextTick();
    const upper = canvas.raw.upperCanvasEl;
    expect(wrapper.get("section").attributes("aria-busy")).toBe("true");
    expect(upper.getAttribute("aria-busy")).toBe("true");

    const classified: Extract<ResourceStatus, { state: "error" }> = {
      state: "error",
      code: "background-load-failed",
      message: "classified",
      recoverable: true,
    };
    (
      controller.classifyResourceError as ReturnType<typeof vi.fn>
    ).mockReturnValue(classified);
    sessionOptions?.callbacks.onResourceError({
      revision: 1,
      status: classified,
    });
    rejectSubmit?.(new Error("handled after callback"));
    await flushPromises();
    expect(wrapper.emitted("resource-error")).toEqual([
      [{ revision: 1, status: classified }],
    ]);

    await wrapper.setProps({ loading: true });
    expect(wrapper.get("section").attributes("aria-busy")).toBe("true");
    await wrapper.setProps({ loading: false });
    expect(wrapper.get("section").attributes("aria-busy")).toBeUndefined();
  });

  it("updates disabled interaction and exact upper-canvas accessibility attributes", async () => {
    const wrapper = mountCanvas({ controller, disabled: true });
    await nextTick();
    const upper = canvas.raw.upperCanvasEl;
    expect(upper.getAttribute("aria-disabled")).toBe("true");
    expect(upper.getAttribute("tabindex")).toBe("-1");
    expect(sessionOptions?.callbacks.interactionEnabled()).toBe(false);

    await wrapper.setProps({ disabled: false });
    expect(upper.getAttribute("aria-disabled")).toBe("false");
    expect(upper.getAttribute("tabindex")).toBe("0");
    expect(sessionOptions?.callbacks.interactionEnabled()).toBe(true);
  });

  it("contains the logical canvas with one coalesced css-only resize and skips invalid sizes", async () => {
    installLayoutFakes();
    const wrapper = mountCanvas({ controller });
    await nextTick();
    const host = wrapper.get(".preview-host").element as HTMLElement;
    let rect = { width: 480, height: 400 };
    Object.defineProperty(host, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        ...rect,
        top: 0,
        left: 0,
        right: rect.width,
        bottom: rect.height,
      }),
    });
    flushAnimationFrames();
    expect(canvas.raw.setDimensions).toHaveBeenCalledTimes(1);
    expect(canvas.raw.setDimensions).toHaveBeenCalledWith(
      { width: 480, height: 320 },
      { cssOnly: true },
    );
    expect(canvas.width).toBe(960);
    expect(canvas.height).toBe(640);

    rect = { width: 640, height: 200 };
    const observer = resizeObservers[0];
    observer.callback([], observer as unknown as ResizeObserver);
    observer.callback([], observer as unknown as ResizeObserver);
    flushAnimationFrames();
    expect(canvas.raw.setDimensions).toHaveBeenCalledTimes(2);
    expect(canvas.raw.setDimensions).toHaveBeenLastCalledWith(
      { width: 300, height: 200 },
      { cssOnly: true },
    );

    rect = { width: 0, height: 0 };
    observer.callback([], observer as unknown as ResizeObserver);
    flushAnimationFrames();
    expect(canvas.raw.setDimensions).toHaveBeenCalledTimes(2);

    await wrapper.unmount();
    expect(observer.disconnect).toHaveBeenCalledTimes(1);
    expect(session.dispose).toHaveBeenCalledTimes(1);
  });

  it("keeps sizing and accessibility CSS contracts scoped to declaration blocks", () => {
    const scopedStyle = canvasSource.match(
      /<style\s+scoped>([\s\S]*?)<\/style>/i,
    )?.[1];
    expect(scopedStyle).toBeTruthy();
    expect(scopedStyle).not.toMatch(/position\s*:\s*(?:fixed|sticky)/i);
    expect(scopedStyle).not.toMatch(/gradient|animation/i);
    expect(canvasSource).toMatch(
      /\.preview-host\s*\{[^}]*width:\s*100%[^}]*aspect-ratio:\s*3\s*\/\s*2/,
    );
    expect(canvasSource).toMatch(
      /:deep\(\.preview-canvas-upper\)\s*\{[^}]*touch-action:\s*none/,
    );
    expect(canvasSource).toMatch(
      /:deep\(\.preview-canvas-upper\.is-disabled\)\s*\{[^}]*pointer-events:\s*none/,
    );
  });
});
