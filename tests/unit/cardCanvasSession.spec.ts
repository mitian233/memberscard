import type { FabricImage, IText } from "fabric";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCardDocument } from "@/editor/cardDocument";
import type { CardCanvasController } from "@/fabric/cardCanvasController";
import type {
  CardCanvasSessionCallbacks,
  CreateCardCanvasSessionOptions,
} from "@/fabric/cardCanvasSession";
import type {
  FabricCardScene,
  InteractiveCanvasAdapter,
  TextMeasurer,
} from "@/fabric/types";
import { currentCardTemplate } from "@/templates/currentCardTemplate";
import type {
  AvatarTransform,
  CardDocument,
  CardField,
  CardPatch,
  CardTemplateDefinition,
  EditorSelection,
  FieldValidationError,
  ResourceStatus,
} from "@/types/card";
import type { CanvasSyncRequest } from "@/composables/useCardEditor";

type CardCanvasSessionModule = typeof import("@/fabric/cardCanvasSession");

let cardCanvasSessionModule: CardCanvasSessionModule | undefined;

async function getSessionModule(): Promise<CardCanvasSessionModule> {
  cardCanvasSessionModule ??= await import("@/fabric/cardCanvasSession");
  return cardCanvasSessionModule;
}

function createCanvasFake(): InteractiveCanvasAdapter {
  return {
    raw: {} as InteractiveCanvasAdapter["raw"],
    width: 960,
    height: 640,
    clear: vi.fn(),
    add: vi.fn(),
    remove: vi.fn(),
    requestRenderAll: vi.fn(),
    discardActiveObject: vi.fn(),
    dispose: vi.fn(),
  };
}

function createSceneFake(
  overrides: Partial<FabricCardScene> = {},
): FabricCardScene {
  return {
    avatar: {} as FabricImage,
    fields: { name: {} as IText },
    objects: [],
    resourceStatus: { state: "ready" },
    fieldErrors: [],
    disposeObjectListeners: vi.fn(),
    ...overrides,
  };
}

function createCallbacks(): CardCanvasSessionCallbacks {
  return {
    interactionEnabled: vi.fn(() => true),
    onSettled: vi.fn(),
    onResourceError: vi.fn(),
    onDocumentPatch: vi.fn(),
    onSelectionChange: vi.fn(),
    onFieldValidation: vi.fn(),
    onEditCancel: vi.fn(),
  };
}

function createControllerFixtures() {
  const canvas = createCanvasFake();
  const scene = createSceneFake();
  const measureText = vi.fn<TextMeasurer>();
  const render = vi.fn<CardCanvasController["render"]>();
  const applyPatch = vi.fn<CardCanvasController["applyPatch"]>();
  const bind = vi.fn<CardCanvasController["bind"]>();
  const classifyResourceError =
    vi.fn<CardCanvasController["classifyResourceError"]>();
  const createCanvas = vi.fn<CardCanvasController["createCanvas"]>();
  const renderPromise = Promise.resolve(scene);
  const disposer = vi.fn();
  const errorStatus: Extract<ResourceStatus, { state: "error" }> = {
    state: "error",
    code: "font-load-failed",
    recoverable: true,
    message: "字体或渲染资源加载失败，请刷新后重试。",
  };

  render.mockReturnValue(renderPromise);
  applyPatch.mockReturnValue({ kind: "applied", field: null, error: null });
  bind.mockReturnValue(disposer);
  classifyResourceError.mockReturnValue(errorStatus);

  const controller: CardCanvasController = {
    measureText,
    createCanvas,
    render,
    applyPatch,
    bind,
    classifyResourceError,
  };

  return {
    canvas,
    scene,
    measureText,
    render,
    renderPromise,
    applyPatch,
    bind,
    disposer,
    classifyResourceError,
    errorStatus,
    controller,
  };
}

function createSessionOptions(
  controller: CardCanvasController,
  callbacks: CardCanvasSessionCallbacks = createCallbacks(),
  canvas: InteractiveCanvasAdapter = createCanvasFake(),
): CreateCardCanvasSessionOptions {
  return {
    canvas,
    controller,
    pointerTarget: {} as HTMLElement,
    keyTarget: {} as EventTarget,
    callbacks,
  };
}

