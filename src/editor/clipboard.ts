export type CopyCardPngResult = "copied" | "unsupported" | "denied";

export interface ClipboardEnvironment {
  readonly clipboard?: Pick<Clipboard, "write">;
  createClipboardItem?: (items: Record<string, Blob>) => ClipboardItem;
}

function resolveDefaultEnvironment(): ClipboardEnvironment {
  let clipboard: Pick<Clipboard, "write"> | undefined;
  let ClipboardItemConstructor: typeof ClipboardItem | undefined;

  try {
    clipboard = globalThis.navigator?.clipboard;
  } catch {
    clipboard = undefined;
  }
  try {
    ClipboardItemConstructor = globalThis.ClipboardItem;
  } catch {
    ClipboardItemConstructor = undefined;
  }

  return {
    clipboard,
    createClipboardItem:
      typeof ClipboardItemConstructor === "function"
        ? (items) => new ClipboardItemConstructor(items)
        : undefined,
  };
}

function resolveEnvironment(
  environment?: ClipboardEnvironment,
): ClipboardEnvironment {
  return environment ?? resolveDefaultEnvironment();
}

export function isPngClipboardAvailable(
  environment?: ClipboardEnvironment,
): boolean {
  let resolved: ClipboardEnvironment;
  try {
    resolved = resolveEnvironment(environment);
    return (
      typeof resolved.clipboard?.write === "function" &&
      typeof resolved.createClipboardItem === "function"
    );
  } catch {
    return false;
  }
}

export async function copyCardPng(
  blob: Blob,
  environment?: ClipboardEnvironment,
): Promise<CopyCardPngResult> {
  if (blob.type !== "image/png") {
    throw new TypeError("A PNG blob is required");
  }

  let resolved: ClipboardEnvironment;
  try {
    resolved = resolveEnvironment(environment);
  } catch {
    return "unsupported";
  }

  if (!isPngClipboardAvailable(resolved)) {
    return "unsupported";
  }

  try {
    const item = resolved.createClipboardItem?.({ "image/png": blob });
    if (item === undefined || resolved.clipboard === undefined) {
      return "unsupported";
    }
    await resolved.clipboard.write([item]);
    return "copied";
  } catch {
    return "denied";
  }
}
