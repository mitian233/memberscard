import { describe, expect, it } from "vitest";

import membersBackground from "@/assets/memberscard_bg.svg?raw";
import legacyBackground from "@/assets/oldVerBg.svg?raw";
import ringLogo from "@/assets/ring_logo.svg?raw";

function readSvgSize(source: string) {
  const svg = new DOMParser().parseFromString(
    source,
    "image/svg+xml",
  ).documentElement;
  return {
    width: svg.getAttribute("width"),
    height: svg.getAttribute("height"),
    viewBox: svg.getAttribute("viewBox"),
  };
}

describe("card SVG intrinsic dimensions", () => {
  it.each([
    ["current background", membersBackground, "840", "560", "0 0 840 560"],
    ["legacy background", legacyBackground, "840", "560", "0 0 840 560"],
    ["RiNG logo", ringLogo, "795", "328", "0 0 795 328"],
  ])(
    "keeps the %s intrinsic size aligned with its viewBox",
    (_name, source, width, height, viewBox) => {
      expect(readSvgSize(source)).toEqual({ width, height, viewBox });
    },
  );
});
