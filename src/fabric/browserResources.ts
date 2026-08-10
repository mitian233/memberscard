import { FabricImage } from "fabric";

import type {
  CardDocument,
  CardTemplateDefinition,
  ResourceStatus,
} from "@/types/card";
import type { AssetLoader, TextMeasurer } from "./types";

const FONT_FALLBACK_MESSAGE = "字体加载失败，已使用系统字体。";

export class CardImageLoadError extends Error {
  readonly source: string;

  constructor(source: string, message: string, cause?: unknown) {
    super(message, { cause });
    this.name = "CardImageLoadError";
    this.source = source;
  }
}

export interface BrowserResourceEnvironment {
  readonly fonts?: Pick<FontFaceSet, "load">;
  createMeasurementContext(): Pick<
    CanvasRenderingContext2D,
    "font" | "measureText"
  > | null;
  loadFabricImage(source: string): Promise<FabricImage>;
}

function escapeCssFamily(family: string): string {
  return family.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

function cssFamily(family?: string): string {
  return family === undefined ? "sans-serif" : `"${escapeCssFamily(family)}"`;
}

function createDefaultEnvironment(): BrowserResourceEnvironment {
  return {
    get fonts() {
      if (typeof document === "undefined") return undefined;
      return document.fonts;
    },
    createMeasurementContext() {
      if (typeof document === "undefined") return null;
      return document.createElement("canvas").getContext("2d");
    },
    loadFabricImage(source: string) {
      return FabricImage.fromURL(source, { crossOrigin: "anonymous" });
    },
  };
}

function degradedFontStatus(): Extract<ResourceStatus, { state: "degraded" }> {
  return {
    state: "degraded",
    code: "font-fallback",
    message: FONT_FALLBACK_MESSAGE,
  };
}

function readyStatus(): Extract<ResourceStatus, { state: "ready" }> {
  return { state: "ready" };
}

function uniqueFamilies(families: readonly string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const family of families) {
    const trimmed = family.trim();
    if (trimmed === "" || seen.has(trimmed)) continue;
    seen.add(trimmed);
    unique.push(trimmed);
  }
  return unique;
}

export function createBrowserAssetLoader(
  environment?: BrowserResourceEnvironment,
): AssetLoader {
  const resolvedEnvironment = environment ?? createDefaultEnvironment();

  async function loadImage(source: string): Promise<FabricImage> {
    if (source.trim() === "") {
      throw new TypeError("Image source must not be empty.");
    }

    try {
      return await resolvedEnvironment.loadFabricImage(source);
    } catch (error) {
      const detail =
        error instanceof Error && error.message ? `: ${error.message}` : "";
      throw new CardImageLoadError(
        source,
        `Failed to load image "${source}"${detail}`,
        error,
      );
    }
  }

  async function waitForFonts(
    families: readonly string[],
  ): Promise<ResourceStatus> {
    const unique = uniqueFamilies(families);
    if (unique.length === 0) return readyStatus();

    const fonts = resolvedEnvironment.fonts;
    if (!fonts) return degradedFontStatus();

    const loads = unique.map((family) => {
      const shorthand = `1em ${cssFamily(family)}`;
      try {
        return Promise.resolve(fonts.load(shorthand));
      } catch (error) {
        return Promise.reject(error);
      }
    });
    const results = await Promise.allSettled(loads);
    const loaded = results.every(
      (result) => result.status === "fulfilled" && result.value.length > 0,
    );
    return loaded ? readyStatus() : degradedFontStatus();
  }

  return { loadImage, waitForFonts };
}

export function createBrowserTextMeasurer(
  environment?: Pick<BrowserResourceEnvironment, "createMeasurementContext">,
): TextMeasurer {
  const createMeasurementContext =
    environment?.createMeasurementContext ??
    createDefaultEnvironment().createMeasurementContext;
  let context:
    Pick<CanvasRenderingContext2D, "font" | "measureText"> | null | undefined;

  return (text, options) => {
    if (!Number.isFinite(options.fontSize) || options.fontSize <= 0) {
      throw new RangeError("fontSize must be a finite positive number.");
    }

    const family = options.fontFamily?.trim();
    if (options.fontFamily !== undefined && family === "") {
      throw new RangeError("fontFamily must not be empty.");
    }

    if (context === undefined) context = createMeasurementContext();
    if (context === null) {
      throw new Error("A 2D measurement context is unavailable.");
    }

    const fontWeight = options.fontWeight?.trim() || "normal";
    context.font = `${fontWeight} ${options.fontSize}px ${cssFamily(family)}`;
    const width = context.measureText(text).width;
    if (!Number.isFinite(width) || width < 0) {
      throw new RangeError(
        "Measured text width must be finite and non-negative.",
      );
    }
    return width;
  };
}

function errorStatus(
  code: Extract<ResourceStatus, { state: "error" }>["code"],
  message: string,
  recoverable: boolean,
): Extract<ResourceStatus, { state: "error" }> {
  return { state: "error", code, recoverable, message };
}

function isKnownTemplateImageSource(
  source: string,
  template: CardTemplateDefinition,
): boolean {
  const knownSources = new Set<string>([template.assets.background]);
  if (template.assets.avatarFrame !== undefined) {
    knownSources.add(template.assets.avatarFrame);
  }
  for (const object of template.staticObjects) {
    if (object.type !== "image") continue;
    const assetSource = template.assets[object.asset];
    if (assetSource !== undefined) knownSources.add(assetSource);
  }
  return knownSources.has(source);
}

export function classifyCardResourceError(
  error: unknown,
  document: CardDocument,
  template: CardTemplateDefinition,
): Extract<ResourceStatus, { state: "error" }> {
  if (error instanceof CardImageLoadError) {
    if (error.source === document.avatar.src) {
      return errorStatus(
        "avatar-load-failed",
        "头像加载失败，请重新选择图片。",
        true,
      );
    }
    if (error.source === template.assets.logo) {
      return errorStatus(
        "logo-load-failed",
        "标志资源加载失败，请刷新后重试。",
        false,
      );
    }
    if (isKnownTemplateImageSource(error.source, template)) {
      return errorStatus(
        "background-load-failed",
        "卡片背景加载失败，请刷新后重试。",
        false,
      );
    }
  }

  return errorStatus(
    "font-load-failed",
    "字体或渲染资源加载失败，请刷新后重试。",
    true,
  );
}
