import { FabricImage } from "fabric";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createCardDocument } from "@/editor/cardDocument";
import { renderCardDocument } from "@/fabric/renderCardDocument";
import type {
  AssetLoader,
  CanvasAdapter,
  RenderCardOptions,
} from "@/fabric/types";
import { currentCardTemplate } from "@/templates/currentCardTemplate";
import { legacyCardTemplate } from "@/templates/legacyCardTemplate";
import type { CardTemplateDefinition } from "@/types/card";

function createMeasuringContext(): CanvasRenderingContext2D {
  return {
    measureText: (value: string) => ({ width: value.length * 10 }),
  } as unknown as CanvasRenderingContext2D;
}

interface FakeCanvas {
  adapter: CanvasAdapter;
  added: object[];
  calls: string[];
}

function createCanvas(): FakeCanvas {
  const added: object[] = [];
  const calls: string[] = [];
  const adapter = {
    raw: {} as CanvasAdapter["raw"],
    width: 960,
    height: 640,
    clear: vi.fn(() => calls.push("clear")),
    add: vi.fn((...objects: object[]) => {
      calls.push("add");
      added.push(...objects);
    }),
    remove: vi.fn(),
    requestRenderAll: vi.fn(() => calls.push("render")),
    discardActiveObject: vi.fn(() => calls.push("discard")),
    dispose: vi.fn(),
  } satisfies CanvasAdapter;

  return { adapter, added, calls };
}

interface FakeAssets extends AssetLoader {
  loaded: FabricImage[];
  sources: string[];
}

function createAssets(): FakeAssets {
  const loaded: FabricImage[] = [];
  const sources: string[] = [];
  const assets: FakeAssets = {
    loaded,
    sources,
    loadImage: vi.fn(async (source: string) => {
      sources.push(source);
      const element = document.createElement("img");
      element.width = 400;
      element.height = 300;
      const image = new FabricImage(element);
      vi.spyOn(image, "dispose");
      loaded.push(image);
      return image;
    }),
    waitForFonts: vi.fn(async () => ({ state: "ready" as const })),
  };
  return assets;
}

function createOptions(
  assets: AssetLoader,
  mode: RenderCardOptions["mode"] = "interactive",
): RenderCardOptions {
  return {
    mode,
    assets,
    measureText: vi.fn((text, options) => text.length * options.fontSize),
  };
}

function roles(
  scene: Awaited<ReturnType<typeof renderCardDocument>>,
): string[] {
  return scene.objects.map((object) => {
    const data = object.data as
      | { role: "static"; id: string }
      | { role: "field"; field: string }
      | { role: "avatar" };
    if (data.role === "static") {
      return data.id;
    }
    if (data.role === "field") {
      return `field:${data.field}`;
    }
    return "avatar";
  });
}

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() =>
    createMeasuringContext(),
  );
});

