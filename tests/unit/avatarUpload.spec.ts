import { flushPromises } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AvatarFrameDefinition, AvatarTransform } from "@/types/card";
import { clampAvatarTransform, getCoverScale } from "@/editor/avatarGeometry";
import { currentCardTemplate } from "@/templates/currentCardTemplate";
import { legacyCardTemplate } from "@/templates/legacyCardTemplate";
import {
  AvatarUploadError,
  loadAvatarFile,
  validateAvatarFile,
} from "@/editor/avatarUpload";

const MAX_AVATAR_BYTES = 10 * 1024 * 1024;

function createFile(type: string, size = 1): File {
  const file = new File(["avatar"], "avatar-image", { type });
  Object.defineProperty(file, "size", {
    configurable: true,
    value: size,
  });
  Object.defineProperty(file, "type", {
    configurable: true,
    value: type,
  });
  return file;
}

function createEnvironment(
  imageSize: { width: number; height: number },
  dataUrl = "data:image/png;base64,avatar",
) {
  return {
    readDataUrl: vi.fn(async () => dataUrl),
    loadImageSize: vi.fn(async () => ({ ...imageSize })),
  };
}

function expectCover(
  transform: AvatarTransform,
  imageSize: { width: number; height: number },
  frame: AvatarFrameDefinition,
): void {
  const scaledWidth = imageSize.width * transform.scale;
  const scaledHeight = imageSize.height * transform.scale;
  expect(scaledWidth).toBeGreaterThanOrEqual(frame.width);
  expect(scaledHeight).toBeGreaterThanOrEqual(frame.height);
  expect(transform.left).toBeGreaterThanOrEqual(
    frame.left + frame.width - scaledWidth,
  );
  expect(transform.left).toBeLessThanOrEqual(frame.left);
  expect(transform.top).toBeGreaterThanOrEqual(
    frame.top + frame.height - scaledHeight,
  );
  expect(transform.top).toBeLessThanOrEqual(frame.top);
}

