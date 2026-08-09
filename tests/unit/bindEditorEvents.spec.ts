import type { Canvas, FabricImage, IText } from "fabric";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  bindEditorEvents,
  type BindEditorEventsOptions,
} from "@/fabric/bindEditorEvents";
import type {
  FabricCardScene,
  InteractiveCanvasAdapter,
  TextMeasurer,
} from "@/fabric/types";
import type { CardTemplateDefinition } from "@/types/card";

const binderMocks = vi.hoisted(() => ({
  bindAvatarEvents: vi.fn(),
  bindAvatarPinchEvents: vi.fn(),
  bindTextEvents: vi.fn(),
  bindSelectionEvents: vi.fn(),
}));

vi.mock("@/fabric/bindAvatarEvents", () => ({
  bindAvatarEvents: binderMocks.bindAvatarEvents,
}));
vi.mock("@/fabric/bindAvatarPinchEvents", () => ({
  bindAvatarPinchEvents: binderMocks.bindAvatarPinchEvents,
}));
vi.mock("@/fabric/bindTextEvents", () => ({
  bindTextEvents: binderMocks.bindTextEvents,
}));
vi.mock("@/fabric/bindSelectionEvents", () => ({
  bindSelectionEvents: binderMocks.bindSelectionEvents,
}));

function createTemplate(): CardTemplateDefinition {
  return {
    id: "current",
    canvas: { width: 960, height: 640, radius: 0 },
    assets: { background: "/background.png", logo: "/logo.png" },
    defaults: {
      name: "name",
      nameEn: "nameEn",
      bandName: "bandName",
      birthday: "birthday",
      avatar: { src: "/avatar.png", left: 0, top: 0, scale: 1 },
    },
    avatarFrame: { left: 10, top: 20, width: 100, height: 80, radius: 8 },
    fields: {},
    staticObjects: [],
  };
}

interface Fixture {
  canvas: InteractiveCanvasAdapter;
  scene: FabricCardScene;
  options: BindEditorEventsOptions;
}

function createFixture(): Fixture {
  const raw = {
    on: vi.fn(),
    getActiveObject: vi.fn(),
  } as unknown as Canvas;
  const canvas: InteractiveCanvasAdapter = {
    raw,
    width: 960,
    height: 640,
    clear: vi.fn(),
    add: vi.fn(),
    remove: vi.fn(),
    requestRenderAll: vi.fn(),
    discardActiveObject: vi.fn(),
    dispose: vi.fn(),
  };
  const scene: FabricCardScene = {
    avatar: {} as FabricImage,
    fields: { name: {} as IText },
    objects: [],
    resourceStatus: { state: "ready" },
    fieldErrors: [],
    disposeObjectListeners: vi.fn(),
  };
  const measureText: TextMeasurer = vi.fn(
    (text, options) => text.length * options.fontSize,
  );
  const options: BindEditorEventsOptions = {
    template: createTemplate(),
    measureText,
    pointerTarget: document.createElement("canvas"),
    keyTarget: new EventTarget(),
    avatarSource: vi.fn(() => "/avatar.png"),
    onDocumentPatch: vi.fn(),
    onSelectionChange: vi.fn(),
    onFieldValidation: vi.fn(),
    onEditCancel: vi.fn(),
  };
  return { canvas, scene, options };
}

function configureDisposers(order: string[]) {
  const labels = ["avatar", "pinch", "text", "selection"] as const;
  const disposers = labels.map((label) =>
    vi.fn(() => {
      order.push(`cleanup-${label}`);
    }),
  );
  const binders = [
    binderMocks.bindAvatarEvents,
    binderMocks.bindAvatarPinchEvents,
    binderMocks.bindTextEvents,
    binderMocks.bindSelectionEvents,
  ];
  binders.forEach((binder, index) => {
    binder.mockImplementation(() => {
      order.push(`register-${labels[index]}`);
      return disposers[index];
    });
  });
  return disposers;
}

