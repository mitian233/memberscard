import { StaticCanvas } from "fabric";

import {
  createBrowserAssetLoader,
  createBrowserTextMeasurer,
} from "./browserResources";
import { renderCardDocument } from "./renderCardDocument";
import type {
  AssetLoader,
  ExportCanvasAdapter,
  ExportCanvasFactory,
  TextMeasurer,
} from "./types";
import type { CardDocument, CardTemplateDefinition } from "@/types/card";

const EXPORT_ERROR_MESSAGE = "图片导出失败，请重试。";

export class CardExportError extends Error {
  readonly code = "render-failed" as const;

  constructor(message = EXPORT_ERROR_MESSAGE, options?: ErrorOptions) {
    super(message, options);
    this.name = "CardExportError";
  }
}

export type StaticCanvasCreator = (
  width: number,
  height: number,
) => StaticCanvas;

function validateDimensions(width: number, height: number): void {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0
  ) {
    throw new RangeError("Canvas dimensions must be positive integers.");
  }
}

function createDefaultStaticCanvas(
  width: number,
  height: number,
): StaticCanvas {
  return new StaticCanvas(undefined, {
    width,
    height,
    renderOnAddRemove: false,
  });
}

type MaybeDiscardableCanvas = StaticCanvas & {
  discardActiveObject?: (...args: never[]) => unknown;
};

function discardActiveObject(raw: StaticCanvas): void {
  const candidate = raw as MaybeDiscardableCanvas;
  if (typeof candidate.discardActiveObject === "function") {
    candidate.discardActiveObject();
  }
}

export function createBrowserExportCanvasFactory(
  createRaw: StaticCanvasCreator = createDefaultStaticCanvas,
): ExportCanvasFactory {
  return {
    create(width, height) {
      validateDimensions(width, height);
      const raw = createRaw(width, height);
      let disposePromise: Promise<void> | undefined;

      return {
        raw,
        width,
        height,
        clear() {
          raw.clear();
        },
        add(...objects) {
          raw.add(...objects);
        },
        remove(...objects) {
          raw.remove(...objects);
        },
        requestRenderAll() {
          raw.requestRenderAll();
        },
        discardActiveObject() {
          discardActiveObject(raw);
        },
        toBlob(options) {
          return raw.toBlob(options);
        },
        dispose() {
          if (disposePromise === undefined) {
            try {
              disposePromise = Promise.resolve(raw.dispose()).then(
                () => undefined,
              );
            } catch (error) {
              disposePromise = Promise.reject(error);
            }
          }
          return disposePromise;
        },
      } satisfies ExportCanvasAdapter;
    },
  };
}

export interface ExportCardOptions {
  factory?: ExportCanvasFactory;
  assets?: AssetLoader;
  measureText?: TextMeasurer;
  render?: typeof renderCardDocument;
}

export async function exportCardPng(
  document: CardDocument,
  template: CardTemplateDefinition,
  options?: ExportCardOptions,
): Promise<Blob> {
  if (document.templateId !== template.id) {
    throw new RangeError(
      `Document template ${document.templateId} does not match template ${template.id}`,
    );
  }
  validateDimensions(template.canvas.width, template.canvas.height);

  let adapter: ExportCanvasAdapter | undefined;
  let result: Blob | undefined;
  let workFailed = false;
  let workError: unknown;
  let disposalError: unknown;

  try {
    const factory = options?.factory ?? createBrowserExportCanvasFactory();
    const assets = options?.assets ?? createBrowserAssetLoader();
    const measureText = options?.measureText ?? createBrowserTextMeasurer();
    const render = options?.render ?? renderCardDocument;

    adapter = factory.create(template.canvas.width, template.canvas.height);
    await render(adapter, document, template, {
      mode: "export",
      assets,
      measureText,
    });
    adapter.discardActiveObject();
    adapter.requestRenderAll();
    const blob = await adapter.toBlob({ format: "png", multiplier: 4 });
    if (
      blob === null ||
      typeof Blob === "undefined" ||
      !(blob instanceof Blob) ||
      blob.type !== "image/png"
    ) {
      throw new TypeError("Export did not produce a PNG Blob.");
    }
    result = blob;
  } catch (error) {
    workFailed = true;
    workError = error;
  } finally {
    if (adapter !== undefined) {
      try {
        await adapter.dispose();
      } catch (error) {
        disposalError = error;
      }
    }
  }

  if (workFailed || disposalError !== undefined) {
    throw new CardExportError(EXPORT_ERROR_MESSAGE, {
      cause: workFailed ? workError : disposalError,
    });
  }

  return result as Blob;
}
