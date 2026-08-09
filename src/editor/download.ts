const DOWNLOAD_ERROR_MESSAGE = "图片下载失败，请重试。";

export class CardDownloadError extends Error {
  readonly code = "download-failed" as const;

  constructor(message = DOWNLOAD_ERROR_MESSAGE, options?: ErrorOptions) {
    super(message, options);
    this.name = "CardDownloadError";
  }
}

export interface DownloadEnvironment {
  createObjectUrl(blob: Blob): string;
  revokeObjectUrl(url: string): void;
  createAnchor(): HTMLAnchorElement;
  appendAnchor(anchor: HTMLAnchorElement): void;
  removeAnchor(anchor: HTMLAnchorElement): void;
}

function createDefaultEnvironment(): DownloadEnvironment {
  return {
    createObjectUrl(blob) {
      return URL.createObjectURL(blob);
    },
    revokeObjectUrl(url) {
      URL.revokeObjectURL(url);
    },
    createAnchor() {
      return document.createElement("a");
    },
    appendAnchor(anchor) {
      document.body.append(anchor);
    },
    removeAnchor(anchor) {
      document.body.removeChild(anchor);
    },
  };
}

function validateInputs(blob: Blob, filename: string): string {
  if (
    typeof Blob === "undefined" ||
    !(blob instanceof Blob) ||
    blob.type !== "image/png"
  ) {
    throw new TypeError("A PNG Blob is required.");
  }

  const trimmedFilename = filename.trim();
  if (trimmedFilename === "" || !/\.png$/i.test(trimmedFilename)) {
    throw new TypeError("A non-empty PNG filename is required.");
  }
  return trimmedFilename;
}

export function downloadCardPng(
  blob: Blob,
  filename: string,
  environment?: DownloadEnvironment,
): void {
  const trimmedFilename = validateInputs(blob, filename);
  const resolvedEnvironment = environment ?? createDefaultEnvironment();
  let objectUrl: string | undefined;
  let anchor: HTMLAnchorElement | undefined;
  let workFailed = false;
  let workError: unknown;
  let cleanupFailed = false;
  let cleanupError: unknown;

  try {
    objectUrl = resolvedEnvironment.createObjectUrl(blob);
    anchor = resolvedEnvironment.createAnchor();
    anchor.href = objectUrl;
    anchor.download = trimmedFilename;
    anchor.hidden = true;
    anchor.setAttribute("aria-hidden", "true");
    resolvedEnvironment.appendAnchor(anchor);
    anchor.click();
  } catch (error) {
    workFailed = true;
    workError = error;
  } finally {
    if (anchor !== undefined) {
      try {
        resolvedEnvironment.removeAnchor(anchor);
      } catch (error) {
        if (!cleanupFailed) {
          cleanupFailed = true;
          cleanupError = error;
        }
      }
    }
    if (objectUrl !== undefined) {
      try {
        resolvedEnvironment.revokeObjectUrl(objectUrl);
      } catch (error) {
        if (!cleanupFailed) {
          cleanupFailed = true;
          cleanupError = error;
        }
      }
    }
  }

  if (workFailed || cleanupFailed) {
    throw new CardDownloadError(DOWNLOAD_ERROR_MESSAGE, {
      cause: workFailed ? workError : cleanupError,
    });
  }
}
