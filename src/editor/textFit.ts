export type TextMeasure = (text: string, fontSize: number) => number;

export interface FitTextOptions {
  text: string;
  baseSize: number;
  minSize: number;
  maxWidth: number;
  measure: TextMeasure;
}

export interface FitTextResult {
  fontSize: number;
  valid: boolean;
}

function assertPositiveFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${label} must be a finite positive number`);
  }
}

/** Fit text by trying each integer font size from the base down to the minimum. */
export function fitText({
  text,
  baseSize,
  minSize,
  maxWidth,
  measure,
}: FitTextOptions): FitTextResult {
  assertPositiveFinite(baseSize, "base size");
  assertPositiveFinite(minSize, "minimum size");
  assertPositiveFinite(maxWidth, "maximum width");

  if (baseSize < minSize) {
    throw new RangeError(
      "base size must be greater than or equal to minimum size",
    );
  }

  if (text.length === 0) {
    return { fontSize: baseSize, valid: true };
  }

  const firstSize = Math.floor(baseSize);
  const minimumSize = Math.ceil(minSize);

  for (let fontSize = firstSize; fontSize >= minimumSize; fontSize -= 1) {
    const width = measure(text, fontSize);
    if (!Number.isFinite(width) || width < 0) {
      throw new RangeError("measured width must be finite and non-negative");
    }

    if (width <= maxWidth) {
      return { fontSize, valid: true };
    }
  }

  return { fontSize: minimumSize, valid: false };
}