function avatar(overrides: Partial<AvatarTransform> = {}): AvatarTransform {
  return {
    src: "/avatar.png",
    left: 0,
    top: 0,
    scale: 1,
    ...overrides,
  };
}

function documentFor(
  template: CardTemplateDefinition = currentCardTemplate,
  overrides: Partial<CardDocument> = {},
): CardDocument {
  const base = createCardDocument(template);
  return {
    ...base,
    ...overrides,
    avatar: { ...base.avatar, ...overrides.avatar },
  };
}

function alternateTemplate(): CardTemplateDefinition {
  return {
    ...currentCardTemplate,
    id: "legacy",
    assets: { ...currentCardTemplate.assets, background: "/legacy.svg" },
    defaults: {
      ...currentCardTemplate.defaults,
      avatar: { ...currentCardTemplate.defaults.avatar },
    },
  };
}

function replaceRequest(
  revision: number,
  template: CardTemplateDefinition = currentCardTemplate,
  document: CardDocument = documentFor(template),
): CanvasSyncRequest {
  return {
    revision,
    kind: "replace",
    source: "system",
    document,
    template,
  };
}

function patchRequest(
  revision: number,
  patch: CardPatch,
  document: CardDocument,
  template: CardTemplateDefinition = currentCardTemplate,
): CanvasSyncRequest {
  return {
    revision,
    kind: "patch",
    source: "inspector",
    document,
    template,
    patch,
  };
}

