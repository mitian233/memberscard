import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { nextTick, type PropType } from "vue";
import { RouterView, createMemoryHistory, createRouter } from "vue-router";
import router, { routes } from "@/router";
import type { CanvasSyncRequest } from "@/composables/useCardEditor";
import type { CardCanvasController } from "@/fabric/cardCanvasController";
import type { CardDocument, CardTemplateDefinition } from "@/types/card";

const routerSource = readFileSync(
  resolve(process.cwd(), "src/router/index.ts"),
  "utf8",
);

const canvasStub = vi.hoisted(() => ({
  name: "FabricCardCanvas",
  props: {
    document: { type: Object as PropType<CardDocument>, required: true },
    template: {
      type: Object as PropType<CardTemplateDefinition>,
      required: true,
    },
    syncRequest: {
      type: Object as PropType<CanvasSyncRequest>,
      required: true,
    },
    controller: {
      type: Object as PropType<CardCanvasController>,
      required: false,
    },
    disabled: { type: Boolean, required: true },
    loading: { type: Boolean, required: true },
  },
  emits: [
    "ready",
    "resource-error",
    "change",
    "selection-change",
    "edit-cancel",
    "validation-error",
  ],
  template: "<div data-router-canvas />",
}));

vi.mock("@/components/editor/FabricCardCanvas.vue", () => ({
  default: canvasStub,
}));

const wrappers: VueWrapper[] = [];

function memoryRouter(initial?: string) {
  const history = createMemoryHistory();
  if (initial !== undefined) {
    history.replace(initial);
  }
  return createRouter({
    history,
    routes,
  });
}

async function mountAt(path: string): Promise<{
  router: ReturnType<typeof memoryRouter>;
  wrapper: VueWrapper;
}> {
  const testRouter = memoryRouter(path);
  const wrapper = mount(RouterView, {
    attachTo: document.body,
    global: {
      plugins: [testRouter],
    },
  });
  wrappers.push(wrapper);
  await testRouter.isReady();
  await nextTick();
  await flushPromises();
  return { router: testRouter, wrapper };
}

afterEach(async () => {
  for (const wrapper of wrappers.splice(0)) {
    if (wrapper.exists()) {
      await wrapper.unmount();
    }
  }
});

describe("internal Fabric editor routes", () => {
  it("exports exactly four named paths and preserves existing lazy route loaders", () => {
    expect(router).toBeDefined();
    expect(router.options.routes).toBe(routes);
    expect(routerSource).toMatch(
      /createWebHistory\(\s*import\.meta\.env\.BASE_URL\s*\)/,
    );
    expect(routerSource).not.toMatch(/createMemoryHistory\s*\(/);
    expect(routes.map((route) => [route.path, route.name])).toEqual([
      ["/", "home"],
      ["/old", "old"],
      ["/editor/current", "editor-current"],
      ["/editor/legacy", "editor-legacy"],
    ]);

    const home = routes[0];
    const old = routes[1];
    expect(home.alias).toBeUndefined();
    expect(home.props).toBeUndefined();
    expect(home.beforeEnter).toBeUndefined();
    expect(home.children).toBeUndefined();
    expect(home.redirect).toBeUndefined();
    expect(old.alias).toBeUndefined();
    expect(old.props).toBeUndefined();
    expect(old.beforeEnter).toBeUndefined();
    expect(old.children).toBeUndefined();
    expect(old.redirect).toBeUndefined();
    expect(home.component).toBeTypeOf("function");
    expect(old.component).toBeTypeOf("function");
    expect(home.component?.toString()).toContain("HomeView.vue");
    expect(old.component?.toString()).toContain("OldVerView.vue");

    const current = routes[2];
    const legacy = routes[3];
    expect(current.component).toBe(legacy.component);
    expect(current.props).toEqual({ initialTemplateId: "current" });
    expect(legacy.props).toEqual({ initialTemplateId: "legacy" });
    expect(current.alias).toBeUndefined();
    expect(current.beforeEnter).toBeUndefined();
    expect(current.children).toBeUndefined();
    expect(current.redirect).toBeUndefined();
    expect(legacy.alias).toBeUndefined();
    expect(legacy.beforeEnter).toBeUndefined();
    expect(legacy.children).toBeUndefined();
    expect(legacy.redirect).toBeUndefined();
  });

  it("resolves current and legacy route props exactly", () => {
    const testRouter = memoryRouter();
    const current = testRouter.resolve("/editor/current");
    const legacy = testRouter.resolve("/editor/legacy");

    expect(current.name).toBe("editor-current");
    expect(current.matched.at(-1)?.props.default).toEqual({
      initialTemplateId: "current",
    });
    expect(legacy.name).toBe("editor-legacy");
    expect(legacy.matched.at(-1)?.props.default).toEqual({
      initialTemplateId: "legacy",
    });
  });

  it("mounts CardEditorView through RouterView with typed Canvas stub for both templates", async () => {
    const current = await mountAt("/editor/current");
    expect(current.wrapper.find("[data-router-canvas]").exists()).toBe(true);
    expect(
      current.wrapper
        .get('[data-template="current"]')
        .attributes("aria-pressed"),
    ).toBe("true");
    expect(
      current.wrapper
        .get('[data-template="legacy"]')
        .attributes("aria-pressed"),
    ).toBe("false");

    await current.wrapper.unmount();
    const legacy = await mountAt("/editor/legacy");
    expect(
      legacy.wrapper.get('[data-template="legacy"]').attributes("aria-pressed"),
    ).toBe("true");
    expect(
      legacy.wrapper
        .get('[data-template="current"]')
        .attributes("aria-pressed"),
    ).toBe("false");
  });

  it("supports direct memory-history entries for both editor URLs", async () => {
    for (const [path, activeTemplate] of [
      ["/editor/current", "current"],
      ["/editor/legacy", "legacy"],
    ] as const) {
      const testRouter = memoryRouter(path);
      const wrapper = mount(RouterView, {
        attachTo: document.body,
        global: {
          plugins: [testRouter],
        },
      });
      wrappers.push(wrapper);
      await testRouter.isReady();
      await nextTick();
      await flushPromises();
      expect(testRouter.currentRoute.value.path).toBe(path);
      expect(
        wrapper
          .get(`[data-template="${activeTemplate}"]`)
          .attributes("aria-pressed"),
      ).toBe("true");
    }
  });

  it("leaves unknown paths unmatched without redirect or alias", async () => {
    const testRouter = memoryRouter();
    const resolved = testRouter.resolve("/missing-editor-route");
    expect(resolved.matched).toHaveLength(0);
    expect(resolved.name).toBeUndefined();
    await testRouter.push("/missing-editor-route");
    expect(testRouter.currentRoute.value.matched).toHaveLength(0);
    expect(testRouter.currentRoute.value.path).toBe("/missing-editor-route");
  });
});
