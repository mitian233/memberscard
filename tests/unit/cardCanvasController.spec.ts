import type { FabricImage, IText } from "fabric";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCardDocument } from "@/editor/cardDocument";
import type { CardCanvasControllerDependencies } from "@/fabric/cardCanvasController";
import type { ApplyCardPatchToSceneOptions } from "@/fabric/applyCardPatchToScene";
import type { BindEditorEventsOptions } from "@/fabric/bindEditorEvents";
import type {
  AssetLoader,
  FabricCardScene,
  InteractiveCanvasAdapter,
  TextMeasurer,
} from "@/fabric/types";
import { currentCardTemplate } from "@/templates/currentCardTemplate";
import type { CardPatch, ResourceStatus } from "@/types/card";

type CardCanvasControllerModule =
  typeof import("@/fabric/cardCanvasController");

let cardCanvasControllerModule: CardCanvasControllerModule | undefined;

async function getControllerModule(): Promise<CardCanvasControllerModule> {
  cardCanvasControllerModule ??= await import("@/fabric/cardCanvasController");
  return cardCanvasControllerModule;
}

function createCanvasFake(): InteractiveCanvasAdapter {
  return {
    raw: {} as InteractiveCanvasAdapter["raw"],
    width: 960,
    height: 640,
    clear: vi.fn(),
    add: vi.fn(),
    remove: vi.fn(),
    requestRenderAll: vi.fn(),
    discardActiveObject: vi.fn(),
    dispose: vi.fn(),
  };
}

function createSceneFake(): FabricCardScene {
  return {
    avatar: {} as FabricImage,
    fields: { name: {} as IText },
    objects: [],
    resourceStatus: { state: "ready" },
    fieldErrors: [],
    disposeObjectListeners: vi.fn(),
  };
}

function createBindOptions(): BindEditorEventsOptions {
  return {
    template: currentCardTemplate,
    measureText: vi.fn<TextMeasurer>(),
    pointerTarget: {} as HTMLElement,
    keyTarget: {} as EventTarget,
    avatarSource: () => "avatar.png",
    onDocumentPatch: vi.fn(),
    onSelectionChange: vi.fn(),
    onFieldValidation: vi.fn(),
    onEditCancel: vi.fn(),
  };
}

