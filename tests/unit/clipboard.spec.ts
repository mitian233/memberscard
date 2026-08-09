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
      copyCardPng(new Blob(["jpeg"], { type: "image/jpeg" }), environment),
    ).rejects.toThrow(TypeError);
    expect(write).not.toHaveBeenCalled();
    expect(createClipboardItem).not.toHaveBeenCalled();
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

  it("constructs and writes one exact PNG item, with fresh containers per call", async () => {
    const blob = createPngBlob();
    const items = [{ id: 1 }, { id: 2 }].map(
      (value) =>
        Object.assign(value, {
          toString: () => "clipboard-item",
        }) as unknown as ClipboardItem,
    );
    const records: Record<string, Blob>[] = [];
    const arrays: readonly ClipboardItem[][] = [];
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

  it("uses the isolated default navigator and ClipboardItem implementations", async () => {
    const writes: readonly ClipboardItem[][] = [];
    const itemRecords: Record<string, Blob>[] = [];
    const item = {} as ClipboardItem;
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
    void item;
  });
});
