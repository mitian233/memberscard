import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { mount, type VueWrapper } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import CardToolbar from "@/components/editor/CardToolbar.vue";
import type { TemplateId } from "@/types/card";

const toolbarSource = readFileSync(
  resolve(process.cwd(), "src/components/editor/CardToolbar.vue"),
  "utf8",
);

function mountToolbar(
  overrides: Partial<{
    templateId: TemplateId;
    dirty: boolean;
    busy: boolean;
  }> = {},
) {
  return mount(CardToolbar, {
    attachTo: document.body,
    props: {
      templateId: overrides.templateId ?? "current",
      dirty: overrides.dirty ?? false,
      busy: overrides.busy ?? false,
    },
  });
}

function templateButtons(wrapper: VueWrapper) {
  return wrapper.findAll("button[data-template]");
}

describe("CardToolbar", () => {
  it("renders the labelled header, stable template order, pressed state, and visible status", () => {
    const wrapper = mountToolbar({ templateId: "legacy", dirty: true });

    const header = wrapper.get("header");
    expect(header.get("h1").text()).toBe("会员证编辑器");
    expect(header.text()).toContain("直接编辑预览，同屏调整");

    const toolbar = header.get('[role="toolbar"]');
    expect(toolbar.attributes("aria-label")).toBe("编辑器工具");
    expect(templateButtons(wrapper).map((button) => button.text())).toEqual([
      "新版",
      "经典版",
    ]);
    expect(
      templateButtons(wrapper).map((button) =>
        button.attributes("data-template"),
      ),
    ).toEqual(["current", "legacy"]);
    expect(
      templateButtons(wrapper).map((button) =>
        button.attributes("aria-pressed"),
      ),
    ).toEqual(["false", "true"]);
    expect(wrapper.get('[role="status"]').text()).toBe("已修改");
    expect(wrapper.get("button[data-reset-all]").text()).toBe("全部重置");
  });

  it("emits one template-change for a new template, ignores the active template, and emits reset", async () => {
    const wrapper = mountToolbar({ templateId: "current" });
    const buttons = templateButtons(wrapper);

    await buttons[0].trigger("click");
    expect(wrapper.emitted("template-change")).toBeUndefined();

    await buttons[1].trigger("click");
    expect(wrapper.emitted("template-change")).toEqual([["legacy"]]);

    await wrapper.get("button[data-reset-all]").trigger("click");
    expect(wrapper.emitted("reset-all")).toEqual([[]]);
  });

  it("disables every action and suppresses direct DOM events while busy", async () => {
    const wrapper = mountToolbar({ busy: true });
    const controls = wrapper.findAll("button");
    expect(controls).toHaveLength(3);
    expect(
      controls.every((control) => control.attributes("disabled") !== undefined),
    ).toBe(true);

    for (const button of controls) {
      button.element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    }
    expect(wrapper.emitted("template-change")).toBeUndefined();
    expect(wrapper.emitted("reset-all")).toBeUndefined();

    expect(toolbarSource).toMatch(
      /\.toolbar-control\s*\{[^}]*min-height:\s*44px/,
    );
    expect(toolbarSource).toMatch(
      /\.toolbar-controls\s*\{[^}]*display:\s*flex;[^}]*flex-wrap:\s*wrap/,
    );
  });
});
