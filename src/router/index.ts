import {
  createRouter,
  createWebHistory,
  type RouteRecordRaw,
} from "vue-router";

const cardEditorView = () => import("../views/CardEditorView.vue");

export const routes = [
  {
    path: "/",
    name: "home",
    component: () => import("../views/HomeView.vue"),
  },
  {
    path: "/old",
    name: "old",
    component: () => import("../views/OldVerView.vue"),
  },
  {
    path: "/editor/current",
    name: "editor-current",
    component: cardEditorView,
    props: { initialTemplateId: "current" },
  },
  {
    path: "/editor/legacy",
    name: "editor-legacy",
    component: cardEditorView,
    props: { initialTemplateId: "legacy" },
  },
] as const satisfies readonly RouteRecordRaw[];

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
});

export default router;