async function expectUploadError(
  promise: Promise<unknown>,
  code: AvatarUploadError["code"],
  message: string,
  cause?: unknown,
): Promise<void> {
  try {
    await promise;
    throw new Error("expected AvatarUploadError");
  } catch (error) {
    expect(error).toBeInstanceOf(AvatarUploadError);
    const uploadError = error as AvatarUploadError;
    expect(uploadError.code).toBe(code);
    expect(uploadError.message).toBe(message);
    if (cause !== undefined) {
      expect(uploadError.cause).toBe(cause);
    }
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("avatarUpload", () => {
  it("validates exact MIME types and the inclusive 10 MiB boundary", () => {
    for (const type of ["image/jpeg", "image/png", "image/webp"]) {
      expect(validateAvatarFile(createFile(type, MAX_AVATAR_BYTES))).toEqual({
        valid: true,
      });
    }

    expect(
      validateAvatarFile(createFile("image/png", MAX_AVATAR_BYTES + 1)),
    ).toEqual({
      valid: false,
      code: "file-too-large",
      message: "图片不能超过 10 MB。",
    });
  });

  it("checks MIME before size and returns fresh validation results", () => {
    const unsupported = createFile("IMAGE/PNG", MAX_AVATAR_BYTES + 1);
    const first = validateAvatarFile(unsupported);
    const second = validateAvatarFile(unsupported);
    expect(first).toEqual({
      valid: false,
      code: "unsupported-type",
      message: "请选择 JPG、PNG 或 WebP 图片。",
    });
    expect(first).not.toBe(second);
    expect(second).toEqual(first);
  });

  it("rejects invalid files before invoking injected environment functions", async () => {
    const environment = createEnvironment({ width: 200, height: 100 });
    const file = createFile("text/plain");
    await expectUploadError(
      loadAvatarFile(file, currentCardTemplate.avatarFrame, environment),
      "unsupported-type",
      "请选择 JPG、PNG 或 WebP 图片。",
    );
    expect(environment.readDataUrl).not.toHaveBeenCalled();
    expect(environment.loadImageSize).not.toHaveBeenCalled();
  });

  it("wraps injected read failures and rejects empty data URLs with safe errors", async () => {
    const frame = currentCardTemplate.avatarFrame;
    const file = createFile("image/png");
    const readError = new Error("private reader details");
    const readEnvironment = {
      readDataUrl: vi.fn(async () => {
        throw readError;
      }),
      loadImageSize: vi.fn(async () => ({
        width: 100,
        height: 100,
      })),
    };
    await expectUploadError(
      loadAvatarFile(file, frame, readEnvironment),
      "decode-failed",
      "无法读取图片，请重新选择。",
      readError,
    );
    expect(readEnvironment.loadImageSize).not.toHaveBeenCalled();

    const emptyEnvironment = createEnvironment({ width: 100, height: 100 }, "");
    await expectUploadError(
      loadAvatarFile(file, frame, emptyEnvironment),
      "decode-failed",
      "无法读取图片，请重新选择。",
    );

    const nonStringEnvironment = createEnvironment(
      { width: 100, height: 100 },
      "data:image/png;base64,ok",
    );
    nonStringEnvironment.readDataUrl.mockResolvedValueOnce(
      42 as unknown as string,
    );
    await expectUploadError(
      loadAvatarFile(file, frame, nonStringEnvironment),
      "decode-failed",
      "无法读取图片，请重新选择。",
    );
  });

  it("wraps image-size errors and rejects every invalid dimension", async () => {
    const file = createFile("image/png");
    const frame = currentCardTemplate.avatarFrame;
    const sizeError = new Error("private image details");
    const rejectedEnvironment = {
      readDataUrl: vi.fn(async () => "data:image/png;base64,ok"),
      loadImageSize: vi.fn(async () => {
        throw sizeError;
      }),
    };
    await expectUploadError(
      loadAvatarFile(file, frame, rejectedEnvironment),
      "load-failed",
      "图片加载失败，请重新选择。",
      sizeError,
    );

    for (const imageSize of [
      { width: 0, height: 100 },
      { width: -1, height: 100 },
      { width: Number.NaN, height: 100 },
      { width: 100, height: Number.POSITIVE_INFINITY },
    ]) {
      const environment = createEnvironment(imageSize);
      await expectUploadError(
        loadAvatarFile(file, frame, environment),
        "load-failed",
        "图片加载失败，请重新选择。",
      );
    }
  });

  it("centers cover transforms for current and legacy landscape and portrait frames", async () => {
    const file = createFile("image/webp");
    const cases = [
      {
        frame: currentCardTemplate.avatarFrame,
        imageSize: { width: 800, height: 400 },
      },
      {
        frame: currentCardTemplate.avatarFrame,
        imageSize: { width: 200, height: 800 },
      },
      {
        frame: legacyCardTemplate.avatarFrame,
        imageSize: { width: 800, height: 400 },
      },
      {
        frame: legacyCardTemplate.avatarFrame,
        imageSize: { width: 200, height: 800 },
      },
    ] as const;

    for (const { frame, imageSize } of cases) {
      const environment = createEnvironment(imageSize);
      const frameSnapshot = { ...frame };
      const result = await loadAvatarFile(file, frame, environment);
      const scale = getCoverScale(imageSize, frame);
      expect(result).toEqual({
        src: "data:image/png;base64,avatar",
        left: frame.left + (frame.width - imageSize.width * scale) / 2,
        top: frame.top + (frame.height - imageSize.height * scale) / 2,
        scale,
      });
      expectCover(result, imageSize, frame);
      expect(result).not.toBe(frame as unknown as AvatarTransform);
      expect(frame).toEqual(frameSnapshot);
      expect(environment.readDataUrl).toHaveBeenCalledWith(file);
      expect(environment.loadImageSize).toHaveBeenCalledWith(result.src);
    }
  });

  it("preserves input snapshots and returns a fresh transform after defensive clamping", async () => {
    const file = createFile("image/jpeg");
    const frame = Object.freeze({ ...currentCardTemplate.avatarFrame });
    const imageSize = Object.freeze({ width: 160, height: 90 });
    const environment = createEnvironment(imageSize);
    const before = JSON.stringify({ frame, imageSize });
    const result = await loadAvatarFile(file, frame, environment);
    expect(JSON.stringify({ frame, imageSize })).toBe(before);
    expect(result).not.toBe(environment);
    expect(result).not.toBe(imageSize as unknown as AvatarTransform);

    const candidate: AvatarTransform = {
      src: result.src,
      left: result.left,
      top: result.top,
      scale: result.scale,
    };
    expect(clampAvatarTransform(candidate, imageSize, frame)).toEqual(result);
  });

  it("keeps default FileReader and Image operations lazy and ordered", async () => {
    const events: string[] = [];
    let readerConstructed = 0;
    let imageConstructed = 0;
    class StubFileReader {
      result: unknown = null;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;

      constructor() {
        readerConstructed += 1;
      }

      readAsDataURL(): void {
        events.push("reader:start");
        this.result = "data:image/png;base64,default";
        queueMicrotask(() => {
          events.push("reader:load");
          this.onload?.();
        });
      }
    }
    class StubImage {
      naturalWidth = 800;
      naturalHeight = 400;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;

      constructor() {
        imageConstructed += 1;
      }

      set src(_value: string) {
        events.push("image:src");
        queueMicrotask(() => {
          events.push("image:load");
          this.onload?.();
        });
      }
    }
    vi.stubGlobal("FileReader", StubFileReader);
    vi.stubGlobal("Image", StubImage);
    expect(readerConstructed).toBe(0);
    expect(imageConstructed).toBe(0);

    const result = await loadAvatarFile(
      createFile("image/png"),
      currentCardTemplate.avatarFrame,
    );
    expect(result.src).toBe("data:image/png;base64,default");
    expect(readerConstructed).toBe(1);
    expect(imageConstructed).toBe(1);
    expect(events).toEqual([
      "reader:start",
      "reader:load",
      "image:src",
      "image:load",
    ]);
  });

  it("does not touch FileReader or Image while importing and validating", async () => {
    const readerConstructor = vi.fn();
    const imageConstructor = vi.fn();
    vi.stubGlobal(
      "FileReader",
      class {
        constructor() {
          readerConstructor();
        }
      },
    );
    vi.stubGlobal(
      "Image",
      class {
        constructor() {
          imageConstructor();
        }
      },
    );

    vi.resetModules();
    const freshModule = await import("@/editor/avatarUpload");
    expect(freshModule.validateAvatarFile(createFile("image/png"))).toEqual({
      valid: true,
    });
    await flushPromises();
    expect(readerConstructor).not.toHaveBeenCalled();
    expect(imageConstructor).not.toHaveBeenCalled();
  });
});