function createDependencies() {
  const assets: AssetLoader = {
    loadImage: vi.fn(),
    waitForFonts: vi.fn(),
  };
  const measureText = vi.fn<TextMeasurer>();
  const createCanvas = vi.fn(() => createCanvasFake());
  const renderPromise = Promise.resolve(createSceneFake());
  const render = vi.fn(() => renderPromise);
  const applyResult = {
    kind: "applied",
    field: "name",
    error: null,
  } as const;
  const applyPatch = vi.fn(() => applyResult);
  const disposer = vi.fn();
  const bind = vi.fn(() => disposer);
  const errorStatus: Extract<ResourceStatus, { state: "error" }> = {
    state: "error",
    code: "font-load-failed",
    recoverable: true,
    message: "字体或渲染资源加载失败，请刷新后重试。",
  };
  const classifyResourceError = vi.fn(() => errorStatus);

  const dependencies: CardCanvasControllerDependencies = {
    assets,
    measureText,
    createCanvas,
    render,
    applyPatch,
    bind,
    classifyResourceError,
  };

  return {
    dependencies,
    assets,
    measureText,
    createCanvas,
    render,
    renderPromise,
    applyPatch,
    applyResult,
    bind,
    disposer,
    classifyResourceError,
    errorStatus,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("card canvas controller", () => {
  it("delegates every injected operation once with exact identities and results", async () => {
    const imported = await getControllerModule();
    const fixtures = createDependencies();
    const controller = imported.createCardCanvasController(
      fixtures.dependencies,
    );
    const canvas = createCanvasFake();
    const element = {} as HTMLCanvasElement;
    const document = createCardDocument(currentCardTemplate);
    const scene = createSceneFake();
    const patch: CardPatch = { type: "field", field: "name", value: "新名字" };
    const applyOptions: ApplyCardPatchToSceneOptions = {
      currentDocument: document,
      template: currentCardTemplate,
      measureText: fixtures.measureText,
    };
    const bindOptions = createBindOptions();
    const error = new Error("resource");

    expect(controller.measureText).toBe(fixtures.measureText);

    expect(controller.createCanvas(element)).toBe(
      fixtures.createCanvas.mock.results[0]?.value,
    );
    expect(fixtures.createCanvas).toHaveBeenCalledTimes(1);
    expect(fixtures.createCanvas).toHaveBeenCalledWith(element);

    const renderResult = controller.render(
      canvas,
      document,
      currentCardTemplate,
    );
    expect(renderResult).toBe(fixtures.renderPromise);
    expect(fixtures.render).toHaveBeenCalledTimes(1);
    const renderCall = fixtures.render.mock.calls[0];
    expect(renderCall?.[0]).toBe(canvas);
    expect(renderCall?.[1]).toBe(document);
    expect(renderCall?.[2]).toBe(currentCardTemplate);
    expect(renderCall?.[3]).toEqual({
      mode: "interactive",
      assets: fixtures.assets,
      measureText: fixtures.measureText,
    });
    expect(renderCall?.[3].assets).toBe(fixtures.assets);
    expect(renderCall?.[3].measureText).toBe(fixtures.measureText);

    const applyResult = controller.applyPatch(
      canvas,
      scene,
      patch,
      applyOptions,
    );
    expect(applyResult).toBe(fixtures.applyResult);
    expect(fixtures.applyPatch).toHaveBeenCalledTimes(1);
    expect(fixtures.applyPatch).toHaveBeenCalledWith(
      canvas,
      scene,
      patch,
      applyOptions,
    );

    const boundDisposer = controller.bind(canvas, scene, bindOptions);
    expect(boundDisposer).toBe(fixtures.disposer);
    expect(fixtures.bind).toHaveBeenCalledTimes(1);
    expect(fixtures.bind).toHaveBeenCalledWith(canvas, scene, bindOptions);

    const classified = controller.classifyResourceError(
      error,
      document,
      currentCardTemplate,
    );
    expect(classified).toBe(fixtures.errorStatus);
    expect(fixtures.classifyResourceError).toHaveBeenCalledTimes(1);
    expect(fixtures.classifyResourceError).toHaveBeenCalledWith(
      error,
      document,
      currentCardTemplate,
    );
  });

  it("does not invoke injected operations during controller creation and resolves defaults once lazily", async () => {
    const imported = await getControllerModule();
    const fixtures = createDependencies();
    imported.createCardCanvasController(fixtures.dependencies);

    expect(fixtures.createCanvas).not.toHaveBeenCalled();
    expect(fixtures.render).not.toHaveBeenCalled();
    expect(fixtures.applyPatch).not.toHaveBeenCalled();
    expect(fixtures.bind).not.toHaveBeenCalled();
    expect(fixtures.classifyResourceError).not.toHaveBeenCalled();
    expect(fixtures.assets.loadImage).not.toHaveBeenCalled();
    expect(fixtures.assets.waitForFonts).not.toHaveBeenCalled();
    expect(fixtures.measureText).not.toHaveBeenCalled();
  });

  it("calls browser resource default factories exactly once when dependencies are omitted", async () => {
    vi.resetModules();
    const defaultAssets: AssetLoader = {
      loadImage: vi.fn(),
      waitForFonts: vi.fn(),
    };
    const defaultMeasure = vi.fn<TextMeasurer>();
    const createBrowserAssetLoader = vi.fn(() => defaultAssets);
    const createBrowserTextMeasurer = vi.fn(() => defaultMeasure);

    vi.doMock("@/fabric/browserResources", async () => {
      const actual = await vi.importActual<
        typeof import("@/fabric/browserResources")
      >("@/fabric/browserResources");
      return {
        ...actual,
        createBrowserAssetLoader,
        createBrowserTextMeasurer,
      };
    });

    try {
      const imported = await import("@/fabric/cardCanvasController");
      cardCanvasControllerModule = imported;
      const controller = imported.createCardCanvasController();

      expect(createBrowserAssetLoader).toHaveBeenCalledTimes(1);
      expect(createBrowserTextMeasurer).toHaveBeenCalledTimes(1);
      expect(controller.measureText).toBe(defaultMeasure);
    } finally {
      vi.doUnmock("@/fabric/browserResources");
      vi.resetModules();
      cardCanvasControllerModule = undefined;
    }
  });
});
