import { Canvas } from "fabric";

import type { InteractiveCanvasAdapter } from "./types";

export type EditorCanvasOptions = NonNullable<
  ConstructorParameters<typeof Canvas>[1]
>;

export type InteractiveCanvasFactory = (
  element: HTMLCanvasElement,
  options: EditorCanvasOptions,
) => Canvas;

const LOGICAL_WIDTH = 960;
const LOGICAL_HEIGHT = 640;

const defaultFactory: InteractiveCanvasFactory = (element, options) =>
  new Canvas(element, options);

export function createEditorCanvas(
  element: HTMLCanvasElement,
  factory: InteractiveCanvasFactory = defaultFactory,
): InteractiveCanvasAdapter {
  if (element == null) {
    throw new TypeError("An HTMLCanvasElement is required");
  }

  const raw = factory(element, {
    width: LOGICAL_WIDTH,
    height: LOGICAL_HEIGHT,
    preserveObjectStacking: true,
    uniformScaling: true,
    selection: true,
    renderOnAddRemove: false,
  });

  let disposePromise: Promise<void> | undefined;

  return {
    raw,
    width: LOGICAL_WIDTH,
    height: LOGICAL_HEIGHT,
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
      raw.discardActiveObject();
    },
    dispose() {
      if (disposePromise === undefined) {
        disposePromise = raw.dispose().then(() => undefined);
      }
      return disposePromise;
    },
  };
}
