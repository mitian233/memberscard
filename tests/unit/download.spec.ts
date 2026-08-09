import { describe, expect, it, vi } from "vitest";

import type { DownloadEnvironment } from "@/editor/download";
import { CardDownloadError, downloadCardPng } from "@/editor/download";

function createBlob(type: string): Blob {
  const blob = new Blob(["png"], { type });
  Object.defineProperty(blob, "type", {
    configurable: true,
    value: type,
  });
  return blob;
}

function createAnchor() {
  const attributes = new Map<string, string>();
  const methods = {
    click: vi.fn(),
    setAttribute: vi.fn((name: string, value: string) => {
      attributes.set(name, value);
    }),
  };
  const anchor = {
    href: "",
    download: "",
    hidden: false,
    click: methods.click,
    setAttribute: methods.setAttribute,
  } as unknown as HTMLAnchorElement;
  return { anchor, methods, attributes };
}

function createEnvironment(
  anchor: HTMLAnchorElement = createAnchor().anchor,
  order: string[] = [],
): DownloadEnvironment & {
  methods: {
    createObjectUrl: ReturnType<typeof vi.fn>;
    revokeObjectUrl: ReturnType<typeof vi.fn>;
    createAnchor: ReturnType<typeof vi.fn>;
    appendAnchor: ReturnType<typeof vi.fn>;
    removeAnchor: ReturnType<typeof vi.fn>;
  };
} {
  const methods = {
    createObjectUrl: vi.fn(() => {
      order.push("createObjectUrl");
      return "blob:test-url";
    }),
    revokeObjectUrl: vi.fn(() => {
      order.push("revokeObjectUrl");
    }),
    createAnchor: vi.fn(() => {
      order.push("createAnchor");
      return anchor;
    }),
    appendAnchor: vi.fn(() => {
      order.push("appendAnchor");
    }),
    removeAnchor: vi.fn(() => {
      order.push("removeAnchor");
    }),
  };
  return { ...methods, methods };
}