describe("bindEditorEvents", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("registers all bridges in order with exact targets, frames, and callbacks", () => {
    const fixture = createFixture();
    const order: string[] = [];
    const disposers = configureDisposers(order);
    const previous = vi.fn(() => order.push("previous"));
    fixture.scene.disposeObjectListeners = previous;

    const disposer = bindEditorEvents(
      fixture.canvas,
      fixture.scene,
      fixture.options,
    );

    expect(order).toEqual([
      "previous",
      "register-avatar",
      "register-pinch",
      "register-text",
      "register-selection",
    ]);
    expect(binderMocks.bindAvatarEvents).toHaveBeenCalledWith(
      fixture.canvas,
      fixture.scene.avatar,
      {
        avatarSource: fixture.options.avatarSource,
        frame: fixture.options.template.avatarFrame,
        onDocumentPatch: fixture.options.onDocumentPatch,
      },
    );
    expect(binderMocks.bindAvatarPinchEvents).toHaveBeenCalledWith(
      fixture.canvas,
      fixture.scene.avatar,
      {
        target: fixture.options.pointerTarget,
        avatarSource: fixture.options.avatarSource,
        frame: fixture.options.template.avatarFrame,
        onDocumentPatch: fixture.options.onDocumentPatch,
      },
    );
    expect(binderMocks.bindTextEvents).toHaveBeenCalledWith(
      fixture.canvas,
      fixture.scene.fields,
      {
        template: fixture.options.template,
        measureText: fixture.options.measureText,
        keyTarget: fixture.options.keyTarget,
        onDocumentPatch: fixture.options.onDocumentPatch,
        onFieldValidation: fixture.options.onFieldValidation,
        onEditCancel: fixture.options.onEditCancel,
      },
    );
    expect(binderMocks.bindSelectionEvents).toHaveBeenCalledWith(
      fixture.canvas.raw,
      fixture.scene,
      { onSelectionChange: fixture.options.onSelectionChange },
    );
    expect(disposer).toBe(fixture.scene.disposeObjectListeners);
    expect(disposers.every((entry) => entry.mock.calls.length === 0)).toBe(
      true,
    );
  });

  it("disposes the previous scene binding before registration and reuses the installed composite on rebind", () => {
    const fixture = createFixture();
    const order: string[] = [];
    const disposers = configureDisposers(order);
    const previous = vi.fn(() => order.push("previous"));
    fixture.scene.disposeObjectListeners = previous;

    const first = bindEditorEvents(
      fixture.canvas,
      fixture.scene,
      fixture.options,
    );

    expect(order).toEqual([
      "previous",
      "register-avatar",
      "register-pinch",
      "register-text",
      "register-selection",
    ]);
    expect(fixture.scene.disposeObjectListeners).toBe(first);

    const secondDisposers = [
      vi.fn(() => order.push("cleanup-avatar-2")),
      vi.fn(() => order.push("cleanup-pinch-2")),
      vi.fn(() => order.push("cleanup-text-2")),
      vi.fn(() => order.push("cleanup-selection-2")),
    ];
    binderMocks.bindAvatarEvents.mockImplementationOnce(() => {
      order.push("register-avatar-2");
      return secondDisposers[0];
    });
    binderMocks.bindAvatarPinchEvents.mockImplementationOnce(() => {
      order.push("register-pinch-2");
      return secondDisposers[1];
    });
    binderMocks.bindTextEvents.mockImplementationOnce(() => {
      order.push("register-text-2");
      return secondDisposers[2];
    });
    binderMocks.bindSelectionEvents.mockImplementationOnce(() => {
      order.push("register-selection-2");
      return secondDisposers[3];
    });

    const second = bindEditorEvents(
      fixture.canvas,
      fixture.scene,
      fixture.options,
    );

    expect(order).toEqual([
      "previous",
      "register-avatar",
      "register-pinch",
      "register-text",
      "register-selection",
      "cleanup-selection",
      "cleanup-text",
      "cleanup-pinch",
      "cleanup-avatar",
      "register-avatar-2",
      "register-pinch-2",
      "register-text-2",
      "register-selection-2",
    ]);
    expect(disposers.map((entry) => entry.mock.calls.length)).toEqual([
      1, 1, 1, 1,
    ]);
    expect(fixture.scene.disposeObjectListeners).toBe(second);
    expect(second).not.toBe(first);
  });

  it("returns an idempotent reverse-order composite shared by the scene", () => {
    const fixture = createFixture();
    const order: string[] = [];
    const disposers = configureDisposers(order);

    const disposer = bindEditorEvents(
      fixture.canvas,
      fixture.scene,
      fixture.options,
    );
    expect(fixture.scene.disposeObjectListeners).toBe(disposer);

    disposer();
    disposer();

    expect(order).toEqual([
      "register-avatar",
      "register-pinch",
      "register-text",
      "register-selection",
      "cleanup-selection",
      "cleanup-text",
      "cleanup-pinch",
      "cleanup-avatar",
    ]);
    expect(disposers.map((entry) => entry.mock.calls.length)).toEqual([
      1, 1, 1, 1,
    ]);
  });

  it("attempts every cleanup and rethrows the first reverse-order cleanup error", () => {
    const fixture = createFixture();
    const order: string[] = [];
    const selectionError = new Error("selection cleanup");
    const textError = new Error("text cleanup");
    const disposers = [
      vi.fn(() => order.push("cleanup-avatar")),
      vi.fn(() => order.push("cleanup-pinch")),
      vi.fn(() => {
        order.push("cleanup-text");
        throw textError;
      }),
      vi.fn(() => {
        order.push("cleanup-selection");
        throw selectionError;
      }),
    ];
    binderMocks.bindAvatarEvents.mockReturnValue(disposers[0]);
    binderMocks.bindAvatarPinchEvents.mockReturnValue(disposers[1]);
    binderMocks.bindTextEvents.mockReturnValue(disposers[2]);
    binderMocks.bindSelectionEvents.mockReturnValue(disposers[3]);

    const disposer = bindEditorEvents(
      fixture.canvas,
      fixture.scene,
      fixture.options,
    );

    expect(() => disposer()).toThrow(selectionError);
    expect(order).toEqual([
      "cleanup-selection",
      "cleanup-text",
      "cleanup-pinch",
      "cleanup-avatar",
    ]);
    expect(disposers.map((entry) => entry.mock.calls.length)).toEqual([
      1, 1, 1, 1,
    ]);
    disposer();
    expect(disposers.map((entry) => entry.mock.calls.length)).toEqual([
      1, 1, 1, 1,
    ]);
  });

  it.each([
    ["pinch", 1],
    ["text", 2],
    ["selection", 3],
  ] as const)(
    "rolls back prior bindings when %s registration fails",
    (label, failureIndex) => {
      const fixture = createFixture();
      const order: string[] = [];
      const originalError = new Error(`${label} registration`);
      const disposers = [0, 1, 2].map((index) =>
        vi.fn(() => {
          order.push(["avatar", "pinch", "text"][index]);
          throw new Error(`${label} rollback ${index}`);
        }),
      );
      binderMocks.bindAvatarEvents.mockImplementation(() => disposers[0]);
      binderMocks.bindAvatarPinchEvents.mockImplementation(() => {
        if (failureIndex === 1) {
          throw originalError;
        }
        return disposers[1];
      });
      binderMocks.bindTextEvents.mockImplementation(() => {
        if (failureIndex === 2) {
          throw originalError;
        }
        return disposers[2];
      });
      binderMocks.bindSelectionEvents.mockImplementation(() => {
        if (failureIndex === 3) {
          throw originalError;
        }
        return vi.fn();
      });
      const previous = vi.fn();
      fixture.scene.disposeObjectListeners = previous;

      expect(() =>
        bindEditorEvents(fixture.canvas, fixture.scene, fixture.options),
      ).toThrow(originalError);
      expect(previous).toHaveBeenCalledTimes(1);
      expect(order).toEqual(
        ["avatar", "pinch", "text"].slice(0, failureIndex).reverse(),
      );
      expect(
        disposers
          .slice(0, failureIndex)
          .every((entry) => entry.mock.calls.length === 1),
      ).toBe(true);
      expect(fixture.scene.disposeObjectListeners).toBe(previous);
    },
  );

  it("preserves a registration error when rollback cleanup also throws", () => {
    const fixture = createFixture();
    const originalError = new Error("selection registration");
    const rollbackError = new Error("rollback cleanup");
    const disposers = [0, 1, 2].map(() =>
      vi.fn(() => {
        throw rollbackError;
      }),
    );
    binderMocks.bindAvatarEvents.mockReturnValue(disposers[0]);
    binderMocks.bindAvatarPinchEvents.mockReturnValue(disposers[1]);
    binderMocks.bindTextEvents.mockReturnValue(disposers[2]);
    binderMocks.bindSelectionEvents.mockImplementation(() => {
      throw originalError;
    });
    const previous = vi.fn();
    fixture.scene.disposeObjectListeners = previous;

    expect(() =>
      bindEditorEvents(fixture.canvas, fixture.scene, fixture.options),
    ).toThrow(originalError);
    expect(disposers.map((entry) => entry.mock.calls.length)).toEqual([
      1, 1, 1,
    ]);
    expect(fixture.scene.disposeObjectListeners).toBe(previous);
  });

  it("does not register anything when the previous scene disposer fails", () => {
    const fixture = createFixture();
    const previousError = new Error("previous cleanup");
    const previous = vi.fn(() => {
      throw previousError;
    });
    fixture.scene.disposeObjectListeners = previous;

    expect(() =>
      bindEditorEvents(fixture.canvas, fixture.scene, fixture.options),
    ).toThrow(previousError);
    expect(previous).toHaveBeenCalledTimes(1);
    expect(binderMocks.bindAvatarEvents).not.toHaveBeenCalled();
    expect(binderMocks.bindAvatarPinchEvents).not.toHaveBeenCalled();
    expect(binderMocks.bindTextEvents).not.toHaveBeenCalled();
    expect(binderMocks.bindSelectionEvents).not.toHaveBeenCalled();
    expect(fixture.scene.disposeObjectListeners).toBe(previous);
  });
});
