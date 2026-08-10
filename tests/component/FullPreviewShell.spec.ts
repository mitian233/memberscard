import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, nextTick, onMounted, ref } from "vue";
import FullPreviewShell from "@/components/editor/FullPreviewShell.vue";

const wrappers: VueWrapper[] = [];

function mountShell(
  slot: ReturnType<typeof h> | string = "预览内容",
): VueWrapper {
  const slotContent =
    typeof slot === "string" ? h("div", { innerHTML: slot }) : slot;
  const wrapper = mount(FullPreviewShell, {
    attachTo: document.body,
    slots: {
      default: () => slotContent,
    },
  });
  wrappers.push(wrapper);
  return wrapper;
}

function source(): string {
  return readFileSync(
    resolve(process.cwd(), "src/components/editor/FullPreviewShell.vue"),
    "utf8",
  );
}

function scopedStyle(): string {
  return source().match(/<style\s+scoped>([\s\S]*?)<\/style>/i)?.[1] ?? "";
}

interface CssBlock {
  selector: string;
  body: string;
}

function cssBlocks(css: string): CssBlock[] {
  const blocks: CssBlock[] = [];

  function visit(segment: string): void {
    let cursor = 0;
    while (cursor < segment.length) {
      const open = segment.indexOf("{", cursor);
      if (open < 0) {
        return;
      }
      let depth = 1;
      let close = open + 1;
      while (close < segment.length && depth > 0) {
        if (segment[close] === "{") {
          depth += 1;
        } else if (segment[close] === "}") {
          depth -= 1;
        }
        close += 1;
      }
      if (depth !== 0) {
        return;
      }
      const selector = segment.slice(cursor, open).trim();
      const body = segment.slice(open + 1, close - 1);
      if (body.includes("{")) {
        visit(body);
      } else {
        blocks.push({ selector, body });
      }
      cursor = close;
    }
  }

  visit(css);
  return blocks;
}

function mediaBody(css: string, mediaPattern: RegExp): string {
  const match = mediaPattern.exec(css);
  if (!match) {
    return "";
  }
  const open = css.indexOf("{", match.index);
  if (open < 0) {
    return "";
  }
  let depth = 1;
  let close = open + 1;
  while (close < css.length && depth > 0) {
    if (css[close] === "{") {
      depth += 1;
    } else if (css[close] === "}") {
      depth -= 1;
    }
    close += 1;
  }
  return depth === 0 ? css.slice(open + 1, close - 1) : "";
}

afterEach(async () => {
  for (const wrapper of wrappers.splice(0)) {
    if (wrapper.exists()) {
      await wrapper.unmount();
    }
  }
});