function fieldError(field: CardField): FieldValidationError {
  return { field, code: "text-too-wide", message: `${field} is too wide` };
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function flushQueue(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("card canvas session", () => {
  it("rejects invalid requests before queue mutation and skips same or older revisions", async () => {
    const imported = await getSessionModule();
    const fixtures = createControllerFixtures();
    const session = imported.createCardCanvasSession(
      createSessionOptions(
        fixtures.controller,
        createCallbacks(),
        fixtures.canvas,
      ),
    );

    await expect(session.submit(replaceRequest(0))).rejects.toBeInstanceOf(
      RangeError,
    );
    await expect(
      session.submit({
        ...replaceRequest(1),
        patch: { type: "field", field: "name", value: "bad" },
      }),
    ).rejects.toBeInstanceOf(RangeError);
    await expect(
      session.submit({
        ...patchRequest(
          1,
          { type: "field", field: "name", value: "bad" },
          documentFor(),
        ),
        patch: undefined,
      }),
    ).rejects.toBeInstanceOf(RangeError);

    const first = session.submit(replaceRequest(2));
    const stale = session.submit(replaceRequest(2));
    const older = session.submit(replaceRequest(1));
    await Promise.all([first, stale, older]);

    expect(fixtures.render).toHaveBeenCalledTimes(1);
    expect(fixtures.bind).toHaveBeenCalledTimes(1);
  });

  it("renders and binds an initial replace with exact bridge options and a fresh settled error array", async () => {
    const imported = await getSessionModule();
    const fixtures = createControllerFixtures();
    const callbacks = createCallbacks();
    const options = createSessionOptions(
      fixtures.controller,
      callbacks,
      fixtures.canvas,
    );
    const session = imported.createCardCanvasSession(options);
    const document = documentFor();
    const request = replaceRequest(1, currentCardTemplate, document);
    const inputErrors = [fieldError("name")];
    fixtures.scene.fieldErrors = inputErrors;

    await session.submit(request);

    const bindCall = fixtures.bind.mock.calls[0];
    expect(bindCall?.[0]).toBe(fixtures.canvas);
    expect(bindCall?.[1]).toBe(fixtures.scene);
    const bindOptions = bindCall?.[2];
    expect(bindOptions?.template).toBe(currentCardTemplate);
    expect(bindOptions?.measureText).toBe(fixtures.measureText);
    expect(bindOptions?.pointerTarget).toBe(options.pointerTarget);
    expect(bindOptions?.keyTarget).toBe(options.keyTarget);

    const settledCall = vi.mocked(callbacks.onSettled).mock.calls[0]?.[0];
    expect(settledCall).toEqual({
      revision: 1,
      resourceStatus: fixtures.scene.resourceStatus,
      fieldErrors: inputErrors,
    });
    expect(settledCall?.fieldErrors).not.toBe(inputErrors);
    expect(fixtures.scene.fieldErrors).toBe(inputErrors);
  });

  it("fast-applies contiguous field and avatar patches against the previous live document", async () => {
    const imported = await getSessionModule();
    const fixtures = createControllerFixtures();
    const callbacks = createCallbacks();
    const options = createSessionOptions(
      fixtures.controller,
      callbacks,
      fixtures.canvas,
    );
    const session = imported.createCardCanvasSession(options);
    const firstDocument = documentFor();
    const secondDocument = documentFor(currentCardTemplate, { name: "Edited" });
    const thirdDocument = documentFor(currentCardTemplate, {
      avatar: avatar({ src: firstDocument.avatar.src, left: 10 }),
    });

    await session.submit(replaceRequest(1, currentCardTemplate, firstDocument));
    const bindOptions = fixtures.bind.mock.calls[0]?.[2];
    if (bindOptions === undefined) throw new Error("missing bind options");
    expect(bindOptions.avatarSource()).toBe(firstDocument.avatar.src);
    const fieldPatch: CardPatch = {
      type: "field",
      field: "name",
      value: "Edited",
    };
    fixtures.applyPatch.mockReturnValueOnce({
      kind: "applied",
      field: "name",
      error: null,
    });
    await session.submit(patchRequest(2, fieldPatch, secondDocument));

    expect(fixtures.applyPatch).toHaveBeenCalledTimes(1);
    expect(fixtures.applyPatch.mock.calls[0]).toEqual([
      fixtures.canvas,
      fixtures.scene,
      fieldPatch,
      {
        currentDocument: firstDocument,
        template: currentCardTemplate,
        measureText: fixtures.measureText,
      },
    ]);
    expect(fixtures.render).toHaveBeenCalledTimes(1);
    expect(fixtures.bind).toHaveBeenCalledTimes(1);
    expect(bindOptions.avatarSource()).toBe(secondDocument.avatar.src);

    const avatarPatch: CardPatch = {
      type: "avatar",
      value: { ...thirdDocument.avatar },
    };
    await session.submit(patchRequest(3, avatarPatch, thirdDocument));

    expect(fixtures.applyPatch).toHaveBeenCalledTimes(2);
    expect(fixtures.applyPatch.mock.calls[1]?.[3]).toEqual({
      currentDocument: secondDocument,
      template: currentCardTemplate,
      measureText: fixtures.measureText,
    });
    expect(fixtures.render).toHaveBeenCalledTimes(1);
    expect(fixtures.bind).toHaveBeenCalledTimes(1);
  });

  it("replaces and clears only the applied field validation error while preserving avatar errors", async () => {
    const imported = await getSessionModule();
    const fixtures = createControllerFixtures();
    const callbacks = createCallbacks();
    const existingAvatarError = fieldError("birthday");
    const existingNameEnError = fieldError("nameEn");
    fixtures.scene.fieldErrors = [existingAvatarError, existingNameEnError];
    const session = imported.createCardCanvasSession(
      createSessionOptions(fixtures.controller, callbacks, fixtures.canvas),
    );
    const firstDocument = documentFor();
    await session.submit(replaceRequest(1, currentCardTemplate, firstDocument));

    const nextDocument = documentFor(currentCardTemplate, { name: "Long" });
    const patch: CardPatch = { type: "field", field: "name", value: "Long" };
    const nextError = fieldError("name");
    fixtures.applyPatch.mockReturnValueOnce({
      kind: "applied",
      field: "name",
      error: nextError,
    });
    await session.submit(patchRequest(2, patch, nextDocument));
    expect(fixtures.scene.fieldErrors).toEqual([
      existingAvatarError,
      existingNameEnError,
      nextError,
    ]);
    expect(callbacks.onFieldValidation).toHaveBeenLastCalledWith(
      "name",
      nextError,
    );

    const clearedDocument = documentFor(currentCardTemplate, { name: "Clear" });
    fixtures.applyPatch.mockReturnValueOnce({
      kind: "applied",
      field: "name",
      error: null,
    });
    await session.submit(patchRequest(3, patch, clearedDocument));
    expect(fixtures.scene.fieldErrors).toEqual([
      existingAvatarError,
      existingNameEnError,
    ]);
    expect(callbacks.onFieldValidation).toHaveBeenLastCalledWith("name", null);
  });

  it("falls back to full render when avatar source changes", async () => {
    const imported = await getSessionModule();
    const fixtures = createControllerFixtures();
    const session = imported.createCardCanvasSession(
      createSessionOptions(
        fixtures.controller,
        createCallbacks(),
        fixtures.canvas,
      ),
    );
    const firstDocument = documentFor();
    const nextDocument = documentFor(currentCardTemplate, {
      avatar: avatar({ src: "/new-avatar.png" }),
    });
    const patch: CardPatch = { type: "avatar", value: nextDocument.avatar };
    const nextScene = createSceneFake();

    await session.submit(replaceRequest(1, currentCardTemplate, firstDocument));
    fixtures.applyPatch.mockReturnValueOnce({
      kind: "requires-render",
      reason: "avatar-source-changed",
    });
    fixtures.render.mockResolvedValueOnce(nextScene);
    await session.submit(patchRequest(2, patch, nextDocument));

    expect(fixtures.applyPatch).toHaveBeenCalledTimes(1);
    expect(fixtures.render).toHaveBeenCalledTimes(2);
    expect(fixtures.render.mock.calls[1]).toEqual([
      fixtures.canvas,
      nextDocument,
      currentCardTemplate,
    ]);
    expect(fixtures.bind).toHaveBeenCalledTimes(2);
    expect(fixtures.bind.mock.calls[1]?.[1]).toBe(nextScene);
  });

  it("requires full render for template changes, revision gaps, and an unbound scene", async () => {
    const imported = await getSessionModule();
    const fixtures = createControllerFixtures();
    const session = imported.createCardCanvasSession(
      createSessionOptions(
        fixtures.controller,
        createCallbacks(),
        fixtures.canvas,
      ),
    );
    const firstDocument = documentFor();
    await session.submit(replaceRequest(1, currentCardTemplate, firstDocument));

    const gapDocument = documentFor(currentCardTemplate, { name: "Gap" });
    fixtures.render.mockResolvedValueOnce(createSceneFake());
    await session.submit(
      patchRequest(
        3,
        { type: "field", field: "name", value: "Gap" },
        gapDocument,
      ),
    );
    expect(fixtures.render).toHaveBeenCalledTimes(2);
    expect(fixtures.applyPatch).not.toHaveBeenCalled();

    const differentTemplate = alternateTemplate();
    const differentDocument = documentFor(differentTemplate);
    fixtures.render.mockResolvedValueOnce(createSceneFake());
    await session.submit(
      patchRequest(
        4,
        { type: "field", field: "name", value: "Template" },
        differentDocument,
        differentTemplate,
      ),
    );
    expect(fixtures.render).toHaveBeenCalledTimes(3);
    expect(fixtures.applyPatch).not.toHaveBeenCalled();

    const failingScene = createSceneFake();
    fixtures.render.mockResolvedValueOnce(failingScene);
    fixtures.bind.mockImplementationOnce(() => {
      throw new Error("bind failed");
    });
    await session.submit(
      replaceRequest(5, differentTemplate, differentDocument),
    );
    expect(fixtures.render).toHaveBeenCalledTimes(4);
    expect(fixtures.bind).toHaveBeenCalledTimes(4);

    const recoveryScene = createSceneFake();
    fixtures.render.mockResolvedValueOnce(recoveryScene);
    const recoveryDocument = documentFor(differentTemplate, {
      name: "Recovered",
    });
    await session.submit(
      patchRequest(
        6,
        { type: "field", field: "name", value: "Recovered" },
        recoveryDocument,
        differentTemplate,
      ),
    );
    expect(fixtures.render).toHaveBeenCalledTimes(5);
    expect(fixtures.applyPatch).not.toHaveBeenCalled();
  });

  it("suppresses stale render completion and recovers the latest revision", async () => {
    const imported = await getSessionModule();
    const fixtures = createControllerFixtures();
    const callbacks = createCallbacks();
    const session = imported.createCardCanvasSession(
      createSessionOptions(fixtures.controller, callbacks, fixtures.canvas),
    );
    const firstRender = deferred<FabricCardScene>();
    const secondRender = deferred<FabricCardScene>();
    fixtures.render
      .mockReset()
      .mockReturnValueOnce(firstRender.promise)
      .mockReturnValueOnce(secondRender.promise);
    const firstDocument = documentFor();
    const secondDocument = documentFor(currentCardTemplate, { name: "Latest" });
    const firstSubmit = session.submit(
      replaceRequest(1, currentCardTemplate, firstDocument),
    );
    await flushQueue();
    const secondSubmit = session.submit(
      replaceRequest(2, currentCardTemplate, secondDocument),
    );

    firstRender.resolve(fixtures.scene);
    await flushQueue();
    expect(fixtures.bind).not.toHaveBeenCalled();
    expect(callbacks.onSettled).not.toHaveBeenCalled();
    expect(callbacks.onResourceError).not.toHaveBeenCalled();

    const latestScene = createSceneFake();
    secondRender.resolve(latestScene);
    await Promise.all([firstSubmit, secondSubmit]);
    expect(fixtures.bind).toHaveBeenCalledTimes(1);
    expect(fixtures.bind.mock.calls[0]?.[1]).toBe(latestScene);
    expect(callbacks.onSettled).toHaveBeenCalledWith(
      expect.objectContaining({ revision: 2 }),
    );

    const latestDocument = documentFor(currentCardTemplate, {
      name: "Patched",
    });
    await session.submit(
      patchRequest(
        3,
        { type: "field", field: "name", value: "Patched" },
        latestDocument,
      ),
    );
    expect(fixtures.applyPatch).toHaveBeenCalledTimes(1);
  });

  it("does not classify stale render failures and keeps later queued work healthy", async () => {
    const imported = await getSessionModule();
    const fixtures = createControllerFixtures();
    const callbacks = createCallbacks();
    const session = imported.createCardCanvasSession(
      createSessionOptions(fixtures.controller, callbacks, fixtures.canvas),
    );
    const staleRender = deferred<FabricCardScene>();
    const latestRender = deferred<FabricCardScene>();
    fixtures.render
      .mockReset()
      .mockReturnValueOnce(staleRender.promise)
      .mockReturnValueOnce(latestRender.promise);
    const firstSubmit = session.submit(replaceRequest(1));
    await flushQueue();
    const secondSubmit = session.submit(replaceRequest(2));
    staleRender.reject(new Error("stale render"));
    await flushQueue();
    expect(fixtures.classifyResourceError).not.toHaveBeenCalled();
    expect(callbacks.onResourceError).not.toHaveBeenCalled();
    latestRender.resolve(createSceneFake());
    await Promise.all([firstSubmit, secondSubmit]);
    expect(callbacks.onSettled).toHaveBeenCalledWith(
      expect.objectContaining({ revision: 2 }),
    );
  });

  it("classifies latest render, apply, and bind failures without poisoning later revisions", async () => {
    const imported = await getSessionModule();
    const fixtures = createControllerFixtures();
    const callbacks = createCallbacks();
    const session = imported.createCardCanvasSession(
      createSessionOptions(fixtures.controller, callbacks, fixtures.canvas),
    );
    const status = fixtures.errorStatus;
    const renderError = new Error("render");
    fixtures.render.mockReset().mockRejectedValueOnce(renderError);
    await session.submit(replaceRequest(1));
    expect(fixtures.classifyResourceError).toHaveBeenCalledWith(
      renderError,
      expect.any(Object),
      currentCardTemplate,
    );
    expect(callbacks.onResourceError).toHaveBeenCalledWith({
      revision: 1,
      status,
    });

    fixtures.render.mockResolvedValueOnce(fixtures.scene);
    await session.submit(replaceRequest(2));
    const applyError = new Error("apply");
    fixtures.applyPatch.mockImplementationOnce(() => {
      throw applyError;
    });
    await session.submit(
      patchRequest(
        3,
        { type: "field", field: "name", value: "Apply" },
        documentFor(currentCardTemplate, { name: "Apply" }),
      ),
    );
    expect(fixtures.classifyResourceError).toHaveBeenCalledWith(
      applyError,
      expect.any(Object),
      currentCardTemplate,
    );
    expect(callbacks.onResourceError).toHaveBeenLastCalledWith({
      revision: 3,
      status,
    });

    const bindError = new Error("bind");
    fixtures.render.mockResolvedValueOnce(createSceneFake());
    fixtures.bind.mockImplementationOnce(() => {
      throw bindError;
    });
    await session.submit(replaceRequest(4));
    expect(fixtures.classifyResourceError).toHaveBeenCalledWith(
      bindError,
      expect.any(Object),
      currentCardTemplate,
    );
    expect(callbacks.onResourceError).toHaveBeenLastCalledWith({
      revision: 4,
      status,
    });

    fixtures.render.mockResolvedValueOnce(createSceneFake());
    await session.submit(replaceRequest(5));
    expect(callbacks.onSettled).toHaveBeenLastCalledWith(
      expect.objectContaining({ revision: 5 }),
    );
  });

  it("forwards only active enabled canvas events and blocks them after disposal", async () => {
    const imported = await getSessionModule();
    const fixtures = createControllerFixtures();
    const callbacks = createCallbacks();
    const options = createSessionOptions(
      fixtures.controller,
      callbacks,
      fixtures.canvas,
    );
    const session = imported.createCardCanvasSession(options);
    await session.submit(replaceRequest(1));
    const bindOptions = fixtures.bind.mock.calls[0]?.[2];
    if (bindOptions === undefined) throw new Error("missing bind options");

    const patch: CardPatch = { type: "field", field: "name", value: "Canvas" };
    const selection: EditorSelection = { type: "avatar" };
    const validation = fieldError("name");
    const enabled = callbacks.interactionEnabled as ReturnType<typeof vi.fn>;
    enabled.mockReturnValue(true);
    bindOptions.onDocumentPatch(patch, "canvas");
    bindOptions.onDocumentPatch(patch, "inspector");
    bindOptions.onSelectionChange(selection);
    bindOptions.onFieldValidation("name", validation);
    bindOptions.onEditCancel("name", "restored");
    expect(callbacks.onDocumentPatch).toHaveBeenCalledWith(patch, "canvas");
    expect(callbacks.onSelectionChange).toHaveBeenCalledWith(selection);
    expect(callbacks.onFieldValidation).toHaveBeenCalledWith(
      "name",
      validation,
    );
    expect(callbacks.onEditCancel).toHaveBeenCalledWith("name", "restored");

    enabled.mockReturnValue(false);
    bindOptions.onDocumentPatch(patch, "canvas");
    bindOptions.onSelectionChange(selection);
    expect(callbacks.onDocumentPatch).toHaveBeenCalledTimes(1);
    expect(callbacks.onSelectionChange).toHaveBeenCalledTimes(1);

    await session.dispose();
    bindOptions.onDocumentPatch(patch, "canvas");
    bindOptions.onSelectionChange(selection);
    expect(callbacks.onDocumentPatch).toHaveBeenCalledTimes(1);
    expect(callbacks.onSelectionChange).toHaveBeenCalledTimes(1);
  });

  it("suppresses superseded and in-flight bind callbacks until the latest binding commits", async () => {
    const imported = await getSessionModule();
    const fixtures = createControllerFixtures();
    const callbacks = createCallbacks();
    const session = imported.createCardCanvasSession(
      createSessionOptions(fixtures.controller, callbacks, fixtures.canvas),
    );
    await session.submit(replaceRequest(1));
    const previousBindOptions = fixtures.bind.mock.calls[0]?.[2];
    if (previousBindOptions === undefined) {
      throw new Error("missing previous bind options");
    }

    const patch: CardPatch = { type: "field", field: "name", value: "new" };
    const selection: EditorSelection = { type: "none" };
    vi.mocked(callbacks.onDocumentPatch).mockClear();
    vi.mocked(callbacks.onSelectionChange).mockClear();

    const nextSubmit = session.submit(replaceRequest(2));
    previousBindOptions.onDocumentPatch(patch, "canvas");
    previousBindOptions.onSelectionChange(selection);
    expect(callbacks.onDocumentPatch).not.toHaveBeenCalled();
    expect(callbacks.onSelectionChange).not.toHaveBeenCalled();

    fixtures.bind.mockImplementationOnce((_canvas, _scene, nextOptions) => {
      nextOptions.onDocumentPatch(patch, "canvas");
      nextOptions.onSelectionChange(selection);
      return fixtures.disposer;
    });
    await nextSubmit;
    expect(callbacks.onDocumentPatch).not.toHaveBeenCalled();
    expect(callbacks.onSelectionChange).not.toHaveBeenCalled();

    const latestBindOptions = fixtures.bind.mock.calls[1]?.[2];
    if (latestBindOptions === undefined) {
      throw new Error("missing latest bind options");
    }
    latestBindOptions.onDocumentPatch(patch, "canvas");
    latestBindOptions.onSelectionChange(selection);
    expect(callbacks.onDocumentPatch).toHaveBeenCalledWith(patch, "canvas");
    expect(callbacks.onSelectionChange).toHaveBeenCalledWith(selection);
  });

  it("disposes idempotently in listener-then-canvas order and rejects with the first cleanup error", async () => {
    const imported = await getSessionModule();
    const fixtures = createControllerFixtures();
    const callbacks = createCallbacks();
    const canvasDispose = vi.fn();
    fixtures.canvas.dispose = canvasDispose;
    const session = imported.createCardCanvasSession(
      createSessionOptions(fixtures.controller, callbacks, fixtures.canvas),
    );
    await session.submit(replaceRequest(1));

    const order: string[] = [];
    fixtures.scene.disposeObjectListeners = vi.fn(() =>
      order.push("listeners"),
    );
    canvasDispose.mockImplementation(() => order.push("canvas"));
    const firstDispose = session.dispose();
    const secondDispose = session.dispose();
    expect(secondDispose).toBe(firstDispose);
    await firstDispose;
    expect(order).toEqual(["listeners", "canvas"]);
    expect(fixtures.scene.disposeObjectListeners).toHaveBeenCalledTimes(1);
    expect(canvasDispose).toHaveBeenCalledTimes(1);

    const secondFixtures = createControllerFixtures();
    const listenerError = new Error("listeners");
    const canvasError = new Error("canvas");
    secondFixtures.scene.disposeObjectListeners = vi.fn(() => {
      throw listenerError;
    });
    secondFixtures.canvas.dispose = vi.fn(() => {
      throw canvasError;
    });
    const secondSession = imported.createCardCanvasSession(
      createSessionOptions(
        secondFixtures.controller,
        createCallbacks(),
        secondFixtures.canvas,
      ),
    );
    await secondSession.submit(replaceRequest(1));
    await expect(secondSession.dispose()).rejects.toBe(listenerError);
    expect(secondFixtures.canvas.dispose).toHaveBeenCalledTimes(1);
  });

  it("marks disposed synchronously and leaves queued requests and input values untouched", async () => {
    const imported = await getSessionModule();
    const fixtures = createControllerFixtures();
    const callbacks = createCallbacks();
    const session = imported.createCardCanvasSession(
      createSessionOptions(fixtures.controller, callbacks, fixtures.canvas),
    );
    const document = documentFor();
    const patch: CardPatch = {
      type: "avatar",
      value: { ...document.avatar, left: 12 },
    };
    const request = patchRequest(1, patch, document);
    const requestSnapshot = JSON.stringify(request);
    const submitPromise = session.submit(replaceRequest(2));
    const disposePromise = session.dispose();
    const noOp = session.submit(request);
    await Promise.all([submitPromise, disposePromise, noOp]);
    expect(JSON.stringify(request)).toBe(requestSnapshot);
    expect(fixtures.render).not.toHaveBeenCalled();
    expect(callbacks.onSettled).not.toHaveBeenCalled();
    expect(callbacks.onResourceError).not.toHaveBeenCalled();
  });
});
