import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { mount, type VueWrapper } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import ExportActions from "@/components/editor/ExportActions.vue";

const exportSource = readFileSync(
  resolve(process.cwd(), "src/components/editor/ExportActions.vue"),
  "utf8",
);

function mountExport(
  overrides: Partial<{
    busy: boolean;
    isExporting: boolean;
    canExport: boolean;
    canCopy: boolean;
    statusMessage: string;
    copyUnavailableReason?: string;
  }> = {},
) {
  return mount(ExportActions, {
    attachTo: document.body,
    props: {
      busy: overrides.busy ?? false,
      isExporting: overrides.isExporting ?? false,
      canExport: overrides.canExport ?? true,
      canCopy: overrides.canCopy ?? true,
      statusMessage: overrides.statusMessage ?? "",
      copyUnavailableReason: overrides.copyUnavailableReason,
    },
  });
}

function actionButtons(wrapper: VueWrapper) {
  return wrapper.findAll("button[data-action]");
}

describe("ExportActions", () => {
  it("renders the labelled section, stable action order, working labels, and persistent live status", async () => {
    const wrapper = mountExport({
      busy: true,
      isExporting: false,
      statusMessage: "正在复制图片…",
    });
    const section = wrapper.get("section");
    expect(section.classes()).toEqual(
      expect.arrayContaining(["card", "border", "bg-base-100"]),
    );
    const heading = section.get("h2");
    expect(heading.text()).toBe("导出图片");
    expect(section.attributes("aria-labelledby")).toBe(
      heading.attributes("id"),
    );

    expect(actionButtons(wrapper).map((button) => button.text())).toEqual([
      "正在复制…",
      "保存 PNG",
    ]);
    expect(actionButtons(wrapper)[0].classes()).toContain("btn-outline");
    expect(actionButtons(wrapper)[1].classes()).toContain("btn-primary");
    const status = wrapper.get('[role="status"]');
    expect(status.attributes("aria-live")).toBe("polite");
    expect(status.attributes("aria-atomic")).toBe("true");
    expect(status.text()).toBe("正在复制图片…");

    await wrapper.setProps({
      busy: true,
      isExporting: true,
      statusMessage: "正在导出图片…",
    });
    expect(actionButtons(wrapper).map((button) => button.text())).toEqual([
      "复制图片",
      "正在导出…",
    ]);
    expect(status.text()).toBe("正在导出图片…");
  });

  it("emits enabled copy and export actions exactly once and exposes optional recovery help", async () => {
    const wrapper = mountExport({
      copyUnavailableReason: "请允许剪贴板权限后重试",
    });
    const buttons = actionButtons(wrapper);
    expect(buttons.map((button) => button.text())).toEqual([
      "复制图片",
      "保存 PNG",
    ]);
    expect(buttons[0].attributes("aria-describedby")).toBeTruthy();
    const helpId = buttons[0].attributes("aria-describedby")!;
    expect(wrapper.get(`#${helpId}`).text()).toBe("请允许剪贴板权限后重试");

    await buttons[0].trigger("click");
    await buttons[1].trigger("click");
    expect(wrapper.emitted("copy")).toEqual([[]]);
    expect(wrapper.emitted("export")).toEqual([[]]);
  });

  it("omits copy recovery help and description when the reason is explicitly empty", () => {
    const wrapper = mountExport({ copyUnavailableReason: "" });

    expect(wrapper.find("[data-copy-help]").exists()).toBe(false);
    expect(
      actionButtons(wrapper)[0].attributes("aria-describedby"),
    ).toBeUndefined();
  });

  it("keeps both actions disabled and inert during copy and export work even when allowed", () => {
    const copyWrapper = mountExport({
      busy: true,
      isExporting: false,
      canCopy: true,
      canExport: true,
    });
    const copyButtons = actionButtons(copyWrapper);
    expect(copyButtons.map((button) => button.text())).toEqual([
      "正在复制…",
      "保存 PNG",
    ]);
    expect(
      copyButtons.every(
        (button) => button.attributes("disabled") !== undefined,
      ),
    ).toBe(true);
    for (const button of copyButtons) {
      button.element.removeAttribute("disabled");
      button.element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    }
    expect(copyWrapper.emitted("copy")).toBeUndefined();
    expect(copyWrapper.emitted("export")).toBeUndefined();

    const exportWrapper = mountExport({
      busy: true,
      isExporting: true,
      canCopy: true,
      canExport: true,
    });
    const exportButtons = actionButtons(exportWrapper);
    expect(exportButtons.map((button) => button.text())).toEqual([
      "复制图片",
      "正在导出…",
    ]);
    expect(
      exportButtons.every(
        (button) => button.attributes("disabled") !== undefined,
      ),
    ).toBe(true);
    for (const button of exportButtons) {
      button.element.removeAttribute("disabled");
      button.element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    }
    expect(exportWrapper.emitted("copy")).toBeUndefined();
    expect(exportWrapper.emitted("export")).toBeUndefined();
  });

  it("disables unavailable actions and suppresses direct DOM events without inferring a help message", async () => {
    const wrapper = mountExport({ canCopy: false, canExport: false });
    const buttons = actionButtons(wrapper);
    expect(buttons[0].attributes("disabled")).toBeDefined();
    expect(buttons[1].attributes("disabled")).toBeDefined();
    expect(buttons[0].attributes("aria-describedby")).toBeUndefined();
    expect(wrapper.find("[data-copy-help]").exists()).toBe(false);

    for (const button of buttons) {
      button.element.removeAttribute("disabled");
      button.element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    }
    expect(wrapper.emitted("copy")).toBeUndefined();
    expect(wrapper.emitted("export")).toBeUndefined();

    expect(exportSource).toMatch(/\.export-action\s*\{[^}]*min-height:\s*44px/);
    expect(exportSource).toMatch(
      /\.export-controls\s*\{[^}]*display:\s*flex;[^}]*flex-wrap:\s*wrap/,
    );
    expect(exportSource).toMatch(
      /\.export-action:focus-visible\s*\{[^}]*outline:(?!\s*none\b)\s*[^;}]+/,
    );
    const scopedStyle = exportSource.match(
      /<style\s+scoped>([\s\S]*?)<\/style>/i,
    )?.[1];
    expect(scopedStyle).toBeTruthy();
    expect(scopedStyle).not.toMatch(/position\s*:\s*(?:fixed|sticky)/i);
  });
});