describe("FullPreviewShell", () => {
  it("renders one normal trigger and one persistent slot with compact CSS contract", () => {
    const wrapper = mountShell();
    expect(wrapper.findAll(".full-preview-trigger")).toHaveLength(1);
    expect(wrapper.get(".full-preview-trigger").text()).toBe("完整预览");
    expect(wrapper.get(".full-preview-trigger").classes()).toContain("btn");
    expect(wrapper.get(".full-preview-header").isVisible()).toBe(false);
    expect(wrapper.get(".full-preview-panel").classes()).not.toContain("card");
    const content = wrapper.get(".full-preview-content");
    expect(wrapper.findAll(".full-preview-content")).toHaveLength(1);
    expect(content.text()).toContain("预览内容");
    expect(content.isVisible()).toBe(true);
    expect(
      content.element.closest(".full-preview-overlay")?.getAttribute("style") ??
        "",
    ).not.toMatch(/display\s*:\s*none/i);
    expect(scopedStyle()).toBeTruthy();
    expect(scopedStyle()).not.toMatch(/gradient/i);
    expect(source()).toMatch(/\.full-preview-shell\s*\{[^}]*min-width:\s*0/);
    expect(source()).toMatch(
      /@media[\s\S]*?\.full-preview-trigger\s*\{[^}]*display:\s*inline-flex/,
    );
  });

  it("opens with dialog naming, focus, and post-transition open emission", async () => {
    const wrapper = mountShell();
    await wrapper.get(".full-preview-trigger").trigger("click");
    await nextTick();
    await flushPromises();
    const dialog = wrapper.get('[role="dialog"]');
    const heading = dialog.get("h2");
    expect(dialog.get(".full-preview-panel").classes()).toEqual(
      expect.arrayContaining(["card", "bg-base-100"]),
    );
    expect(dialog.attributes("aria-modal")).toBe("true");
    expect(dialog.attributes("aria-labelledby")).toBe(heading.attributes("id"));
    expect(heading.text()).toBe("完整会员证预览");
    expect(dialog.get(".full-preview-close").attributes("aria-label")).toBe(
      "关闭完整预览",
    );
    expect(document.activeElement).toBe(
      dialog.get(".full-preview-close").element,
    );
    expect(wrapper.emitted("open")).toEqual([[]]);
  });

  it("keeps one slotted subtree mounted across repeated open and close transitions", async () => {
    const mountCount = ref(0);
    const Probe = defineComponent({
      name: "PreviewProbe",
      setup() {
        onMounted(() => {
          mountCount.value += 1;
        });
        return () => h("div", { class: "preview-probe" }, "Canvas");
      },
    });
    const wrapper = mount(FullPreviewShell, {
      attachTo: document.body,
      slots: { default: () => h(Probe) },
    });
    wrappers.push(wrapper);
    await nextTick();
    const firstProbe = wrapper.get(".preview-probe").element;
    expect(mountCount.value).toBe(1);

    await wrapper.get(".full-preview-trigger").trigger("click");
    await nextTick();
    await wrapper.get(".full-preview-close").trigger("click");
    await nextTick();
    await wrapper.get(".full-preview-trigger").trigger("click");
    await nextTick();
    expect(mountCount.value).toBe(1);
    expect(wrapper.get(".preview-probe").element).toBe(firstProbe);
    expect(wrapper.findAll(".preview-probe")).toHaveLength(1);
  });

  it("closes from Escape, prevents default, emits once, and restores trigger focus", async () => {
    const wrapper = mountShell();
    const trigger = wrapper.get(".full-preview-trigger").element;
    await wrapper.get(".full-preview-trigger").trigger("click");
    await nextTick();
    const event = new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    });
    wrapper.get('[role="dialog"]').element.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    await nextTick();
    await flushPromises();
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
    expect(wrapper.emitted("close")).toEqual([[]]);
    expect(document.activeElement).toBe(trigger);

    wrapper.get(".full-preview-content").element.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(wrapper.emitted("close")).toHaveLength(1);
  });

  it("traps Tab in both directions and excludes hidden ancestors", async () => {
    const wrapper = mountShell(
      '<div hidden><button class="hidden-target">Hidden</button></div><div style="display: none"><button>Display hidden</button></div><div style="visibility: hidden"><button>Visibility hidden</button></div><div class="canvas-target" tabindex="0">Canvas</div><button class="last-target">Last</button>',
    );
    await wrapper.get(".full-preview-trigger").trigger("click");
    await nextTick();
    const dialog = wrapper.get('[role="dialog"]').element;
    const close = wrapper.get(".full-preview-close").element;
    const canvas = wrapper.get(".canvas-target").element;
    const last = wrapper.get(".last-target").element;

    const firstTab = new KeyboardEvent("keydown", {
      key: "Tab",
      bubbles: true,
      cancelable: true,
    });
    dialog.dispatchEvent(firstTab);
    expect(firstTab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(canvas);

    const secondTab = new KeyboardEvent("keydown", {
      key: "Tab",
      bubbles: true,
      cancelable: true,
    });
    dialog.dispatchEvent(secondTab);
    expect(document.activeElement).toBe(last);

    const wrapTab = new KeyboardEvent("keydown", {
      key: "Tab",
      bubbles: true,
      cancelable: true,
    });
    dialog.dispatchEvent(wrapTab);
    expect(document.activeElement).toBe(close);

    const reverseTab = new KeyboardEvent("keydown", {
      key: "Tab",
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    dialog.dispatchEvent(reverseTab);
    expect(document.activeElement).toBe(last);
  });

  it("excludes controls beneath an aria-hidden ancestor", async () => {
    const wrapper = mountShell(
      '<div aria-hidden="true"><button class="aria-hidden-target">Hidden</button></div><button class="visible-target">Visible</button>',
    );
    await wrapper.get(".full-preview-trigger").trigger("click");
    await nextTick();
    const dialog = wrapper.get('[role="dialog"]').element;
    const visible = wrapper.get(".visible-target").element;
    const ariaHidden = wrapper.get(".aria-hidden-target").element;
    const tab = new KeyboardEvent("keydown", {
      key: "Tab",
      bubbles: true,
      cancelable: true,
    });
    dialog.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(visible);
    expect(document.activeElement).not.toBe(ariaHidden);
  });

  it("restores or safely ignores focus during same-tick unmount, disconnected opener, and stale handlers", async () => {
    const wrapper = mountShell();
    await wrapper.get(".full-preview-trigger").trigger("click");
    await nextTick();
    const dialog = wrapper.get('[role="dialog"]').element;
    await wrapper.get(".full-preview-close").trigger("click");
    await wrapper.unmount();
    expect(() =>
      dialog.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      ),
    ).not.toThrow();

    const disconnected = mountShell();
    const disconnectedTrigger = disconnected.get(
      ".full-preview-trigger",
    ).element;
    await disconnected.get(".full-preview-trigger").trigger("click");
    await nextTick();
    disconnectedTrigger.remove();
    expect(() =>
      disconnected.get(".full-preview-close").trigger("click"),
    ).not.toThrow();
    await disconnected.unmount();

    const openUnmount = mountShell();
    await openUnmount.get(".full-preview-trigger").trigger("click");
    await nextTick();
    expect(() => openUnmount.unmount()).not.toThrow();
  });

  it("restores a connected external opener exactly once through close/unmount and open-unmount", async () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    const focusSpy = vi.spyOn(opener, "focus");
    focusSpy.mockClear();

    const closeUnmount = mountShell();
    closeUnmount
      .get(".full-preview-trigger")
      .element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await nextTick();
    closeUnmount
      .get(".full-preview-close")
      .element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await closeUnmount.unmount();
    await nextTick();
    await flushPromises();
    expect(document.activeElement).toBe(opener);
    expect(focusSpy).toHaveBeenCalledTimes(1);

    opener.focus();
    focusSpy.mockClear();
    const openUnmount = mountShell();
    openUnmount
      .get(".full-preview-trigger")
      .element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await nextTick();
    await openUnmount.unmount();
    await nextTick();
    await flushPromises();
    expect(document.activeElement).toBe(opener);
    expect(focusSpy).toHaveBeenCalledTimes(1);
    opener.remove();
  });

  it("fresh-imports without reading throwing document or HTMLElement globals", async () => {
    const documentDescriptor = Object.getOwnPropertyDescriptor(
      globalThis,
      "document",
    );
    const elementDescriptor = Object.getOwnPropertyDescriptor(
      globalThis,
      "HTMLElement",
    );
    let documentReads = 0;
    let elementReads = 0;
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      get() {
        const stack = new Error().stack ?? "";
        if (/src[\\/]components[\\/]editor[\\/]FullPreviewShell/i.test(stack)) {
          documentReads += 1;
          throw new Error("document read during import");
        }
        return documentDescriptor?.value;
      },
    });
    Object.defineProperty(globalThis, "HTMLElement", {
      configurable: true,
      get() {
        const stack = new Error().stack ?? "";
        if (/src[\\/]components[\\/]editor[\\/]FullPreviewShell/i.test(stack)) {
          elementReads += 1;
          throw new Error("HTMLElement read during import");
        }
        return elementDescriptor?.value;
      },
    });
    try {
      vi.resetModules();
      const freshImport =
        await import("@/components/editor/FullPreviewShell.vue");
      expect(freshImport.default).toBeDefined();
      expect(documentReads).toBe(0);
      expect(elementReads).toBe(0);
    } finally {
      if (documentDescriptor === undefined) {
        Reflect.deleteProperty(globalThis, "document");
      } else {
        Object.defineProperty(globalThis, "document", documentDescriptor);
      }
      if (elementDescriptor === undefined) {
        Reflect.deleteProperty(globalThis, "HTMLElement");
      } else {
        Object.defineProperty(globalThis, "HTMLElement", elementDescriptor);
      }
      vi.resetModules();
    }
  });

  it("locks expanded-only fixed overlay, safe-area overflow, touch targets, and focus outline", () => {
    const css = scopedStyle();
    expect(css).toBeTruthy();
    expect(css).not.toMatch(/gradient/i);
    expect(source()).toMatch(
      /\.full-preview-trigger\s*\{[^}]*min-width:\s*44px[^}]*min-height:\s*44px/,
    );
    expect(source()).toMatch(
      /\.full-preview-trigger:focus-visible[^{}]*\{[^}]*outline:\s*(?!\s*none\b)\s*[^;}]+/,
    );
    expect(source()).toMatch(
      /\.full-preview-shell\.is-expanded\s*\{[^}]*position:\s*fixed[^}]*inset:\s*0[^}]*overflow:\s*auto/,
    );
    expect(source()).toMatch(
      /\.full-preview-shell\.is-expanded\s*\{[^}]*env\(safe-area-inset-top\)[^}]*env\(safe-area-inset-bottom\)/,
    );
    expect(source()).not.toMatch(
      /\.full-preview-shell\s*\{[^}]*position:\s*fixed/,
    );
    expect(source()).not.toMatch(
      /\.full-preview-trigger\s*\{[^}]*position:\s*fixed/,
    );
    const blocks = cssBlocks(css);
    const contentBlock = blocks.find((block) =>
      /\.full-preview-content/.test(block.selector),
    );
    const panelBlock = blocks.find((block) =>
      /\.full-preview-panel/.test(block.selector),
    );
    expect(panelBlock?.body).toMatch(/width:\s*min\(100%,\s*60rem\)/i);
    expect(panelBlock?.body).toMatch(/max-width:\s*100%/i);
    expect(panelBlock?.body).toMatch(/min-width:\s*0/);
    expect(panelBlock?.body).toMatch(/overflow:\s*auto/);
    expect(contentBlock?.body).toMatch(/width:\s*100%/i);
    expect(contentBlock?.body).toMatch(/max-width:\s*100%/i);
    expect(contentBlock?.body).toMatch(/min-width:\s*0/);
    expect(contentBlock?.body).toMatch(/overflow-x:\s*auto/);
    const closeBlock = blocks.find((block) =>
      /\.full-preview-close\s*\{/.test(`${block.selector}{`),
    );
    expect(closeBlock?.body).toMatch(/min-width:\s*44px/);
    expect(closeBlock?.body).toMatch(/min-height:\s*44px/);
    for (const block of blocks.filter((entry) =>
      /position:\s*fixed/i.test(entry.body),
    )) {
      expect(block.selector).toMatch(/\.full-preview-shell\.is-expanded/);
    }
    const compactMedia = mediaBody(css, /@media\s*\(max-width:\s*64rem\)/i);
    expect(compactMedia).toMatch(
      /\.full-preview-trigger\s*\{[^}]*display:\s*inline-flex/,
    );
  });
});
