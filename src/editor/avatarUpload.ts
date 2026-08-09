import { clampAvatarTransform, getCoverScale } from "@/editor/avatarGeometry";
import type {
  AvatarFrameDefinition,
  AvatarTransform,
  AvatarUploadErrorCode,
} from "@/types/card";

export type AvatarFileValidation =
  | { valid: true }
  | {
      valid: false;
      code: Extract<
        AvatarUploadErrorCode,
        "unsupported-type" | "file-too-large"
      >;
      message: string;
    };

export class AvatarUploadError extends Error {
  readonly code: AvatarUploadErrorCode;

  constructor(code: AvatarUploadErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = "AvatarUploadError";
    this.code = code;
    if (cause !== undefined) {
      Object.defineProperty(this, "cause", {
        configurable: true,
        enumerable: false,
        value: cause,
        writable: false,
      });
    }
  }
}

export interface AvatarUploadEnvironment {
  readDataUrl(file: File): Promise<string>;
  loadImageSize(source: string): Promise<{ width: number; height: number }>;
}

const MAX_AVATAR_BYTES = 10 * 1024 * 1024;
const SUPPORTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const UNSUPPORTED_TYPE_MESSAGE = "请选择 JPG、PNG 或 WebP 图片。";
const FILE_TOO_LARGE_MESSAGE = "图片不能超过 10 MB。";
const DECODE_FAILED_MESSAGE = "无法读取图片，请重新选择。";
const LOAD_FAILED_MESSAGE = "图片加载失败，请重新选择。";

export function validateAvatarFile(file: File): AvatarFileValidation {
  if (!SUPPORTED_TYPES.has(file.type)) {
    return {
      valid: false,
      code: "unsupported-type",
      message: UNSUPPORTED_TYPE_MESSAGE,
    };
  }

  if (file.size > MAX_AVATAR_BYTES) {
    return {
      valid: false,
      code: "file-too-large",
      message: FILE_TOO_LARGE_MESSAGE,
    };
  }

  return { valid: true };
}

function readDataUrlWithFileReader(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    let reader: FileReader;
    try {
      reader = new FileReader();
    } catch (error) {
      reject(error);
      return;
    }

    reader.onload = () => {
      resolve(typeof reader.result === "string" ? reader.result : "");
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error("FileReader failed"));
    };

    try {
      reader.readAsDataURL(file);
    } catch (error) {
      reject(error);
    }
  });
}

function loadImageSizeWithImage(source: string): Promise<{
  width: number;
  height: number;
}> {
  return new Promise((resolve, reject) => {
    let image: HTMLImageElement;
    try {
      image = new Image();
    } catch (error) {
      reject(error);
      return;
    }

    image.onload = () => {
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = (event) => {
      reject(event);
    };

    try {
      image.src = source;
    } catch (error) {
      reject(error);
    }
  });
}

const defaultEnvironment: AvatarUploadEnvironment = {
  readDataUrl: readDataUrlWithFileReader,
  loadImageSize: loadImageSizeWithImage,
};

function isValidImageSize(imageSize: {
  width: number;
  height: number;
}): boolean {
  return (
    Number.isFinite(imageSize.width) &&
    Number.isFinite(imageSize.height) &&
    imageSize.width > 0 &&
    imageSize.height > 0
  );
}

export async function loadAvatarFile(
  file: File,
  frame: AvatarFrameDefinition,
  environment: AvatarUploadEnvironment = defaultEnvironment,
): Promise<AvatarTransform> {
  const validation = validateAvatarFile(file);
  if (!validation.valid) {
    throw new AvatarUploadError(validation.code, validation.message);
  }

  let dataUrl: string;
  try {
    dataUrl = await environment.readDataUrl(file);
  } catch (error) {
    throw new AvatarUploadError("decode-failed", DECODE_FAILED_MESSAGE, error);
  }

  if (typeof dataUrl !== "string" || dataUrl.length === 0) {
    throw new AvatarUploadError("decode-failed", DECODE_FAILED_MESSAGE);
  }

  let imageSize: { width: number; height: number };
  try {
    imageSize = await environment.loadImageSize(dataUrl);
  } catch (error) {
    throw new AvatarUploadError("load-failed", LOAD_FAILED_MESSAGE, error);
  }

  if (!isValidImageSize(imageSize)) {
    throw new AvatarUploadError("load-failed", LOAD_FAILED_MESSAGE);
  }

  const scale = getCoverScale(imageSize, frame);
  const candidate: AvatarTransform = {
    src: dataUrl,
    left: frame.left + (frame.width - imageSize.width * scale) / 2,
    top: frame.top + (frame.height - imageSize.height * scale) / 2,
    scale,
  };
  return clampAvatarTransform(candidate, imageSize, frame);
}
