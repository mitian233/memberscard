import { describe, expect, it, vi } from "vitest";

import type { FabricImage, FabricObject, StaticCanvas } from "fabric";
import type {
  AssetLoader,
  ExportCanvasAdapter,
  ExportCanvasFactory,
  RenderCardOptions,
  TextMeasurer,
} from "@/fabric/types";
import { renderCardDocument } from "@/fabric/renderCardDocument";
import type {
  CardDocument,
  CardTemplateDefinition,
  FabricCardScene,
} from "@/types/card";
import {
  CardExportError,
  createBrowserExportCanvasFactory,
  exportCardPng,
  type StaticCanvasCreator,
} from "@/fabric/exportCard";

function createTemplate(
  overrides: Partial<CardTemplateDefinition> = {},
): CardTemplateDefinition {
  return {
    id: "current",
    canvas: { width: 960, height: 640, radius: 0 },
    assets: { background: "/background.png", logo: "/logo.png" },
    defaults: {
      name: "name",
      nameEn: "nameEn",
      bandName: "bandName",
      birthday: "2000-01-01",
      avatar: { src: "/avatar.png", left: 10, top: 20, scale: 1 },
    },
    avatarFrame: { left: 100, top: 100, width: 360, height: 550, radius: 12 },
    fields: {},
    staticObjects: [],
    ...overrides,
  };
}

function createDocument(
  templateId: CardDocument["templateId"] = "current",
): CardDocument {
  return {
    templateId,
    name: "姓名",
    nameEn: "Name",
    bandName: "Band",
    birthday: "2000-01-01",
    avatar: { src: "/avatar.png", left: 10, top: 20, scale: 1 },
  };
}

function createPngBlob(): Blob {
  return new Blob(["png"], { type: "image/png" });
}

function createBlob(type: string): Blob {
  const blob = new Blob(["blob"], { type });
  Object.defineProperty(blob, "type", {
    configurable: true,
    value: type,
  });
  return blob;
}

function createAssets(): AssetLoader {
  return {
    loadImage: vi.fn<AssetLoader["loadImage"]>(async () => {
      return {} as FabricImage;
    }),
    waitForFonts: vi.fn<AssetLoader["waitForFonts"]>(async () => ({
      state: "ready",
    })),
  };
}

function createRawCanvas() {
  const blob = createPngBlob();
  const blobPromise = Promise.resolve<Blob | null>(blob);
  const methods = {
    clear: vi.fn<StaticCanvas["clear"]>(),
    add: vi.fn<StaticCanvas["add"]>(() => 2),
    remove: vi.fn<StaticCanvas["remove"]>(() => []),
    requestRenderAll: vi.fn<StaticCanvas["requestRenderAll"]>(),
    discardActiveObject: vi.fn(() => ({}) as unknown),
    toBlob: vi.fn<StaticCanvas["toBlob"]>(() => blobPromise),
    dispose: vi.fn<StaticCanvas["dispose"]>(async () => true),
  };
  const raw = methods as unknown as StaticCanvas;
  return { raw, methods, blobPromise };
}

function createAdapter(
  blob: Blob | null = createPngBlob(),
  order: string[] = [],
): ExportCanvasAdapter {
  const raw = {} as StaticCanvas;
  return {
    raw,
    width: 960,
    height: 640,
    clear: vi.fn(() => {
      order.push("clear");
    }),
    add: vi.fn((...objects: FabricObject[]) => {
      void objects;
      order.push("add");
    }),
    remove: vi.fn((...objects: FabricObject[]) => {
      void objects;
      order.push("remove");
    }),
    requestRenderAll: vi.fn(() => {
      order.push("requestRenderAll");
    }),
    discardActiveObject: vi.fn(() => {
      order.push("discardActiveObject");
    }),
    toBlob: vi.fn(async () => {
      order.push("toBlob");
      return blob;
    }),
    dispose: vi.fn(async () => {
      order.push("dispose");
    }),
  };
}

function createRender(
  order: string[] = [],
): ReturnType<typeof vi.fn<typeof renderCardDocument>> {
  return vi.fn<typeof renderCardDocument>(async () => {
    order.push("render");
    return {} as FabricCardScene;
  });
}

function createOptions(
  factory: ExportCanvasFactory,
  render: typeof renderCardDocument,
  assets: AssetLoader = createAssets(),
  measureText: TextMeasurer = vi.fn<TextMeasurer>(() => 100),
): {
  factory: ExportCanvasFactory;
  assets: AssetLoader;
  measureText: TextMeasurer;
  render: typeof renderCardDocument;
} {
  return { factory, assets, measureText, render };
}