function expectDownloadError(operation: () => void, cause: unknown): void {
  let thrown: unknown;
  try {
    operation();
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(CardDownloadError);
  expect(thrown).toMatchObject({
    code: "download-failed",
    message: "图片下载失败，请重试。",
    cause,
  });
  expect((thrown as Error).message).not.toContain(
    cause instanceof Error ? cause.message : String(cause),
  );
}

describe("download card PNG", () => {
  it("sets exact download attributes, clicks once, and cleans up in order", () => {
    const order: string[] = [];
    const { anchor, methods: anchorMethods, attributes } = createAnchor();
    const environment = createEnvironment(anchor, order);
    anchorMethods.click.mockImplementation(() => {
      order.push("click");
    });

    downloadCardPng(createBlob("image/png"), "  member.PNG  ", environment);

    expect(environment.methods.createObjectUrl).toHaveBeenCalledWith(
      expect.any(Blob),
    );
    expect(environment.methods.createObjectUrl).toHaveBeenCalledTimes(1);
    expect(environment.methods.createAnchor).toHaveBeenCalledTimes(1);
    expect(anchor.href).toBe("blob:test-url");
    expect(anchor.download).toBe("member.PNG");
    expect(anchor.hidden).toBe(true);
    expect(attributes.get("aria-hidden")).toBe("true");
    expect(anchorMethods.setAttribute).toHaveBeenCalledWith(
      "aria-hidden",
      "true",
    );
    expect(anchorMethods.click).toHaveBeenCalledTimes(1);
    expect(environment.methods.appendAnchor).toHaveBeenCalledWith(anchor);
    expect(environment.methods.removeAnchor).toHaveBeenCalledWith(anchor);
    expect(environment.methods.revokeObjectUrl).toHaveBeenCalledWith(
      "blob:test-url",
    );
    expect(order).toEqual([
      "createObjectUrl",
      "createAnchor",
      "appendAnchor",
      "click",
      "removeAnchor",
      "revokeObjectUrl",
    ]);
  });

  it("rejects invalid blobs and filenames before any environment reads", () => {
    const environment = createEnvironment();
    const invalidInputs: Array<[Blob, string]> = [
      [createBlob("image/jpeg"), "card.png"],
      [createBlob("IMAGE/PNG"), "card.png"],
      [createBlob(""), "card.png"],
      [createBlob("image/png"), ""],
      [createBlob("image/png"), "   "],
      [createBlob("image/png"), "card.jpg"],
      [createBlob("image/png"), "card.png.jpg"],
    ];

    for (const [blob, filename] of invalidInputs) {
      expect(() => downloadCardPng(blob, filename, environment)).toThrow(
        TypeError,
      );
    }
    expect(environment.methods.createObjectUrl).not.toHaveBeenCalled();
    expect(environment.methods.revokeObjectUrl).not.toHaveBeenCalled();
    expect(environment.methods.createAnchor).not.toHaveBeenCalled();
    expect(environment.methods.appendAnchor).not.toHaveBeenCalled();
    expect(environment.methods.removeAnchor).not.toHaveBeenCalled();
  });

  it("validates before reading omitted browser defaults", () => {
    const documentDescriptor = Object.getOwnPropertyDescriptor(
      globalThis,
      "document",
    );
    const urlDescriptor = Object.getOwnPropertyDescriptor(globalThis, "URL");
    let documentReads = 0;
    let urlReads = 0;
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      get() {
        documentReads += 1;
        throw new Error("document default accessed before validation");
      },
    });
    Object.defineProperty(globalThis, "URL", {
      configurable: true,
      get() {
        urlReads += 1;
        throw new Error("URL default accessed before validation");
      },
    });

    try {
      expect(() =>
        downloadCardPng(createBlob("image/jpeg"), "card.jpg"),
      ).toThrow(TypeError);
      expect(() =>
        downloadCardPng(createBlob("image/png"), "card.jpg"),
      ).toThrow(TypeError);
      expect(documentReads).toBe(0);
      expect(urlReads).toBe(0);
    } finally {
      if (documentDescriptor === undefined) {
        Reflect.deleteProperty(globalThis, "document");
      } else {
        Object.defineProperty(globalThis, "document", documentDescriptor);
      }
      if (urlDescriptor === undefined) {
        Reflect.deleteProperty(globalThis, "URL");
      } else {
        Object.defineProperty(globalThis, "URL", urlDescriptor);
      }
    }
  });

  it("imports without reading throwing document or URL globals", async () => {
    vi.resetModules();
    const documentDescriptor = Object.getOwnPropertyDescriptor(
      globalThis,
      "document",
    );
    const urlDescriptor = Object.getOwnPropertyDescriptor(globalThis, "URL");
    let documentReads = 0;
    let urlReads = 0;
    const originalUrl = globalThis.URL;
    const throwingUrl = new Proxy(originalUrl, {
      get(target, property, receiver) {
        if (property === "createObjectURL" || property === "revokeObjectURL") {
          urlReads += 1;
          throw new Error("URL method accessed before download");
        }
        return Reflect.get(target, property, receiver);
      },
    });
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      get() {
        documentReads += 1;
        throw new Error("document accessed during import");
      },
    });
    Object.defineProperty(globalThis, "URL", {
      configurable: true,
      value: throwingUrl,
    });

    try {
      const imported = await import("@/editor/download");
      expect(documentReads).toBe(0);
      expect(urlReads).toBe(0);
      expect(() =>
        imported.downloadCardPng(createBlob("image/png"), "card.png"),
      ).toThrow("图片下载失败，请重试。");
      expect(urlReads).toBe(1);
      expect(documentReads).toBe(0);
    } finally {
      if (documentDescriptor === undefined) {
        Reflect.deleteProperty(globalThis, "document");
      } else {
        Object.defineProperty(globalThis, "document", documentDescriptor);
      }
      if (urlDescriptor === undefined) {
        Reflect.deleteProperty(globalThis, "URL");
      } else {
        Object.defineProperty(globalThis, "URL", urlDescriptor);
      }
      vi.resetModules();
    }
  });

  it("uses fresh URL and anchor state for frozen inputs and environments", () => {
    const first = createAnchor();
    const second = createAnchor();
    const anchors = [first.anchor, second.anchor];
    let index = 0;
    const environment = Object.freeze({
      createObjectUrl: vi.fn(() => `blob:${index}`),
      revokeObjectUrl: vi.fn(),
      createAnchor: vi.fn(() => anchors[index++]),
      appendAnchor: vi.fn(),
      removeAnchor: vi.fn(),
    });
    const blob = Object.freeze(createBlob("image/png"));
    const environmentKeys = Reflect.ownKeys(environment);
    const blobKeys = Reflect.ownKeys(blob);

    downloadCardPng(blob, "card.png", environment);
    downloadCardPng(blob, "card.png", environment);

    expect(environment.createObjectUrl).toHaveBeenCalledTimes(2);
    expect(environment.createAnchor).toHaveBeenCalledTimes(2);
    expect(environment.appendAnchor).toHaveBeenNthCalledWith(1, first.anchor);
    expect(environment.appendAnchor).toHaveBeenNthCalledWith(2, second.anchor);
    expect(environment.revokeObjectUrl).toHaveBeenCalledTimes(2);
    expect(environment.removeAnchor).toHaveBeenCalledTimes(2);
    expect(Reflect.ownKeys(environment)).toEqual(environmentKeys);
    expect(Reflect.ownKeys(blob)).toEqual(blobKeys);
    expect(first.anchor).not.toBe(second.anchor);
  });

  it("wraps object URL creation failure without cleanup", () => {
    const urlError = new Error("private URL details");
    const environment = createEnvironment();
    environment.methods.createObjectUrl.mockImplementation(() => {
      throw urlError;
    });

    expectDownloadError(
      () => downloadCardPng(createBlob("image/png"), "card.png", environment),
      urlError,
    );
    expect(environment.methods.createAnchor).not.toHaveBeenCalled();
    expect(environment.methods.removeAnchor).not.toHaveBeenCalled();
    expect(environment.methods.revokeObjectUrl).not.toHaveBeenCalled();
  });

  it("attempts every applicable cleanup for setup and click failures", () => {
    const anchorError = new Error("anchor details");
    const anchorEnvironment = createEnvironment();
    anchorEnvironment.methods.createAnchor.mockImplementation(() => {
      throw anchorError;
    });
    expectDownloadError(
      () =>
        downloadCardPng(createBlob("image/png"), "card.png", anchorEnvironment),
      anchorError,
    );
    expect(anchorEnvironment.methods.removeAnchor).not.toHaveBeenCalled();
    expect(anchorEnvironment.methods.revokeObjectUrl).toHaveBeenCalledTimes(1);

    const setupError = new Error("setup details");
    const setupAnchor = createAnchor();
    Object.defineProperty(setupAnchor.anchor, "href", {
      configurable: true,
      set() {
        throw setupError;
      },
    });
    const setupEnvironment = createEnvironment(setupAnchor.anchor);
    expectDownloadError(
      () =>
        downloadCardPng(createBlob("image/png"), "card.png", setupEnvironment),
      setupError,
    );
    expect(setupEnvironment.methods.removeAnchor).toHaveBeenCalledTimes(1);
    expect(setupEnvironment.methods.revokeObjectUrl).toHaveBeenCalledTimes(1);

    const appendError = new Error("append details");
    const appendEnvironment = createEnvironment();
    appendEnvironment.methods.appendAnchor.mockImplementation(() => {
      throw appendError;
    });
    expectDownloadError(
      () =>
        downloadCardPng(createBlob("image/png"), "card.png", appendEnvironment),
      appendError,
    );
    expect(appendEnvironment.methods.removeAnchor).toHaveBeenCalledTimes(1);
    expect(appendEnvironment.methods.revokeObjectUrl).toHaveBeenCalledTimes(1);

    const clickError = new Error("click details");
    const clickAnchor = createAnchor();
    clickAnchor.methods.click.mockImplementation(() => {
      throw clickError;
    });
    const clickEnvironment = createEnvironment(clickAnchor.anchor);
    expectDownloadError(
      () =>
        downloadCardPng(createBlob("image/png"), "card.png", clickEnvironment),
      clickError,
    );
    expect(clickEnvironment.methods.removeAnchor).toHaveBeenCalledTimes(1);
    expect(clickEnvironment.methods.revokeObjectUrl).toHaveBeenCalledTimes(1);
  });

  it("preserves first work or cleanup error while attempting both cleanups", () => {
    const workError = new Error("work details");
    const removeError = new Error("remove details");
    const revokeError = new Error("revoke details");
    const anchor = createAnchor();
    anchor.methods.click.mockImplementation(() => {
      throw workError;
    });
    const environment = createEnvironment(anchor.anchor);
    environment.methods.removeAnchor.mockImplementation(() => {
      throw removeError;
    });
    environment.methods.revokeObjectUrl.mockImplementation(() => {
      throw revokeError;
    });

    expectDownloadError(
      () => downloadCardPng(createBlob("image/png"), "card.png", environment),
      workError,
    );
    expect(environment.methods.removeAnchor).toHaveBeenCalledTimes(1);
    expect(environment.methods.revokeObjectUrl).toHaveBeenCalledTimes(1);

    const cleanupEnvironment = createEnvironment();
    cleanupEnvironment.methods.removeAnchor.mockImplementation(() => {
      throw removeError;
    });
    cleanupEnvironment.methods.revokeObjectUrl.mockImplementation(() => {
      throw revokeError;
    });
    expectDownloadError(
      () =>
        downloadCardPng(
          createBlob("image/png"),
          "card.png",
          cleanupEnvironment,
        ),
      removeError,
    );
    expect(cleanupEnvironment.methods.removeAnchor).toHaveBeenCalledTimes(1);
    expect(cleanupEnvironment.methods.revokeObjectUrl).toHaveBeenCalledTimes(1);
  });
});
