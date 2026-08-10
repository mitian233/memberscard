import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { mount, type VueWrapper } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { nextTick } from "vue";
import CardInspector from "@/components/editor/CardInspector.vue";
import { createCardDocument } from "@/editor/cardDocument";
import { currentCardTemplate } from "@/templates/currentCardTemplate";
import { legacyCardTemplate } from "@/templates/legacyCardTemplate";
import type {
  AvatarTransform,
  CardDocument,
  CardField,
  CardTemplateDefinition,
  FieldValidationError,
} from "@/types/card";

type InspectorGroup = "basic" | "avatar";

const inspectorSource = readFileSync(
  resolve(process.cwd(), "src/components/editor/CardInspector.vue"),
  "utf8",
);

function makeProps(
  template: CardTemplateDefinition = currentCardTemplate,
  overrides: Partial<{
    document: CardDocument;
    activeGroup: InspectorGroup;
    fieldErrors: Readonly<Partial<Record<CardField, FieldValidationError>>>;
    disabled: boolean;
  }> = {},
) {
  return {
    document: overrides.document ?? createCardDocument(template),
    template,
    activeGroup: overrides.activeGroup ?? ("basic" as const),
    fieldErrors: overrides.fieldErrors ?? {},
    disabled: overrides.disabled,
  };
}

function mountInspector(
  template: CardTemplateDefinition = currentCardTemplate,
  overrides: Parameters<typeof makeProps>[1] = {},
) {
  return mount(CardInspector, {
    attachTo: document.body,
    props: makeProps(template, overrides),
  });
}

function tab(wrapper: VueWrapper, label: string) {
  return wrapper
    .findAll('button[role="tab"]')
    .find((button) => button.text() === label)!;
}

