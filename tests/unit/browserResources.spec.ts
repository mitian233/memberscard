import { FabricImage } from "fabric";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCardDocument } from "@/editor/cardDocument";
import { currentCardTemplate } from "@/templates/currentCardTemplate";
import type { BrowserResourceEnvironment } from "@/fabric/browserResources";
import type { CardTemplateDefinition } from "@/types/card";

type BrowserResourcesModule = typeof import("@/fabric/browserResources");

let browserResources: BrowserResourcesModule | undefined;

async function getBrowserResources(): Promise<BrowserResourcesModule> {
  browserResources ??= await import("@/fabric/browserResources");
  return browserResources;
}

function imageEnvironment(
  overrides: Partial<BrowserResourceEnvironment> = {},
): BrowserResourceEnvironment {
  const image = {} as FabricImage;
  return {
    fonts: {
      load: vi.fn(async () => [{} as FontFace]),
    },
    createMeasurementContext: vi.fn(() => null),
    loadFabricImage: vi.fn(async () => image),
    ...overrides,
  };
}

function resourceStatus(
  error: unknown,
  document = createCardDocument(currentCardTemplate),
  template: CardTemplateDefinition = currentCardTemplate,
) {
  return getBrowserResources().then(({ classifyCardResourceError }) =>
    classifyCardResourceError(error, document, template),
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("browser Fabric resources", () => {
  it("imports without DOM work and defers the injected measurement context until measurement", async () => {
    const createElement = vi.spyOn(document, "createElement");
    const imported = await import("@/fabric/browserResources");
    browserResources = imported;
    const createMeasurementContext = vi.fn(() => null);

    imported.createBrowserTextMeasurer({ createMeasurementContext });

    expect(createElement).not.toHaveBeenCalled();
    expect(createMeasurementContext).not.toHaveBeenCalled();
  });

  it("loads images through public FabricImage.fromURL and preserves the returned instance", async () => {
    const imported = await getBrowserResources();
    const image = {} as FabricImage;
    const fromURL = vi
      .spyOn(FabricImage, "fromURL")
      .mockResolvedValue(image as never);
    const loader = imported.createBrowserAssetLoader();

    await expect(loader.loadImage("/card.svg")).resolves.toBe(image);
    expect(fromURL).toHaveBeenCalledWith("/card.svg", {
      crossOrigin: "anonymous",
    });
  });

  it("rejects blank sources before the injected image loader and wraps sync and async failures with cause", async () => {
    const imported = await getBrowserResources();
    const syncCause = new Error("sync failure");
    const syncLoad = vi.fn<BrowserResourceEnvironment["loadFabricImage"]>(
      () => {
        throw syncCause;
      },
    );
    const syncLoader = imported.createBrowserAssetLoader(
      imageEnvironment({ loadFabricImage: syncLoad }),
    );

    await expect(syncLoader.loadImage(" \t")).rejects.toBeInstanceOf(TypeError);
    expect(syncLoad).not.toHaveBeenCalled();

    const syncFailure = syncLoader.loadImage(" avatar.png");
    await expect(syncFailure).rejects.toMatchObject({
      source: " avatar.png",
      cause: syncCause,
    });
    await expect(syncFailure).rejects.toThrow(/avatar\.png/);

    const asyncCause = { code: "network" };
    const asyncLoad = vi.fn<BrowserResourceEnvironment["loadFabricImage"]>(
      async () => {
        throw asyncCause;
      },
    );
    const asyncLoader = imported.createBrowserAssetLoader(
      imageEnvironment({ loadFabricImage: asyncLoad }),
    );
    const asyncFailure = asyncLoader.loadImage("/remote.png");

    await expect(asyncFailure).rejects.toMatchObject({
      source: "/remote.png",
      cause: asyncCause,
    });
    await expect(asyncFailure).rejects.toBeInstanceOf(Error);
  });

  it("deduplicates trimmed font families in first-seen order and escapes CSS quotes and slashes", async () => {
    const imported = await getBrowserResources();
    const load = vi.fn(async () => [{} as FontFace]);
    const loader = imported.createBrowserAssetLoader(
      imageEnvironment({ fonts: { load } }),
    );

    await expect(
      loader.waitForFonts([" Poppins ", "", "Poppins", 'A"B\\C', ' A"B\\C ']),
    ).resolves.toEqual({ state: "ready" });
    expect(load.mock.calls.map(([font]) => font)).toEqual([
      '1em "Poppins"',
      '1em "A\\"B\\\\C"',
    ]);
  });

  it("returns ready without FontFaceSet work for no families and degrades every fallback path", async () => {
    const imported = await getBrowserResources();
    const load = vi.fn(async () => [{} as FontFace]);
    const noFamilies = imported.createBrowserAssetLoader(
      imageEnvironment({ fonts: { load } }),
    );
    await expect(noFamilies.waitForFonts([" ", ""])).resolves.toEqual({
      state: "ready",
    });
    expect(load).not.toHaveBeenCalled();

    const degradedMessage = "字体加载失败，已使用系统字体。";
    const missingFonts = imported.createBrowserAssetLoader(
      imageEnvironment({ fonts: undefined }),
    );
    await expect(missingFonts.waitForFonts(["Poppins"])).resolves.toEqual({
      state: "degraded",
      code: "font-fallback",
      message: degradedMessage,
    });

    const rejectingFonts = imported.createBrowserAssetLoader(
      imageEnvironment({
        fonts: {
          load: vi.fn(async () => {
            throw new Error("font failure");
          }),
        },
      }),
    );
    await expect(rejectingFonts.waitForFonts(["Poppins"])).resolves.toEqual({
      state: "degraded",
      code: "font-fallback",
      message: degradedMessage,
    });

    const emptyFonts = imported.createBrowserAssetLoader(
      imageEnvironment({ fonts: { load: vi.fn(async () => []) } }),
    );
    await expect(emptyFonts.waitForFonts(["Poppins"])).resolves.toEqual({
      state: "degraded",
      code: "font-fallback",
      message: degradedMessage,
    });
  });

  it("lazily caches one measurement context and sets escaped safe font strings on every call", async () => {
    const imported = await getBrowserResources();
    const context = {
      font: "",
      measureText: vi.fn(
        (text: string) => ({ width: text.length * 2 }) as TextMetrics,
      ),
    } satisfies Pick<CanvasRenderingContext2D, "font" | "measureText">;
    const createMeasurementContext = vi.fn(() => context);
    const measure = imported.createBrowserTextMeasurer({
      createMeasurementContext,
    });

    expect(createMeasurementContext).not.toHaveBeenCalled();
    expect(
      measure("abc", {
        fontSize: 20,
        fontFamily: 'A"B\\C',
        fontWeight: "bold",
      }),
    ).toBe(6);
    expect(createMeasurementContext).toHaveBeenCalledTimes(1);
    expect(context.font).toBe('bold 20px "A\\"B\\\\C"');

    expect(measure("xy", { fontSize: 12 })).toBe(4);
    expect(createMeasurementContext).toHaveBeenCalledTimes(1);
    expect(context.font).toBe("normal 12px sans-serif");
    expect(context.measureText).toHaveBeenCalledTimes(2);
  });

  it("validates measurement options and rejects missing contexts and invalid widths", async () => {
    const imported = await getBrowserResources();
    const createMeasurementContext = vi.fn(() => null);
    const measure = imported.createBrowserTextMeasurer({
      createMeasurementContext,
    });

    expect(() => measure("x", { fontSize: 0 })).toThrow(RangeError);
    expect(() => measure("x", { fontSize: Number.NaN })).toThrow(RangeError);
    expect(() => measure("x", { fontSize: 12, fontFamily: "  " })).toThrow(
      RangeError,
    );
    expect(createMeasurementContext).not.toHaveBeenCalled();
    expect(() => measure("x", { fontSize: 12 })).toThrow(Error);
    expect(createMeasurementContext).toHaveBeenCalledTimes(1);
    expect(() => measure("x", { fontSize: 12 })).toThrow(Error);
    expect(createMeasurementContext).toHaveBeenCalledTimes(1);

    for (const width of [Number.NaN, -1]) {
      const badContext = {
        font: "",
        measureText: () => ({ width }) as TextMetrics,
      } satisfies Pick<CanvasRenderingContext2D, "font" | "measureText">;
      const badMeasure = imported.createBrowserTextMeasurer({
        createMeasurementContext: () => badContext,
      });
      expect(() => badMeasure("x", { fontSize: 12 })).toThrow(RangeError);
    }
  });

  it("classifies avatar, logo, background/static image, and unknown errors with fresh safe statuses", async () => {
    const imported = await getBrowserResources();
    const document = createCardDocument(currentCardTemplate);
    const avatarError = new imported.CardImageLoadError(
      document.avatar.src,
      "raw avatar failure",
    );
    const logoError = new imported.CardImageLoadError(
      currentCardTemplate.assets.logo,
      "raw logo failure",
    );
    const backgroundError = new imported.CardImageLoadError(
      currentCardTemplate.assets.background,
      "raw background failure",
    );
    const frameError = new imported.CardImageLoadError(
      currentCardTemplate.assets.avatarFrame ?? "",
      "raw frame failure",
    );

    await expect(resourceStatus(avatarError)).resolves.toEqual({
      state: "error",
      code: "avatar-load-failed",
      recoverable: true,
      message: "头像加载失败，请重新选择图片。",
    });
    await expect(resourceStatus(logoError)).resolves.toEqual({
      state: "error",
      code: "logo-load-failed",
      recoverable: false,
      message: "标志资源加载失败，请刷新后重试。",
    });
    await expect(resourceStatus(backgroundError)).resolves.toEqual({
      state: "error",
      code: "background-load-failed",
      recoverable: false,
      message: "卡片背景加载失败，请刷新后重试。",
    });
    await expect(resourceStatus(frameError)).resolves.toEqual({
      state: "error",
      code: "background-load-failed",
      recoverable: false,
      message: "卡片背景加载失败，请刷新后重试。",
    });

    const unknown = new imported.CardImageLoadError(
      "unknown.png",
      "secret raw text",
    );
    const first = await resourceStatus(unknown);
    const second = await resourceStatus(new Error("secret raw text"));
    expect(first).toEqual({
      state: "error",
      code: "font-load-failed",
      recoverable: true,
      message: "字体或渲染资源加载失败，请刷新后重试。",
    });
    expect(second).toEqual(first);
    expect(second).not.toBe(first);
    expect(JSON.stringify(second)).not.toContain("secret raw text");
  });
});
