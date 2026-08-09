import { flushPromises } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  copyCardPng,
  isPngClipboardAvailable,
  type ClipboardEnvironment,
  type CopyCardPngResult,
} from "@/editor/clipboard";

function createPngBlob(): Blob {
  return new Blob(["png"], { type: "image/png" });
}

function createBlob(type: string): Blob {
  const blob = new Blob(["data"], { type });
  Object.defineProperty(blob, "type", {
    configurable: true,
    value: type,
  });
  return blob;
}

function createEnvironment(
  write: Clipboard["write"] = vi.fn(async () => undefined),
  createClipboardItem: ClipboardEnvironment["createClipboardItem"] = vi.fn(
    () => ({}) as ClipboardItem,
  ),
): ClipboardEnvironment {
  return {
    clipboard: { write },
    createClipboardItem,
  };
}

async function expectDenied(
  operation: Promise<CopyCardPngResult>,
): Promise<void> {
  await expect(operation).resolves.toBe("denied");
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("clipboard", () => {
  it("rejects non-PNG blobs before capability checks or writes", async () => {
    const write = vi.fn(async () => undefined);
    const createClipboardItem = vi.fn(() => ({}) as ClipboardItem);
    const environment = createEnvironment(write, createClipboardItem);

    await expect(
      copyCardPng(createBlob("image/jpeg"), environment),
    ).rejects.toThrow(TypeError);
    expect(write).not.toHaveBeenCalled();
    expect(createClipboardItem).not.toHaveBeenCalled();
  });

  it("rejects every non-exact MIME before reading injected environment getters", async () => {
    let clipboardReads = 0;
    let itemReads = 0;
    const environment = Object.defineProperties(
      {},
      {
        clipboard: {
          configurable: true,
          get() {
            clipboardReads += 1;
            throw new Error("clipboard getter should not run");
          },
        },
        createClipboardItem: {
          configurable: true,
          get() {
            itemReads += 1;
            throw new Error("item getter should not run");
          },
        },
      },
    ) as ClipboardEnvironment;

    for (const type of ["image/jpeg", "IMAGE/PNG", ""]) {
      await expect(copyCardPng(createBlob(type), environment)).rejects.toThrow(
        TypeError,
      );
    }
    expect(clipboardReads).toBe(0);
    expect(itemReads).toBe(0);
  });

  it("reports capability combinations without constructing or writing", () => {
    const write = vi.fn(async () => undefined);
    const createClipboardItem = vi.fn(() => ({}) as ClipboardItem);

    expect(isPngClipboardAvailable({})).toBe(false);
    expect(isPngClipboardAvailable({ createClipboardItem })).toBe(false);
    expect(
      isPngClipboardAvailable({
        clipboard: { write: undefined as unknown as Clipboard["write"] },
        createClipboardItem,
      }),
    ).toBe(false);
    expect(isPngClipboardAvailable({ clipboard: { write } })).toBe(false);
    expect(
      isPngClipboardAvailable(createEnvironment(write, createClipboardItem)),
    ).toBe(true);
    expect(createClipboardItem).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });

  it("contains an independently throwing item factory getter", () => {
    const write = vi.fn(async () => undefined);
    let itemReads = 0;
    const environment = Object.defineProperties(
      {},
      {
        clipboard: {
          configurable: true,
          value: { write },
        },
        createClipboardItem: {
          configurable: true,
          get() {
            itemReads += 1;
            throw new Error("item factory getter");
          },
        },
      },
    ) as ClipboardEnvironment;

    let available = true;
    expect(() => {
      available = isPngClipboardAvailable(environment);
    }).not.toThrow();
    expect(available).toBe(false);
    expect(itemReads).toBe(1);
    expect(write).not.toHaveBeenCalled();
  });

  it("resolves unsupported for every unavailable capability", async () => {
    const missingClipboardWrite = vi.fn(async () => undefined);
    const missingClipboardItem = vi.fn(() => ({}) as ClipboardItem);
    const missingFactoryWrite = vi.fn(async () => undefined);
    const missingFactoryItem = vi.fn(() => ({}) as ClipboardItem);
    const nonCallableWrite = vi.fn(async () => undefined);
    const nonCallableItem = vi.fn(() => ({}) as ClipboardItem);
    const throwingWrite = vi.fn(async () => undefined);
    const throwingItem = vi.fn(() => ({}) as ClipboardItem);
    let throwingItemReads = 0;
    const throwingEnvironment = Object.defineProperties(
      {},
      {
        clipboard: {
          configurable: true,
          value: { write: throwingWrite },
        },
        createClipboardItem: {
          configurable: true,
          get() {
            throwingItemReads += 1;
            throw new Error("item factory getter");
          },
        },
      },
    ) as ClipboardEnvironment;

    const cases = [
      {
        environment: {
          createClipboardItem: missingClipboardItem,
        } as ClipboardEnvironment,
        write: missingClipboardWrite,
        item: missingClipboardItem,
      },
      {
        environment: { clipboard: { write: missingFactoryWrite } },
        write: missingFactoryWrite,
        item: missingFactoryItem,
      },
      {
        environment: {
          clipboard: { write: nonCallableWrite },
          createClipboardItem:
            42 as unknown as ClipboardEnvironment["createClipboardItem"],
        },
        write: nonCallableWrite,
        item: nonCallableItem,
      },
      {
        environment: throwingEnvironment,
        write: throwingWrite,
        item: throwingItem,
      },
    ];

    for (const testCase of cases) {
      await expect(
        copyCardPng(createPngBlob(), testCase.environment),
      ).resolves.toBe("unsupported");
      expect(testCase.write).not.toHaveBeenCalled();
      expect(testCase.item).not.toHaveBeenCalled();
    }
    expect(throwingItemReads).toBe(1);
  });

  it("returns unsupported for non-function and throwing capability properties", () => {
    const write = vi.fn(async () => undefined);
    const createClipboardItem = vi.fn(() => ({}) as ClipboardItem);
    expect(
      isPngClipboardAvailable({
        clipboard: { write },
        createClipboardItem:
          42 as unknown as ClipboardEnvironment["createClipboardItem"],
      }),
    ).toBe(false);

    let clipboardReads = 0;
    let writeReads = 0;
    let itemReads = 0;
    const throwingClipboard = {
      get write() {
        writeReads += 1;
        throw new Error("write getter");
      },
    };
    const environment = Object.defineProperties(
      {},
      {
        clipboard: {
          configurable: true,
          get() {
            clipboardReads += 1;
            return throwingClipboard;
          },
        },
        createClipboardItem: {
          configurable: true,
          get() {
            itemReads += 1;
            throw new Error("item getter");
          },
        },
      },
    ) as ClipboardEnvironment;
    expect(isPngClipboardAvailable(environment)).toBe(false);
    expect(clipboardReads).toBe(1);
    expect(writeReads).toBe(1);
    expect(itemReads).toBe(0);
    expect(createClipboardItem).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });

  it("constructs and writes one exact PNG item, with fresh containers per call", async () => {
    const blob = createPngBlob();
    const items = [{ id: 1 }, { id: 2 }].map(
      (value) =>
        Object.assign(value, {
          toString: () => "clipboard-item",
        }) as unknown as ClipboardItem,
    );
    const records: Record<string, Blob>[] = [];
    const arrays: (readonly ClipboardItem[])[] = [];
    const write = vi.fn(async (next: readonly ClipboardItem[]) => {
      arrays.push(next);
    });
    const createClipboardItem = vi.fn((record: Record<string, Blob>) => {
      records.push(record);
      return items[records.length - 1];
    });
    const environment = createEnvironment(write, createClipboardItem);

    expect(await copyCardPng(blob, environment)).toBe("copied");
    expect(await copyCardPng(blob, environment)).toBe("copied");
    expect(createClipboardItem).toHaveBeenCalledTimes(2);
    expect(write).toHaveBeenCalledTimes(2);
    expect(records[0]).toEqual({ "image/png": blob });
    expect(records[1]).toEqual({ "image/png": blob });
    expect(records[0]).not.toBe(records[1]);
    expect(arrays[0]).toEqual([items[0]]);
    expect(arrays[1]).toEqual([items[1]]);
    expect(arrays[0]).not.toBe(arrays[1]);
    expect(records[0]["image/png"]).toBe(blob);
    expect(records[1]["image/png"]).toBe(blob);
    expect(blob.type).toBe("image/png");
  });

  it("resolves denied for synchronous constructor and write throws", async () => {
    const blob = createPngBlob();
    const constructorError = new Error("constructor details");
    const writeError = new Error("write details");
    const constructorEnvironment = createEnvironment(
      vi.fn(async () => undefined),
      vi.fn(() => {
        throw constructorError;
      }),
    );
    await expectDenied(copyCardPng(blob, constructorEnvironment));

    const writeEnvironment = createEnvironment(
      vi.fn(() => {
        throw writeError;
      }),
      vi.fn(() => ({}) as ClipboardItem),
    );
    await expectDenied(copyCardPng(blob, writeEnvironment));
  });

  it("resolves denied for asynchronous write rejection without an unhandled rejection", async () => {
    const rejection = new Error("async write details");
    const write = vi.fn(() => Promise.reject(rejection));
    const unhandled: unknown[] = [];
    const listener = (reason: unknown) => {
      unhandled.push(reason);
    };
    process.on("unhandledRejection", listener);
    const result = await copyCardPng(createPngBlob(), createEnvironment(write));
    await flushPromises();
    process.off("unhandledRejection", listener);

    expect(result).toBe("denied");
    expect(unhandled).toEqual([]);
  });

  it("keeps capability checks side-effect free and preserves environment inputs", () => {
    const blob = createPngBlob();
    const write = vi.fn(async () => undefined);
    const createClipboardItem = vi.fn(() => ({}) as ClipboardItem);
    const environment = Object.freeze(
      createEnvironment(write, createClipboardItem),
    );
    const snapshot = JSON.stringify({ blobType: blob.type });
    expect(isPngClipboardAvailable(environment)).toBe(true);
    expect(createClipboardItem).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
    expect(JSON.stringify({ blobType: blob.type })).toBe(snapshot);
  });

  it("copies with frozen blob and environment inputs without mutating descriptors", async () => {
    const blob = Object.freeze(createPngBlob());
    const item = {} as ClipboardItem;
    const clipboard = Object.freeze({
      write: vi.fn(async () => undefined),
    });
    const environment = Object.freeze({
      clipboard,
      createClipboardItem: vi.fn(() => item),
    });
    const before = {
      blobKeys: Reflect.ownKeys(blob),
      blobType: blob.type,
      blobSize: blob.size,
      environmentKeys: Reflect.ownKeys(environment),
      clipboardKeys: Reflect.ownKeys(clipboard),
    };

    expect(await copyCardPng(blob, environment)).toBe("copied");
    expect(blob.type).toBe(before.blobType);
    expect(blob.size).toBe(before.blobSize);
    expect(Reflect.ownKeys(blob)).toEqual(before.blobKeys);
    expect(Reflect.ownKeys(environment)).toEqual(before.environmentKeys);
    expect(Reflect.ownKeys(clipboard)).toEqual(before.clipboardKeys);
    expect(environment.createClipboardItem).toHaveBeenCalledWith({
      "image/png": blob,
    });
    expect(clipboard.write).toHaveBeenCalledTimes(1);
  });

  it("lazily reads default browser globals only when called", async () => {
    const reader = vi.fn();
    const itemConstructor = vi.fn();
    vi.stubGlobal(
      "navigator",
      new Proxy(
        {},
        {
          get() {
            throw new Error("navigator touched during import");
          },
        },
      ),
    );
    vi.stubGlobal(
      "ClipboardItem",
      class {
        constructor() {
          itemConstructor();
        }
      },
    );
    vi.resetModules();
    const freshModule = await import("@/editor/clipboard");
    expect(reader).not.toHaveBeenCalled();
    expect(itemConstructor).not.toHaveBeenCalled();
    expect(freshModule.isPngClipboardAvailable({})).toBe(false);
    await flushPromises();
  });

  it("fresh-imports without reading throwing navigator or ClipboardItem getters", async () => {
    const navigatorDescriptor = Object.getOwnPropertyDescriptor(
      globalThis,
      "navigator",
    );
    const clipboardItemDescriptor = Object.getOwnPropertyDescriptor(
      globalThis,
      "ClipboardItem",
    );
    let navigatorReads = 0;
    let clipboardItemReads = 0;
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      get() {
        navigatorReads += 1;
        throw new Error("navigator accessed");
      },
    });
    Object.defineProperty(globalThis, "ClipboardItem", {
      configurable: true,
      get() {
        clipboardItemReads += 1;
        throw new Error("ClipboardItem accessed");
      },
    });

    try {
      vi.resetModules();
      await import("@/editor/clipboard");
      expect(navigatorReads).toBe(0);
      expect(clipboardItemReads).toBe(0);
    } finally {
      if (navigatorDescriptor === undefined) {
        Reflect.deleteProperty(globalThis, "navigator");
      } else {
        Object.defineProperty(globalThis, "navigator", navigatorDescriptor);
      }
      if (clipboardItemDescriptor === undefined) {
        Reflect.deleteProperty(globalThis, "ClipboardItem");
      } else {
        Object.defineProperty(
          globalThis,
          "ClipboardItem",
          clipboardItemDescriptor,
        );
      }
      vi.resetModules();
    }
  });

  it("uses the isolated default navigator and ClipboardItem implementations", async () => {
    const writes: (readonly ClipboardItem[])[] = [];
    const itemRecords: Record<string, Blob>[] = [];
    class DefaultClipboardItem {
      constructor(record: Record<string, Blob>) {
        itemRecords.push(record);
      }
    }
    const clipboard = {
      write: vi.fn(async (next: readonly ClipboardItem[]) => {
        writes.push(next);
      }),
    };
    vi.stubGlobal("navigator", { clipboard });
    vi.stubGlobal("ClipboardItem", DefaultClipboardItem);
    vi.resetModules();
    const freshModule = await import("@/editor/clipboard");

    expect(freshModule.isPngClipboardAvailable()).toBe(true);
    expect(await freshModule.copyCardPng(createPngBlob())).toBe("copied");
    expect(itemRecords).toHaveLength(1);
    expect(itemRecords[0]["image/png"]).toBeInstanceOf(Blob);
    expect(clipboard.write).toHaveBeenCalledTimes(1);
  });
});
