import { describe, expect, it, vi } from "vitest";

import type { Canvas, FabricObject } from "fabric";
import {
  createEditorCanvas,
  type InteractiveCanvasFactory,
} from "@/fabric/createEditorCanvas";

const makeRawCanvas = () => {
  const rawMethods = {
    clear: vi.fn<Canvas["clear"]>(),
    add: vi.fn<Canvas["add"]>(() => 0),
    remove: vi.fn<Canvas["remove"]>(() => []),
    requestRenderAll: vi.fn<Canvas["requestRenderAll"]>(),
    discardActiveObject: vi.fn<Canvas["discardActiveObject"]>(),
    dispose: vi.fn<Canvas["dispose"]>(async () => true),
  };

  return {
    raw: rawMethods as unknown as Canvas,
    methods: rawMethods,
  };
};

describe("createEditorCanvas", () => {
  it("constructs a 960 by 640 interactive canvas with exact options", () => {
    const { raw } = makeRawCanvas();
    const element = document.createElement("canvas");
    const factory = vi.fn<InteractiveCanvasFactory>(() => raw);

    const adapter = createEditorCanvas(element, factory);

    expect(factory).toHaveBeenCalledTimes(1);
    expect(factory).toHaveBeenCalledWith(element, {
      width: 960,
      height: 640,
      preserveObjectStacking: true,
      uniformScaling: true,
      selection: true,
      renderOnAddRemove: false,
    });
    expect(adapter.raw).toBe(raw);
    expect(adapter.width).toBe(960);
    expect(adapter.height).toBe(640);
  });

  it("forwards canvas operations once and erases Fabric return values", () => {
    const { raw, methods } = makeRawCanvas();
    const factory = vi.fn<InteractiveCanvasFactory>(() => raw);
    const adapter = createEditorCanvas(
      document.createElement("canvas"),
      factory,
    );
    const firstObject = {} as FabricObject;
    const secondObject = {} as FabricObject;

    expect(adapter.clear()).toBeUndefined();
    expect(adapter.add(firstObject, secondObject)).toBeUndefined();
    expect(adapter.remove(firstObject, secondObject)).toBeUndefined();
    expect(adapter.requestRenderAll()).toBeUndefined();
    expect(adapter.discardActiveObject()).toBeUndefined();

    expect(methods.clear).toHaveBeenCalledTimes(1);
    expect(methods.add).toHaveBeenCalledTimes(1);
    expect(methods.add).toHaveBeenCalledWith(firstObject, secondObject);
    expect(methods.remove).toHaveBeenCalledTimes(1);
    expect(methods.remove).toHaveBeenCalledWith(firstObject, secondObject);
    expect(methods.requestRenderAll).toHaveBeenCalledTimes(1);
    expect(methods.discardActiveObject).toHaveBeenCalledTimes(1);
  });

  it("shares one in-flight and completed asynchronous dispose promise", async () => {
    const { raw, methods } = makeRawCanvas();
    let resolveDispose: (value: boolean) => void = () => undefined;
    const pendingDispose = new Promise<boolean>((resolve) => {
      resolveDispose = resolve;
    });
    methods.dispose.mockImplementation(() => pendingDispose);
    const adapter = createEditorCanvas(
      document.createElement("canvas"),
      vi.fn<InteractiveCanvasFactory>(() => raw),
    );

    const first = adapter.dispose();
    const second = adapter.dispose();

    expect(first).toBeInstanceOf(Promise);
    expect(second).toBe(first);
    expect(methods.dispose).toHaveBeenCalledTimes(1);

    resolveDispose(true);
    expect(await first).toBeUndefined();

    const third = adapter.dispose();
    expect(third).toBe(first);
    expect(methods.dispose).toHaveBeenCalledTimes(1);
  });

  it("rejects nullish elements before invoking the factory", () => {
    const factory = vi.fn<InteractiveCanvasFactory>();

    expect(() =>
      createEditorCanvas(null as unknown as HTMLCanvasElement, factory),
    ).toThrow(TypeError);
    expect(() =>
      createEditorCanvas(undefined as unknown as HTMLCanvasElement, factory),
    ).toThrow(TypeError);

    expect(factory).not.toHaveBeenCalled();
  });
});
