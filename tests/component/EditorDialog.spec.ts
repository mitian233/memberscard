import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import { nextTick } from "vue";
import EditorDialog from "@/components/editor/EditorDialog.vue";

const source = readFileSync(
  resolve(process.cwd(), "src/components/editor/EditorDialog.vue"),
  "utf8",
);
const wrappers: VueWrapper[] = [];

function mountDialog(
  props: { open?: boolean; title?: string; closeLabel?: string } = {},
  slots: Record<string, string> = {},
): VueWrapper {
  const wrapper = mount(EditorDialog, {
    attachTo: document.body,
    props: {
      open: props.open ?? false,
      title: props.title ?? "会员证预览",
      ...(props.closeLabel === undefined
        ? {}
        : { closeLabel: props.closeLabel }),
    },
    slots,
  });
  wrappers.push(wrapper);
  return wrapper;
}

afterEach(async () => {
  for (const wrapper of wrappers.splice(0)) {
    if (wrapper.exists()) {
      await wrapper.unmount();
    }
  }
});

describe("EditorDialog", () => {
  it("renders nothing while closed and exposes full dialog semantics when open", async () => {
    const wrapper = mountDialog({ open: false });
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);

    await wrapper.setProps({ open: true });
    await nextTick();
    const dialog = wrapper.get('[role="dialog"]');
    const heading = dialog.get("h2");
    expect(dialog.attributes("aria-modal")).toBe("true");
    expect(dialog.attributes("aria-labelledby")).toBe(heading.attributes("id"));
    expect(heading.text()).toBe("会员证预览");
    expect(dialog.get("button").attributes("type")).toBe("button");
    expect(dialog.get("button").attributes("aria-label")).toBe("关闭");
    expect(dialog.get(".editor-dialog-body").text()).toContain("");

    await wrapper.setProps({ title: "编辑会员证", closeLabel: "返回" });
    await nextTick();
    expect(wrapper.get("h2").text()).toBe("编辑会员证");
    expect(wrapper.get(".editor-dialog-close").text()).toBe("返回");

    await wrapper.setProps({ open: false });
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);

    const withSlots = mountDialog(
      { open: true },
      { default: "Dialog body", actions: "<button class=action>确认</button>" },
    );
    expect(withSlots.get(".editor-dialog-body").text()).toBe("Dialog body");
    expect(withSlots.get(".editor-dialog-actions").text()).toBe("确认");
  });

  it("captures opener, focuses close, and restores focus after close", async () => {
    const opener = document.createElement("button");
    opener.textContent = "打开";
    document.body.append(opener);
    opener.focus();
    const wrapper = mountDialog({ open: false });

    await wrapper.setProps({ open: true });
    await nextTick();
    await flushPromises();
    expect(document.activeElement).toBe(
      wrapper.get(".editor-dialog-close").element,
    );

    await wrapper.setProps({ open: false });
    await nextTick();
    await flushPromises();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it("closes once for Escape and traps Tab in both directions", async () => {
    const wrapper = mountDialog(
      { open: true },
      {
        default:
          '<button class="first">First</button><a class="link" href="#">Link</a><input class="field" />',
      },
    );
    await nextTick();
    const dialog = wrapper.get('[role="dialog"]');
    const close = wrapper.get(".editor-dialog-close")
      .element as HTMLButtonElement;
    const first = wrapper.get(".first").element as HTMLButtonElement;
    const link = wrapper.get(".link").element as HTMLAnchorElement;
    const field = wrapper.get(".field").element as HTMLInputElement;
    close.focus();

    const firstTab = new KeyboardEvent("keydown", {
      key: "Tab",
      bubbles: true,
      cancelable: true,
    });
    dialog.element.dispatchEvent(firstTab);
    expect(firstTab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(first);

    field.focus();
    const lastTab = new KeyboardEvent("keydown", {
      key: "Tab",
      bubbles: true,
      cancelable: true,
    });
    dialog.element.dispatchEvent(lastTab);
    expect(lastTab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(close);

    close.focus();
    const reverseTab = new KeyboardEvent("keydown", {
      key: "Tab",
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    dialog.element.dispatchEvent(reverseTab);
    expect(reverseTab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(field);
    expect(link.isConnected).toBe(true);

    const escape = new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    });
    dialog.element.dispatchEvent(escape);
    dialog.element.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(escape.defaultPrevented).toBe(true);
    expect(wrapper.emitted("close")).toEqual([[]]);
  });

  it.each([
    {
      label: "hidden attribute",
      ancestor:
        '<div hidden><button class="hidden-target">Hidden</button></div>',
    },
    {
      label: "aria-hidden attribute",
      ancestor:
        '<div aria-hidden="true"><button class="hidden-target">Hidden</button></div>',
    },
    {
      label: "display none",
      ancestor:
        '<div style="display: none"><button class="hidden-target">Hidden</button></div>',
    },
    {
      label: "visibility hidden",
      ancestor:
        '<div style="visibility: hidden"><button class="hidden-target">Hidden</button></div>',
    },
  ])(
    "excludes $label ancestors from focus candidates",
    async ({ ancestor }) => {
      const wrapper = mountDialog(
        { open: true },
        {
          default: `${ancestor}<button class="visible-target">Visible</button>`,
        },
      );
      await nextTick();
      const close = wrapper.get(".editor-dialog-close").element;
      const visible = wrapper.get(".visible-target").element;
      close.focus();
      const tab = new KeyboardEvent("keydown", {
        key: "Tab",
        bubbles: true,
        cancelable: true,
      });
      wrapper.get('[role="dialog"]').element.dispatchEvent(tab);
      expect(tab.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(visible);
      await wrapper.unmount();
    },
  );

  it("closes only for backdrop clicks and supports the no-target focus fallback", async () => {
    const wrapper = mountDialog({ open: true }, { default: "Body" });
    await nextTick();
    const backdrop = wrapper.get(".editor-dialog-backdrop").element;
    const dialog = wrapper.get('[role="dialog"]').element;
    dialog.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(wrapper.emitted("close")).toBeUndefined();
    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    backdrop.dispatchEvent(click);
    expect(wrapper.emitted("close")).toEqual([[]]);

    const pointerDialog = mountDialog({ open: true }, { default: "Pointer" });
    await nextTick();
    pointerDialog
      .get(".editor-dialog-backdrop")
      .element.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true }),
      );
    expect(pointerDialog.emitted("close")).toEqual([[]]);

    const noTargets = mountDialog({ open: true }, { default: "No controls" });
    await nextTick();
    (
      noTargets.get(".editor-dialog-close").element as HTMLButtonElement
    ).disabled = true;
    const tab = new KeyboardEvent("keydown", {
      key: "Tab",
      bubbles: true,
      cancelable: true,
    });
    noTargets.get('[role="dialog"]').element.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(
      noTargets.get('[role="dialog"]').element,
    );
  });

  it("guards stale handlers, restores focus on unmount, and tolerates disconnected openers", async () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    const wrapper = mountDialog({ open: true });
    await nextTick();
    const dialog = wrapper.get('[role="dialog"]').element;
    const handlerEvent = new KeyboardEvent("keydown", {
      key: "Escape",
      cancelable: true,
      bubbles: true,
    });
    await wrapper.setProps({ open: false });
    dialog.dispatchEvent(handlerEvent);
    expect(wrapper.emitted("close")).toBeUndefined();
    await wrapper.setProps({ open: true });
    await nextTick();
    opener.remove();
    await wrapper.setProps({ open: false });
    await nextTick();
    expect(() => dialog.dispatchEvent(new Event("click"))).not.toThrow();

    const unmountOpener = document.createElement("button");
    document.body.append(unmountOpener);
    unmountOpener.focus();
    const unmountWrapper = mountDialog({ open: true });
    await nextTick();
    await unmountWrapper.unmount();
    expect(document.activeElement).toBe(unmountOpener);
    unmountOpener.remove();
  });

  it("restores a captured opener when close is followed by same-tick unmount", async () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    const wrapper = mountDialog({ open: true });
    await nextTick();
    await wrapper.setProps({ open: false });
    await wrapper.unmount();
    await nextTick();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it("fresh-imports without requiring a document global", async () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, "document");
    let reads = 0;
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      get() {
        const stack = new Error().stack ?? "";
        if (/src[\\/]components[\\/]editor[\\/]EditorDialog/i.test(stack)) {
          reads += 1;
          throw new Error("document read during import");
        }
        return descriptor?.value;
      },
    });
    try {
      const freshImport = await import("@/components/editor/EditorDialog.vue");
      expect(freshImport.default).toBeDefined();
      expect(reads).toBe(0);
    } finally {
      if (descriptor === undefined) {
        Reflect.deleteProperty(globalThis, "document");
      } else {
        Object.defineProperty(globalThis, "document", descriptor);
      }
    }
  });

  it("does not require document during setup and locks scoped accessibility CSS", () => {
    expect(source).toMatch(/<style\s+scoped>/i);
    const scopedStyle = source.match(
      /<style\s+scoped>([\s\S]*?)<\/style>/i,
    )?.[1];
    expect(scopedStyle).toBeTruthy();
    expect(scopedStyle).not.toMatch(/position\s*:\s*sticky/i);
    expect(scopedStyle).toMatch(
      /\.editor-dialog-backdrop\s*\{[^}]*box-sizing:\s*border-box[^}]*overflow:\s*auto/i,
    );
    expect(scopedStyle).toMatch(
      /\.editor-dialog-panel\s*\{[^}]*box-sizing:\s*border-box[^}]*max-height:\s*min\(\s*100%\s*,\s*calc\(\s*100dvh\s*-\s*2rem\s*-\s*env\(safe-area-inset-top\)\s*-\s*env\(safe-area-inset-bottom\)\s*\)\s*\)/i,
    );
    expect(scopedStyle).toMatch(
      /\.editor-dialog-close\s*\{[^}]*min-(?:width|height):\s*44px[^}]*min-(?:width|height):\s*44px/i,
    );
    expect(scopedStyle).toMatch(
      /\.editor-dialog-close:focus-visible[^}]*\{[^}]*outline:\s*(?!none\b)[^;}]+/i,
    );
    expect(scopedStyle).toMatch(
      /\.editor-dialog-actions\s*:deep\(button\)[^}]*\{[^}]*min-width:\s*44px[^}]*min-height:\s*44px/i,
    );
    expect(scopedStyle).toMatch(/position:\s*fixed/i);
    expect(scopedStyle).toMatch(/max-height:[^;]*100dvh/i);
    expect(scopedStyle).toMatch(/safe-area-inset-(?:top|bottom)/i);
  });
});
