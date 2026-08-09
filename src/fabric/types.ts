import type {
  Canvas,
  FabricImage,
  FabricObject,
  IText,
  StaticCanvas,
} from "fabric";

import type {
  CardField,
  FieldValidationError,
  ResourceStatus,
} from "@/types/card";

export interface CanvasAdapter {
  readonly raw: Canvas | StaticCanvas;
  readonly width: number;
  readonly height: number;
  clear(): void;
  add(...objects: FabricObject[]): void;
  remove(...objects: FabricObject[]): void;
  requestRenderAll(): void;
  discardActiveObject(): void;
  dispose(): void | Promise<void>;
}

export interface ExportCanvasAdapter extends CanvasAdapter {
  readonly raw: StaticCanvas;
  toBlob(options: { format: "png"; multiplier: number }): Promise<Blob | null>;
}

export interface ExportCanvasFactory {
  create(width: number, height: number): ExportCanvasAdapter;
}

export interface AssetLoader {
  loadImage(src: string): Promise<FabricImage>;
  waitForFonts(families: readonly string[]): Promise<ResourceStatus>;
}

export interface TextMeasureOptions {
  fontSize: number;
  fontFamily?: string;
  fontWeight?: string;
}

export type TextMeasurer = (
  text: string,
  options: TextMeasureOptions,
) => number;

export interface FabricCardScene {
  avatar: FabricImage;
  fields: Partial<Record<CardField, IText>>;
  objects: FabricObject[];
  resourceStatus: ResourceStatus;
  fieldErrors: FieldValidationError[];
  disposeObjectListeners(): void;
}

export interface RenderCardOptions {
  mode: "interactive" | "export";
  assets: AssetLoader;
  measureText: TextMeasurer;
}