describe("renderCardDocument", () => {
  it("renders the current template atomically with stable order and resources", async () => {
    const canvas = createCanvas();
    const assets = createAssets();
    const document = createCardDocument(currentCardTemplate);
    const documentBefore = structuredClone(document);
    const templateBefore = structuredClone(currentCardTemplate);

    const scene = await renderCardDocument(
      canvas.adapter,
      document,
      currentCardTemplate,
      createOptions(assets),
    );

    expect(roles(scene)).toEqual([
      "card",
      "background",
      "avatar-frame",
      "avatar",
      "title",
      "logo",
      "name-label-bg",
      "name-label",
      "band-label-bg",
      "band-label",
      "birthday-label-bg",
      "birthday-label",
      "field:name",
      "field:nameEn",
      "field:bandName",
      "field:birthday",
      "disclaimer-marker-1",
      "disclaimer-marker-2",
      "disclaimer-text-1",
      "disclaimer-text-2",
    ]);
    expect(assets.sources).toEqual([
      currentCardTemplate.assets.background,
      currentCardTemplate.assets.avatarFrame,
      currentCardTemplate.assets.logo,
      document.avatar.src,
    ]);
    expect(assets.waitForFonts).toHaveBeenCalledWith([
      "Noto Sans JP",
      "Poppins",
    ]);
    expect(scene.avatar).toBe(scene.objects[3]);
    expect(scene.fields.name).toBe(scene.objects[12]);
    expect(scene.resourceStatus).toEqual({ state: "ready" });
    expect(scene.fieldErrors).toEqual([]);
    expect(canvas.adapter.add).toHaveBeenCalledTimes(1);
    expect(canvas.adapter.requestRenderAll).toHaveBeenCalledTimes(1);
    expect(canvas.calls).toEqual(["discard", "clear", "add", "render"]);
    expect(document).toEqual(documentBefore);
    expect(currentCardTemplate).toEqual(templateBefore);
  });

  it("keeps legacy avatar insertion and template field insertion order", async () => {
    const canvas = createCanvas();
    const assets = createAssets();
    const document = createCardDocument(legacyCardTemplate);
    const scene = await renderCardDocument(
      canvas.adapter,
      document,
      legacyCardTemplate,
      createOptions(assets, "export"),
    );

    expect(roles(scene)).toEqual([
      "card",
      "background",
      "avatar-background",
      "avatar",
      "logo",
      "field:bandName",
      "field:name",
      "field:nameEn",
      "disclaimer-marker-1",
      "disclaimer-marker-2",
      "disclaimer-text-1",
      "disclaimer-text-2",
    ]);
    expect(scene.fields.birthday).toBeUndefined();
    expect(scene.fields.name?.selectable).toBe(false);
    expect(scene.fields.name?.evented).toBe(false);
    expect(scene.avatar.selectable).toBe(false);
    expect(scene.avatar.evented).toBe(false);
  });

  it("fits fields with the injected measurer and reports invalid fields", async () => {
    const canvas = createCanvas();
    const assets = createAssets();
    const template: CardTemplateDefinition = {
      ...legacyCardTemplate,
      fields: {
        name: {
          ...legacyCardTemplate.fields.name!,
          minSize: 20,
          maxWidth: 50,
        },
      },
      staticObjects: [legacyCardTemplate.staticObjects[0]],
    };
    const document = {
      ...createCardDocument(template),
      name: "too-wide",
    };
    const options = createOptions(assets);
    options.measureText = vi.fn((_text, value) => value.fontSize * 10);

    const scene = await renderCardDocument(
      canvas.adapter,
      document,
      template,
      options,
    );

    expect(scene.fields.name?.fontSize).toBe(20);
    expect(scene.fieldErrors).toEqual([
      {
        field: "name",
        code: "text-too-wide",
        message: "内容过长，请缩短后重试。",
      },
    ]);
    expect(options.measureText).toHaveBeenCalled();
  });

  it("disposes the previous scene once after a successful replacement", async () => {
    const canvas = createCanvas();
    const assets = createAssets();
    const document = createCardDocument(currentCardTemplate);
    const first = await renderCardDocument(
      canvas.adapter,
      document,
      currentCardTemplate,
      createOptions(assets),
    );
    const disposeSpies = first.objects.map((object) =>
      vi.spyOn(object, "dispose"),
    );
    const listenerSpy = vi.spyOn(first, "disposeObjectListeners");

    await renderCardDocument(
      canvas.adapter,
      document,
      currentCardTemplate,
      createOptions(createAssets()),
    );

    expect(listenerSpy).toHaveBeenCalledTimes(1);
    for (const spy of disposeSpies) {
      expect(spy).toHaveBeenCalledTimes(1);
    }
    expect(canvas.adapter.clear).toHaveBeenCalledTimes(2);
    expect(canvas.adapter.add).toHaveBeenCalledTimes(2);
    expect(canvas.adapter.requestRenderAll).toHaveBeenCalledTimes(2);
  });

  it("preserves the current canvas and disposes successful resources on load failure", async () => {
    const canvas = createCanvas();
    const firstAssets = createAssets();
    const document = createCardDocument(currentCardTemplate);
    const first = await renderCardDocument(
      canvas.adapter,
      document,
      currentCardTemplate,
      createOptions(firstAssets),
    );
    const addCount = canvas.adapter.add.mock.calls.length;
    const clearCount = canvas.adapter.clear.mock.calls.length;
    const nextAssets = createAssets();
    const failure = new Error("logo failed");
    let call = 0;
    nextAssets.loadImage = vi.fn(async (source: string) => {
      call += 1;
      if (call === 2) {
        throw failure;
      }
      nextAssets.sources.push(source);
      const image = new FabricImage(globalThis.document.createElement("img"));
      vi.spyOn(image, "dispose");
      nextAssets.loaded.push(image);
      return image;
    });

    await expect(
      renderCardDocument(
        canvas.adapter,
        document,
        currentCardTemplate,
        createOptions(nextAssets),
      ),
    ).rejects.toBe(failure);

    expect(canvas.adapter.add).toHaveBeenCalledTimes(addCount);
    expect(canvas.adapter.clear).toHaveBeenCalledTimes(clearCount);
    expect(first.objects[0].data).toEqual({ role: "static", id: "card" });
    for (const image of nextAssets.loaded) {
      expect(image.dispose).toHaveBeenCalledTimes(1);
    }
  });

  it("rejects missing optional assets without touching the previous scene", async () => {
    const canvas = createCanvas();
    const assets = createAssets();
    const document = createCardDocument(currentCardTemplate);
    const first = await renderCardDocument(
      canvas.adapter,
      document,
      currentCardTemplate,
      createOptions(assets),
    );
    const templateWithoutFrame: CardTemplateDefinition = {
      ...currentCardTemplate,
      assets: { ...currentCardTemplate.assets, avatarFrame: undefined },
    };
    const loadCalls = assets.loadImage.mock.calls.length;
    const clearCalls = canvas.adapter.clear.mock.calls.length;

    await expect(
      renderCardDocument(
        canvas.adapter,
        document,
        templateWithoutFrame,
        createOptions(assets),
      ),
    ).rejects.toThrow(/avatar-frame.*avatarFrame/);

    expect(assets.loadImage).toHaveBeenCalledTimes(loadCalls);
    expect(canvas.adapter.clear).toHaveBeenCalledTimes(clearCalls);
    expect(canvas.adapter.add).toHaveBeenCalledTimes(1);
    expect(first.objects[0].data).toEqual({ role: "static", id: "card" });
  });

  it("preserves the previous canvas when scene construction fails", async () => {
    const canvas = createCanvas();
    const firstAssets = createAssets();
    const document = createCardDocument(legacyCardTemplate);
    const first = await renderCardDocument(
      canvas.adapter,
      document,
      legacyCardTemplate,
      createOptions(firstAssets),
    );
    const clearCalls = canvas.adapter.clear.mock.calls.length;
    const nextAssets = createAssets();
    const invalidTemplate: CardTemplateDefinition = {
      ...legacyCardTemplate,
      fields: {
        name: {
          ...legacyCardTemplate.fields.name!,
          minSize: 100,
          maxWidth: 10,
        },
      },
      staticObjects: [legacyCardTemplate.staticObjects[0]],
    };

    await expect(
      renderCardDocument(
        canvas.adapter,
        document,
        invalidTemplate,
        createOptions(nextAssets),
      ),
    ).rejects.toThrow(RangeError);

    expect(canvas.adapter.clear).toHaveBeenCalledTimes(clearCalls);
    expect(canvas.adapter.add).toHaveBeenCalledTimes(1);
    expect(first.objects[0].data).toEqual({ role: "static", id: "card" });
    for (const object of nextAssets.loaded) {
      expect(object.dispose).toHaveBeenCalledTimes(1);
    }
  });

  it("rejects mismatched templates before any loader or canvas operation", async () => {
    const canvas = createCanvas();
    const assets = createAssets();

    await expect(
      renderCardDocument(
        canvas.adapter,
        { ...createCardDocument(currentCardTemplate), templateId: "legacy" },
        currentCardTemplate,
        createOptions(assets),
      ),
    ).rejects.toThrow(RangeError);

    expect(assets.loadImage).not.toHaveBeenCalled();
    expect(assets.waitForFonts).not.toHaveBeenCalled();
    expect(canvas.adapter.clear).not.toHaveBeenCalled();
    expect(canvas.adapter.add).not.toHaveBeenCalled();
  });
});
