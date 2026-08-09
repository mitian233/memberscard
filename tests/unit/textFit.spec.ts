import { describe, expect, it, vi } from "vitest";

import { fitText } from "@/editor/textFit";

const measure = (_text: string, size: number): number => size * 10;

describe("fitText", () => {
  it("keeps the base size when the text fits", () => {
    expect(
      fitText({
        text: "fits",
        baseSize: 40,
        minSize: 18,
        maxWidth: 400,
        measure,
      }),
    ).toEqual({ fontSize: 40, valid: true });
  });

  it("descends to the first size that fits", () => {
    expect(
      fitText({
        text: "needs shrinking",
        baseSize: 40,
        minSize: 18,
        maxWidth: 240,
        measure,
      }),
    ).toEqual({ fontSize: 24, valid: true });
  });

  it("returns the minimum size as invalid when nothing fits", () => {
    expect(
      fitText({
        text: "too wide",
        baseSize: 40,
        minSize: 18,
        maxWidth: 170,
        measure,
      }),
    ).toEqual({ fontSize: 18, valid: false });
  });

  it("keeps empty text valid at the base size without measuring", () => {
    const measureSpy = vi.fn(measure);

    expect(
      fitText({
        text: "",
        baseSize: 40,
        minSize: 18,
        maxWidth: 1,
        measure: measureSpy,
      }),
    ).toEqual({ fontSize: 40, valid: true });
    expect(measureSpy).not.toHaveBeenCalled();
  });

  it("accepts a width exactly equal to the maximum", () => {
    expect(
      fitText({
        text: "boundary",
        baseSize: 40,
        minSize: 18,
        maxWidth: 240,
        measure,
      }),
    ).toEqual({ fontSize: 24, valid: true });
  });

  it("normalizes decimal bounds to integer sizes", () => {
    const measureSpy = vi.fn(measure);

    expect(
      fitText({
        text: "decimal bounds",
        baseSize: 40.9,
        minSize: 24.1,
        maxWidth: 250,
        measure: measureSpy,
      }),
    ).toEqual({ fontSize: 25, valid: true });
    expect(measureSpy.mock.calls.map(([, size]) => size)).toEqual([
      40, 39, 38, 37, 36, 35, 34, 33, 32, 31, 30, 29, 28, 27, 26, 25,
    ]);
  });

  it.each([
    ["baseSize", { baseSize: 0, minSize: 1, maxWidth: 10 }],
    ["minSize", { baseSize: 2, minSize: 0, maxWidth: 10 }],
    ["maxWidth", { baseSize: 2, minSize: 1, maxWidth: 0 }],
    ["non-finite option", { baseSize: Number.NaN, minSize: 1, maxWidth: 10 }],
    ["inverted bounds", { baseSize: 1, minSize: 2, maxWidth: 10 }],
  ])("rejects invalid %s options", (_label, options) => {
    expect(() => fitText({ text: "invalid", measure, ...options })).toThrow(
      RangeError,
    );
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1])(
    "rejects invalid measured width %s",
    (width) => {
      expect(() =>
        fitText({
          text: "invalid width",
          baseSize: 40,
          minSize: 18,
          maxWidth: 400,
          measure: () => width,
        }),
      ).toThrow(RangeError);
    },
  );
});