describe("CardInspector", () => {
  it("renders a labelled inspector landmark, stable current fields, and unique label controls", () => {
    const wrapper = mountInspector();

    const root = wrapper.get("aside");
    const heading = wrapper.get("h2");
    expect(root.attributes("aria-labelledby")).toBe(heading.attributes("id"));
    expect(heading.text()).toBe("编辑控制台");
    expect(wrapper.text()).toContain("编辑卡片信息");

    const tabs = wrapper.findAll('[role="tab"]');
    expect(tabs.map((candidate) => candidate.text())).toEqual([
      "基本信息",
      "头像调整",
    ]);
    expect(tabs[0].attributes("aria-selected")).toBe("true");
    expect(tabs[1].attributes("aria-selected")).toBe("false");
    expect(tabs[0].attributes("tabindex")).toBe("0");
    expect(tabs[1].attributes("tabindex")).toBe("-1");

    const labels = wrapper.findAll("label");
    const controls = wrapper.findAll("input");
    expect(labels.length).toBe(controls.length);
    for (const label of labels) {
      const controlId = label.attributes("for");
      expect(controlId).toBeTruthy();
      expect(wrapper.find(`#${controlId}`).exists()).toBe(true);
    }
    expect(
      new Set(controls.map((control) => control.attributes("id"))).size,
    ).toBe(controls.length);
    expect(
      controls.map((control) => control.element.getAttribute("autocomplete")),
    ).toEqual(controls.map(() => "off"));

    const fieldLabels = wrapper
      .findAll(".field-label")
      .map((label) => label.text());
    expect(fieldLabels).toEqual(["姓名", "英文名", "乐队名", "出生日期"]);
    expect(
      wrapper.find('[role="tabpanel"]').attributes("aria-labelledby"),
    ).toBe(tabs[0].attributes("id"));
    expect(root.classes()).toEqual(
      expect.arrayContaining(["card", "border", "bg-base-100"]),
    );
    expect(tabs.every((candidate) => candidate.classes("tab"))).toBe(true);
    expect(
      wrapper
        .findAll("input[data-field]")
        .every((input) => input.classes().includes("input-bordered")),
    ).toBe(true);
  });

  it("only renders fields that have both template definitions and document values", () => {
    const legacyDocument = createCardDocument(legacyCardTemplate);
    const legacyWrapper = mountInspector(legacyCardTemplate, {
      document: legacyDocument,
    });
    expect(
      legacyWrapper.findAll(".field-label").map((label) => label.text()),
    ).toEqual(["姓名", "英文名", "乐队名"]);
    expect(legacyWrapper.text()).not.toContain("出生日期");

    const currentDocument = createCardDocument(currentCardTemplate);
    delete currentDocument.birthday;
    const currentWrapper = mountInspector(currentCardTemplate, {
      document: currentDocument,
    });
    expect(currentWrapper.text()).not.toContain("出生日期");
  });

  it("emits field updates and field-specific resets without mutating the document prop", async () => {
    const document = createCardDocument(currentCardTemplate);
    const before = { ...document, avatar: { ...document.avatar } };
    const wrapper = mountInspector(currentCardTemplate, { document });

    const nameInput = wrapper.get('input[data-field="name"]');
    await nameInput.setValue("新姓名");
    expect(wrapper.emitted("update-field")).toEqual([["name", "新姓名"]]);
    expect(document).toEqual(before);

    await wrapper.get('button[data-reset-field="name"]').trigger("click");
    expect(wrapper.emitted("reset-field")).toEqual([["name"]]);
    expect(document).toEqual(before);
    expect(
      wrapper.get('button[data-reset-field="name"]').attributes("aria-label"),
    ).toBe("重置姓名");
  });

  it("exposes validation errors through visible alert descriptions", () => {
    const error: FieldValidationError = {
      field: "name",
      code: "text-too-wide",
      message: "姓名过长",
    };
    const wrapper = mountInspector(currentCardTemplate, {
      fieldErrors: { name: error },
    });
    const nameInput = wrapper.get('input[data-field="name"]');
    const alert = wrapper.get('[role="alert"][data-field-error="name"]');
    expect(nameInput.attributes("aria-invalid")).toBe("true");
    expect(nameInput.attributes("aria-describedby")).toBe(
      alert.attributes("id"),
    );
    expect(alert.text()).toContain("姓名过长");
    expect(inspectorSource).toMatch(
      /\.field-error\s*\{[^}]*color:\s*#b42318[^}]*font-weight:\s*600/,
    );
    expect(inspectorSource).not.toMatch(
      /\.field-error\s*\{[^}]*border-left\s*:/,
    );
    expect(inspectorSource).not.toMatch(
      /\.field-error\s*\{[^}]*padding-left\s*:/,
    );
    expect(alert.attributes("role")).toBe("alert");
    expect(alert.attributes("data-field-error")).toBe("name");

    const birthdayInput = wrapper.get('input[data-field="birthday"]');
    expect(birthdayInput.attributes("aria-invalid")).not.toBe("true");
    expect(birthdayInput.attributes("aria-describedby")).toBeUndefined();
  });

  it("emits the first selected avatar file once and clears the input for reselection", async () => {
    const wrapper = mountInspector(currentCardTemplate, {
      activeGroup: "avatar",
    });
    const fileInput = wrapper.get('input[type="file"]');
    expect(fileInput.attributes("accept")).toBe(
      "image/png,image/jpeg,image/webp",
    );

    const file = new File(["avatar"], "avatar.png", { type: "image/png" });
    Object.defineProperty(fileInput.element, "files", {
      configurable: true,
      value: [file],
    });
    await fileInput.trigger("change");
    expect(wrapper.emitted("avatar-file")).toEqual([[file]]);
    expect(fileInput.element.value).toBe("");
  });

  it("emits fresh complete avatar transforms for finite numeric changes and ignores invalid values", async () => {
    const avatar: AvatarTransform = {
      src: "avatar.png",
      left: 4,
      top: 8,
      scale: 0.5,
    };
    const document = { ...createCardDocument(currentCardTemplate), avatar };
    const wrapper = mountInspector(currentCardTemplate, {
      activeGroup: "avatar",
      document,
    });
    const left = wrapper.get('input[data-avatar-field="left"]');
    const top = wrapper.get('input[data-avatar-field="top"]');
    const scale = wrapper.get('input[data-avatar-field="scale"]');

    await left.setValue("12");
    const first = wrapper.emitted("update-avatar")?.[0]?.[0] as AvatarTransform;
    expect(first).toEqual({ src: "avatar.png", left: 12, top: 8, scale: 0.5 });
    expect(first).not.toBe(avatar);
    first.top = 99;
    expect(avatar.top).toBe(8);

    await top.setValue("");
    expect(wrapper.emitted("update-avatar")).toHaveLength(1);
    Object.defineProperty(scale.element, "value", {
      configurable: true,
      value: "Infinity",
    });
    await scale.trigger("input");
    expect(wrapper.emitted("update-avatar")).toHaveLength(1);
  });

  it("pairs every avatar number with a DaisyUI range and syncs clamped prop values", async () => {
    const avatar: AvatarTransform = {
      src: "avatar.png",
      left: -120,
      top: 45,
      scale: 0.58,
    };
    const document = { ...createCardDocument(currentCardTemplate), avatar };
    const wrapper = mountInspector(currentCardTemplate, {
      activeGroup: "avatar",
      document,
    });
    const ranges = wrapper.findAll('input[type="range"][data-avatar-range]');
    expect(
      ranges.map((range) => range.attributes("data-avatar-range")),
    ).toEqual(["left", "top", "scale"]);
    expect(ranges[0].attributes()).toMatchObject({
      min: "-960",
      max: "960",
      step: "0.01",
      value: "-120",
    });
    expect(ranges[1].attributes()).toMatchObject({
      min: "-960",
      max: "960",
      step: "0.01",
      value: "45",
    });
    expect(ranges[2].attributes()).toMatchObject({
      min: "0.1",
      max: "3",
      step: "0.01",
      value: "0.58",
    });
    expect(
      ranges.every(
        (range) =>
          range.classes().includes("range") &&
          range.classes().includes("range-primary"),
      ),
    ).toBe(true);

    await ranges[0].setValue("-88");
    const emitted = wrapper.emitted("update-avatar")?.[0]?.[0];
    expect(emitted).toEqual({
      src: "avatar.png",
      left: -88,
      top: 45,
      scale: 0.58,
    });
    expect(emitted).not.toBe(avatar);

    const clampedDocument = {
      ...document,
      avatar: { ...avatar, left: -64, scale: 0.72 },
    };
    await wrapper.setProps({ document: clampedDocument });
    expect(
      wrapper.get('input[data-avatar-range="left"]').element,
    ).toHaveProperty("value", "-64");
    expect(
      wrapper.get('input[data-avatar-field="left"]').element,
    ).toHaveProperty("value", "-64");
    expect(
      wrapper.get('input[data-avatar-range="scale"]').element,
    ).toHaveProperty("value", "0.72");
  });

  it("emits the avatar reset action", async () => {
    const wrapper = mountInspector(currentCardTemplate, {
      activeGroup: "avatar",
    });
    await wrapper.get("button[data-reset-avatar]").trigger("click");
    expect(wrapper.emitted("reset-avatar")).toEqual([[]]);
  });

  it("supports mouse and roving keyboard tab selection with wrapping and focus movement", async () => {
    const wrapper = mountInspector();
    const basicTab = tab(wrapper, "基本信息");
    const avatarTab = tab(wrapper, "头像调整");

    await avatarTab.trigger("click");
    expect(wrapper.emitted("update:activeGroup")).toEqual([["avatar"]]);
    await wrapper.setProps({ activeGroup: "avatar" });
    expect(wrapper.get('[role="tabpanel"]').attributes("aria-labelledby")).toBe(
      avatarTab.attributes("id"),
    );

    await avatarTab.trigger("keydown", { key: "ArrowRight" });
    expect(wrapper.emitted("update:activeGroup")).toEqual([
      ["avatar"],
      ["basic"],
    ]);
    expect(document.activeElement).toBe(basicTab.element);

    await basicTab.trigger("keydown", { key: "ArrowUp" });
    expect(wrapper.emitted("update:activeGroup")).toEqual([
      ["avatar"],
      ["basic"],
      ["avatar"],
    ]);
    expect(document.activeElement).toBe(avatarTab.element);
    await avatarTab.trigger("keydown", { key: "Home" });
    expect(wrapper.emitted("update:activeGroup")).toEqual([
      ["avatar"],
      ["basic"],
      ["avatar"],
      ["basic"],
    ]);
    await basicTab.trigger("keydown", { key: "End" });
    expect(wrapper.emitted("update:activeGroup")).toEqual([
      ["avatar"],
      ["basic"],
      ["avatar"],
      ["basic"],
      ["avatar"],
    ]);
  });

  it("disables every avatar control and suppresses edit, file, and reset emissions", async () => {
    const wrapper = mountInspector(currentCardTemplate, {
      activeGroup: "avatar",
      disabled: true,
    });
    const controls = wrapper.findAll("button, input");
    expect(controls.length).toBeGreaterThan(0);
    expect(
      controls.every((control) => control.attributes("disabled") !== undefined),
    ).toBe(true);
    expect(
      controls.every((control) => control.classes("inspector-control")),
    ).toBe(true);
    expect(wrapper.findAll('input[type="range"]')).toHaveLength(3);

    const left = wrapper.get('input[data-avatar-field="left"]');
    left.element.value = "12";
    left.element.dispatchEvent(new Event("input", { bubbles: true }));
    const fileInput = wrapper.get('input[type="file"]');
    const file = new File(["avatar"], "avatar.png", { type: "image/png" });
    Object.defineProperty(fileInput.element, "files", {
      configurable: true,
      value: [file],
    });
    fileInput.element.dispatchEvent(new Event("change", { bubbles: true }));
    wrapper
      .get("button[data-reset-avatar]")
      .element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await nextTick();

    expect(wrapper.emitted("update-avatar")).toBeUndefined();
    expect(wrapper.emitted("avatar-file")).toBeUndefined();
    expect(wrapper.emitted("reset-avatar")).toBeUndefined();
    expect(getComputedStyle(left.element).minHeight).toBe("");
    expect(inspectorSource).toMatch(
      /\.inspector-control\s*\{[^}]*min-height:\s*44px/,
    );
  });

  it("disables every basic control and suppresses field, reset, and tab emissions", async () => {
    const wrapper = mountInspector(currentCardTemplate, {
      activeGroup: "basic",
      disabled: true,
    });
    const controls = wrapper.findAll("button, input");
    expect(controls.length).toBeGreaterThan(0);
    expect(
      controls.every((control) => control.attributes("disabled") !== undefined),
    ).toBe(true);

    const nameInput = wrapper.get('input[data-field="name"]');
    nameInput.element.value = "blocked";
    nameInput.element.dispatchEvent(new Event("input", { bubbles: true }));
    wrapper
      .get('button[data-reset-field="name"]')
      .element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    wrapper
      .get('button[role="tab"][aria-selected="false"]')
      .element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await nextTick();

    expect(wrapper.emitted("update-field")).toBeUndefined();
    expect(wrapper.emitted("reset-field")).toBeUndefined();
    expect(wrapper.emitted("update:activeGroup")).toBeUndefined();
  });

  it("keeps disabled tabs inert for keyboard selection and focus", async () => {
    const wrapper = mountInspector(currentCardTemplate, {
      activeGroup: "basic",
      disabled: true,
    });
    const basicTab = tab(wrapper, "基本信息");
    const panel = wrapper.get('[role="tabpanel"]');
    await panel.element.focus();
    expect(document.activeElement).toBe(panel.element);

    basicTab.element.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
    );
    await nextTick();
    expect(document.activeElement).toBe(panel.element);
    expect(wrapper.emitted("update:activeGroup")).toBeUndefined();
  });
});
