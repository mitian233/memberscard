import type { FabricImage, FabricObject, IText } from "fabric";
import { describe, expect, it, vi } from "vitest";

import {
  bindSelectionEvents,
  type SelectionCanvas,
} from "@/fabric/bindSelectionEvents";
import type { FabricCardScene } from "@/fabric/types";
import type { CardField, EditorSelection } from "@/types/card";

type SelectionEventName =
  "selection:created" | "selection:updated" | "selection:cleared";
type SelectionHandler = () => void;

interface FakeCanvas {
  canvas: SelectionCanvas;
  on: ReturnType<typeof vi.fn>;
  disposers: Map<SelectionEventName, ReturnType<typeof vi.fn>>;
  setActiveObject(object: FabricObject | undefined): void;
  fire(eventName: SelectionEventName): void;
}

function createCanvas(): FakeCanvas {
  let activeObject: FabricObject | undefined;
  const handlers = new Map<SelectionEventName, SelectionHandler>();
  const disposers = new Map<SelectionEventName, ReturnType<typeof vi.fn>>();
  const on = vi.fn(
    (eventName: SelectionEventName, handler: SelectionHandler) => {
      handlers.set(eventName, handler);
      const disposer = vi.fn();
      disposers.set(eventName, disposer);
      return disposer;
    },
  );
  const getActiveObject = vi.fn(() => activeObject);
  const canvas = {
    on: on as unknown as SelectionCanvas["on"],
    getActiveObject:
      getActiveObject as unknown as SelectionCanvas["getActiveObject"],
  } as SelectionCanvas;

  return {
    canvas,
    on,
    disposers,
    setActiveObject(object) {
      activeObject = object;
    },
    fire(eventName) {
      handlers.get(eventName)?.();
    },
  };
}

function createScene(): Pick<FabricCardScene, "avatar" | "fields"> {
  return {
    avatar: {} as FabricImage,
    fields: {
      name: {} as IText,
      nameEn: {} as IText,
      bandName: {} as IText,
      birthday: {} as IText,
    },
  };
}

function expectSelection(
  onSelectionChange: ReturnType<typeof vi.fn>,
  expected: EditorSelection,
): void {
  expect(onSelectionChange).toHaveBeenLastCalledWith(expected);
}

describe("bindSelectionEvents", () => {
  it("maps avatar created and updated events by exact identity", () => {
    const fake = createCanvas();
    const scene = createScene();
    const onSelectionChange = vi.fn();
    const disposer = bindSelectionEvents(fake.canvas, scene, {
      onSelectionChange,
    });

    expect(fake.on.mock.calls.map(([eventName]) => eventName)).toEqual([
      "selection:created",
      "selection:updated",
      "selection:cleared",
    ]);

    fake.setActiveObject(scene.avatar);
    fake.fire("selection:created");
    expectSelection(onSelectionChange, { type: "avatar" });

    fake.fire("selection:updated");
    expectSelection(onSelectionChange, { type: "avatar" });

    disposer();
  });

  it("maps every present field identity to its exact CardField", () => {
    const fake = createCanvas();
    const scene = createScene();
    const onSelectionChange = vi.fn();
    const disposer = bindSelectionEvents(fake.canvas, scene, {
      onSelectionChange,
    });

    for (const field of Object.keys(scene.fields) as CardField[]) {
      fake.setActiveObject(scene.fields[field]);
      fake.fire("selection:created");
      expectSelection(onSelectionChange, { type: "field", field });
    }

    disposer();
  });

  it("maps absent, unknown, and group-like active objects to none", () => {
    const fake = createCanvas();
    const scene = createScene();
    const onSelectionChange = vi.fn();
    const disposer = bindSelectionEvents(fake.canvas, scene, {
      onSelectionChange,
    });
    const unknownObject = {} as FabricObject;
    const groupLikeObject = { type: "activeSelection" } as FabricObject;

    for (const activeObject of [undefined, unknownObject, groupLikeObject]) {
      fake.setActiveObject(activeObject);
      fake.fire("selection:updated");
      expectSelection(onSelectionChange, { type: "none" });
    }

    disposer();
  });

  it("maps cleared to none without consulting a stale active object", () => {
    const fake = createCanvas();
    const scene = createScene();
    const onSelectionChange = vi.fn();
    const disposer = bindSelectionEvents(fake.canvas, scene, {
      onSelectionChange,
    });
    const getActiveObject = fake.canvas
      .getActiveObject as unknown as ReturnType<typeof vi.fn>;

    fake.setActiveObject(scene.avatar);
    fake.fire("selection:created");
    expect(getActiveObject).toHaveBeenCalledTimes(1);

    getActiveObject.mockImplementation(() => {
      throw new Error("cleared must not read a stale active object");
    });
    fake.fire("selection:cleared");
    expectSelection(onSelectionChange, { type: "none" });
    expect(getActiveObject).toHaveBeenCalledTimes(1);

    disposer();
  });

  it("disposes each event disposer once and makes stale handlers no-op", () => {
    const fake = createCanvas();
    const scene = createScene();
    const onSelectionChange = vi.fn();
    const disposer = bindSelectionEvents(fake.canvas, scene, {
      onSelectionChange,
    });

    disposer();
    disposer();

    expect(
      Array.from(fake.disposers.values()).map(
        (eventDisposer) => eventDisposer.mock.calls.length,
      ),
    ).toEqual([1, 1, 1]);

    fake.setActiveObject(scene.avatar);
    fake.fire("selection:created");
    fake.fire("selection:updated");
    fake.fire("selection:cleared");
    expect(onSelectionChange).not.toHaveBeenCalled();
  });
});