describe("export card", () => {
  it("validates factory dimensions and forwards public canvas operations", async () => {
    const { raw, methods, blobPromise } = createRawCanvas();
    const createRaw = vi.fn<StaticCanvasCreator>(() => raw);
    const factory = createBrowserExportCanvasFactory(createRaw);

    expect(createRaw).not.toHaveBeenCalled();
    for (const [width, height] of [
      [0, 640],
      [-1, 640],
      [960, 0],
      [960, -1],
      [960.5, 640],
      [960, 640.5],
      [Number.NaN, 640],
      [960, Number.POSITIVE_INFINITY],
    ]) {
      expect(() => factory.create(width, height)).toThrow(RangeError);
    }
    expect(createRaw).not.toHaveBeenCalled();

    const adapter = factory.create(960, 640);
    expect(createRaw).toHaveBeenCalledTimes(1);
    expect(createRaw).toHaveBeenCalledWith(960, 640);
    expect(adapter.raw).toBe(raw);
    expect(adapter.width).toBe(960);
    expect(adapter.height).toBe(640);

    const first = {} as FabricObject;
    const second = {} as FabricObject;
    expect(adapter.clear()).toBeUndefined();
    expect(adapter.add(first, second)).toBeUndefined();
    expect(adapter.remove(first, second)).toBeUndefined();
    expect(adapter.requestRenderAll()).toBeUndefined();
    expect(adapter.discardActiveObject()).toBeUndefined();
    expect(methods.clear).toHaveBeenCalledTimes(1);
    expect(methods.add).toHaveBeenCalledWith(first, second);
    expect(methods.remove).toHaveBeenCalledWith(first, second);
    expect(methods.requestRenderAll).toHaveBeenCalledTimes(1);
    expect(methods.discardActiveObject).toHaveBeenCalledTimes(1);

    const { discardActiveObject: ignoredDiscard, ...withoutDiscard } = methods;
    void ignoredDiscard;
    const adapterWithoutDiscard = createBrowserExportCanvasFactory(
      () => withoutDiscard as unknown as StaticCanvas,
    ).create(960, 640);
    expect(() => adapterWithoutDiscard.discardActiveObject()).not.toThrow();

    const blobOptions = { format: "png", multiplier: 4 } as const;
    expect(adapter.toBlob(blobOptions)).toBe(blobPromise);
    expect(methods.toBlob).toHaveBeenCalledWith(blobOptions);

    const firstDispose = adapter.dispose();
    const secondDispose = adapter.dispose();
    expect(secondDispose).toBe(firstDispose);
    await firstDispose;
    expect(methods.dispose).toHaveBeenCalledTimes(1);
    expect(adapter.dispose()).toBe(firstDispose);
  });

  it("lazily constructs the default StaticCanvas with exact options", async () => {
    vi.resetModules();
    const { raw } = createRawCanvas();
    const staticCanvas = vi.fn(function mockStaticCanvas() {
      return raw;
    });
    vi.doMock("fabric", async () => {
      const actual = await vi.importActual<typeof import("fabric")>("fabric");
      return { ...actual, StaticCanvas: staticCanvas };
    });

    try {
      const imported = await import("@/fabric/exportCard");
      expect(staticCanvas).not.toHaveBeenCalled();
      const factory = imported.createBrowserExportCanvasFactory();
      expect(staticCanvas).not.toHaveBeenCalled();
      factory.create(960, 640);
      expect(staticCanvas).toHaveBeenCalledWith(undefined, {
        width: 960,
        height: 640,
        renderOnAddRemove: false,
      });
    } finally {
      vi.doUnmock("fabric");
      vi.resetModules();
    }
  });

  it("renders exact document/options then exports a fixed four-times PNG", async () => {
    const order: string[] = [];
    const adapter = createAdapter(createPngBlob(), order);
    const factory: ExportCanvasFactory = {
      create: vi.fn(() => adapter),
    };
    const assets = createAssets();
    const measureText = vi.fn<TextMeasurer>(() => 100);
    const render = createRender(order);
    const document = Object.freeze(createDocument());
    const template = Object.freeze(createTemplate());

    const result = await exportCardPng(
      document,
      template,
      createOptions(factory, render, assets, measureText),
    );

    expect(result).toBeInstanceOf(Blob);
    expect(result.type).toBe("image/png");
    expect(factory.create).toHaveBeenCalledWith(960, 640);
    expect(render).toHaveBeenCalledTimes(1);
    expect(render).toHaveBeenCalledWith(adapter, document, template, {
      mode: "export",
      assets,
      measureText,
    } satisfies RenderCardOptions);
    expect(adapter.discardActiveObject).toHaveBeenCalledTimes(1);
    expect(adapter.requestRenderAll).toHaveBeenCalledTimes(1);
    expect(adapter.toBlob).toHaveBeenCalledWith({
      format: "png",
      multiplier: 4,
    });
    expect(order).toEqual([
      "render",
      "discardActiveObject",
      "requestRenderAll",
      "toBlob",
      "dispose",
    ]);
  });

  it("rejects mismatched or invalid templates before any side effects", async () => {
    const assets = createAssets();
    const measureText = vi.fn<TextMeasurer>(() => 100);
    const render = createRender();
    const adapter = createAdapter();
    const factory: ExportCanvasFactory = { create: vi.fn(() => adapter) };
    const options = createOptions(factory, render, assets, measureText);

    await expect(
      exportCardPng(createDocument("legacy"), createTemplate(), options),
    ).rejects.toBeInstanceOf(RangeError);
    for (const [width, height] of [
      [0, 640],
      [960, 0],
      [960.5, 640],
      [960, 640.5],
      [Number.NaN, 640],
      [960, Number.POSITIVE_INFINITY],
    ]) {
      await expect(
        exportCardPng(
          createDocument(),
          createTemplate({ canvas: { width, height, radius: 0 } }),
          options,
        ),
      ).rejects.toBeInstanceOf(RangeError);
    }

    expect(factory.create).not.toHaveBeenCalled();
    expect(render).not.toHaveBeenCalled();
    expect(assets.loadImage).not.toHaveBeenCalled();
    expect(assets.waitForFonts).not.toHaveBeenCalled();
    expect(measureText).not.toHaveBeenCalled();
  });

  it("wraps render and blob failures with safe errors and always disposes", async () => {
    const document = createDocument();
    const template = createTemplate();
    const renderError = new Error("private render details");
    const renderAdapter = createAdapter();
    const renderFactory: ExportCanvasFactory = {
      create: vi.fn(() => renderAdapter),
    };
    const render = createRender();
    render.mockRejectedValue(renderError);

    const renderFailure = await exportCardPng(
      document,
      template,
      createOptions(renderFactory, render),
    ).catch((error: unknown) => error);
    expect(renderFailure).toBeInstanceOf(CardExportError);
    expect(renderFailure).toMatchObject({
      code: "render-failed",
      message: "图片导出失败，请重试。",
      cause: renderError,
    });
    expect((renderFailure as Error).message).not.toContain(renderError.message);
    expect(renderAdapter.dispose).toHaveBeenCalledTimes(1);

    const blobError = new Error("private blob details");
    const blobAdapter = createAdapter();
    blobAdapter.toBlob = vi.fn(async () => {
      throw blobError;
    });
    const blobFactory: ExportCanvasFactory = {
      create: vi.fn(() => blobAdapter),
    };
    const blobFailure = await exportCardPng(
      document,
      template,
      createOptions(blobFactory, createRender()),
    ).catch((error: unknown) => error);
    expect(blobFailure).toBeInstanceOf(CardExportError);
    expect(blobFailure).toMatchObject({
      code: "render-failed",
      message: "图片导出失败，请重试。",
      cause: blobError,
    });
    expect(blobAdapter.dispose).toHaveBeenCalledTimes(1);
  });

  it("rejects null or non-PNG blobs and preserves primary errors on cleanup failure", async () => {
    for (const blob of [null, createBlob("image/jpeg")]) {
      const adapter = createAdapter(blob);
      const factory: ExportCanvasFactory = {
        create: vi.fn(() => adapter),
      };
      const failure = await exportCardPng(
        createDocument(),
        createTemplate(),
        createOptions(factory, createRender()),
      ).catch((error: unknown) => error);
      expect(failure).toBeInstanceOf(CardExportError);
      expect(failure).toMatchObject({
        code: "render-failed",
        message: "图片导出失败，请重试。",
      });
      expect(adapter.dispose).toHaveBeenCalledTimes(1);
    }

    const disposalError = new Error("private disposal details");
    const disposalAdapter = createAdapter();
    disposalAdapter.dispose = vi.fn(async () => {
      throw disposalError;
    });
    const disposalFailure = await exportCardPng(
      createDocument(),
      createTemplate(),
      createOptions({ create: vi.fn(() => disposalAdapter) }, createRender()),
    ).catch((error: unknown) => error);
    expect(disposalFailure).toBeInstanceOf(CardExportError);
    expect(disposalFailure).toMatchObject({
      code: "render-failed",
      message: "图片导出失败，请重试。",
      cause: disposalError,
    });

    const renderError = new Error("primary render details");
    const combinedAdapter = createAdapter();
    combinedAdapter.dispose = vi.fn(async () => {
      throw disposalError;
    });
    const combinedRender = createRender();
    combinedRender.mockRejectedValue(renderError);
    const combinedFailure = await exportCardPng(
      createDocument(),
      createTemplate(),
      createOptions({ create: vi.fn(() => combinedAdapter) }, combinedRender),
    ).catch((error: unknown) => error);
    expect(combinedFailure).toBeInstanceOf(CardExportError);
    expect(combinedFailure).toMatchObject({
      code: "render-failed",
      message: "图片导出失败，请重试。",
      cause: renderError,
    });
  });

  it("creates a fresh adapter for consecutive exports without mutating inputs", async () => {
    const firstAdapter = createAdapter();
    const secondAdapter = createAdapter();
    const factory: ExportCanvasFactory = {
      create: vi
        .fn<ExportCanvasFactory["create"]>()
        .mockReturnValueOnce(firstAdapter)
        .mockReturnValueOnce(secondAdapter),
    };
    const render = createRender();
    const document = createDocument();
    const template = createTemplate();
    const documentSnapshot = JSON.stringify(document);
    const templateSnapshot = JSON.stringify(template);

    await exportCardPng(
      Object.freeze(document),
      Object.freeze(template),
      createOptions(factory, render),
    );
    await exportCardPng(document, template, createOptions(factory, render));

    expect(factory.create).toHaveBeenCalledTimes(2);
    expect(render).toHaveBeenCalledTimes(2);
    expect(render.mock.calls[0]?.[1]).toBe(document);
    expect(render.mock.calls[1]?.[1]).toBe(document);
    expect(JSON.stringify(document)).toBe(documentSnapshot);
    expect(JSON.stringify(template)).toBe(templateSnapshot);
  });

  it("short-circuits injected resources and resolves each omitted default once", async () => {
    vi.resetModules();
    const defaultAssets = createAssets();
    const defaultMeasure = vi.fn<TextMeasurer>(() => 100);
    const createBrowserAssetLoader = vi.fn(() => defaultAssets);
    const createBrowserTextMeasurer = vi.fn(() => defaultMeasure);
    vi.doMock("@/fabric/browserResources", () => ({
      createBrowserAssetLoader,
      createBrowserTextMeasurer,
    }));

    try {
      const imported = await import("@/fabric/exportCard");
      const adapter = createAdapter();
      const factory: ExportCanvasFactory = {
        create: vi.fn(() => adapter),
      };
      const render = createRender();
      const injectedAssets = createAssets();
      const injectedMeasure = vi.fn<TextMeasurer>(() => 100);

      await imported.exportCardPng(
        createDocument(),
        createTemplate(),
        createOptions(factory, render, injectedAssets, injectedMeasure),
      );
      expect(createBrowserAssetLoader).not.toHaveBeenCalled();
      expect(createBrowserTextMeasurer).not.toHaveBeenCalled();
      expect(injectedAssets.loadImage).not.toHaveBeenCalled();
      expect(injectedAssets.waitForFonts).not.toHaveBeenCalled();
      expect(injectedMeasure).not.toHaveBeenCalled();

      await imported.exportCardPng(createDocument(), createTemplate(), {
        factory,
        render,
      });
      expect(createBrowserAssetLoader).toHaveBeenCalledTimes(1);
      expect(createBrowserTextMeasurer).toHaveBeenCalledTimes(1);
      expect(defaultAssets.loadImage).not.toHaveBeenCalled();
      expect(defaultAssets.waitForFonts).not.toHaveBeenCalled();
      expect(defaultMeasure).not.toHaveBeenCalled();
    } finally {
      vi.doUnmock("@/fabric/browserResources");
      vi.resetModules();
    }
  });
});
