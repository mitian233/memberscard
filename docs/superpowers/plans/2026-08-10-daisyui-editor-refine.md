# DaisyUI Card Editor Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refine the existing Fabric member-card editor into a cohesive DaisyUI studio interface while preserving every existing editing, accessibility, routing, and export contract.

**Architecture:** Keep `CardEditorView` and all composables as the unchanged orchestration layer. Apply DaisyUI classes and narrow scoped layout CSS within the existing presentation components; add range-plus-number avatar controls inside `CardInspector` while continuing to emit the same immutable `AvatarTransform` payloads.

**Tech Stack:** Vue 3.5 `<script setup lang="ts">`, DaisyUI 4.12, Tailwind CSS 3.4, Vitest 4, Vue Test Utils, Fabric.js 7.4.

## Global Constraints

- Do not change member-card templates, Fabric coordinates, canvas event contracts, export behavior, router semantics, or public component props/emits.
- Use the installed DaisyUI dependency; do not add another UI or icon package.
- Keep `CardEditorView` a composition surface and preserve props-down/events-up data flow.
- `left` and `top` sliders use `min=-960`, `max=960`, `step=0.01`; `scale` uses `min=0.1`, `max=3`, `step=0.01`.
- Existing geometry remains the only cover-clamp authority.
- All controls remain at least 44×44 CSS pixels, keyboard accessible, and usable at 390×844 and 1440×1000.
- Run the Impeccable detector exactly once after all UI files are finished.

## File Structure

- Modify `src/components/editor/CardToolbar.vue`: compact DaisyUI command bar and dirty-state badge.
- Modify `src/components/editor/CardInspector.vue`: DaisyUI card/tabs/forms and range-plus-number avatar controls.
- Modify `src/components/editor/ExportActions.vue`: DaisyUI primary/secondary export hierarchy and status feedback.
- Modify `src/components/editor/CardEditorWorkspace.vue`: studio shell, responsive grid, grouped status alerts.
- Modify `src/components/editor/FullPreviewShell.vue`: preview-stage surface and DaisyUI full-preview button/dialog styling.
- Modify `src/components/editor/FabricCardCanvas.vue`: preview frame surface only; no lifecycle or event changes.
- Modify `src/components/editor/EditorDialog.vue`: align existing dialog visuals with DaisyUI without replacing focus logic.
- Test existing matching component specs under `tests/component/`.

---

### Task 1: DaisyUI command and export hierarchy

**Files:**

- Modify: `tests/component/CardToolbar.spec.ts`
- Modify: `tests/component/ExportActions.spec.ts`
- Modify: `src/components/editor/CardToolbar.vue`
- Modify: `src/components/editor/ExportActions.vue`

**Interfaces:**

- Consumes: existing `CardToolbar` and `ExportActions` props/emits unchanged.
- Produces: DaisyUI button-group, badge, card, loading, and primary-action presentation contracts.

- [ ] **Step 1: Write failing DaisyUI hierarchy tests**

Add assertions equivalent to:

```ts
expect(wrapper.get("header").classes()).toEqual(
  expect.arrayContaining(["card", "bg-base-100"]),
);
expect(wrapper.get('[role="toolbar"]').classes()).toContain("join");
expect(wrapper.get('[role="status"]').classes()).toContain("badge");
expect(wrapper.get('button[data-action="copy"]').classes()).toContain(
  "btn-outline",
);
expect(wrapper.get('button[data-action="export"]').classes()).toContain(
  "btn-primary",
);
```

Keep the existing exact event, busy guard, accessible name, and 44px assertions.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```powershell
node_modules\.bin\vitest.cmd run tests/component/CardToolbar.spec.ts tests/component/ExportActions.spec.ts
```

Expected: failures identifying missing DaisyUI classes or hierarchy.

- [ ] **Step 3: Implement the compact command bar and export card**

Use DaisyUI classes directly in the templates:

```vue
<header class="card border border-base-300 bg-base-100 shadow-sm">
  <div class="card-body ...">
    <div class="join" role="toolbar" aria-label="编辑器工具">
      <button class="btn join-item ...">新版</button>
    </div>
    <span class="badge badge-ghost" role="status">默认状态</span>
  </div>
</header>
```

```vue
<button class="btn btn-outline" data-action="copy">复制图片</button>
<button class="btn btn-primary" data-action="export">保存 PNG</button>
```

Retain only layout CSS DaisyUI does not own. Keep `requestCopy`, `requestExport`, `selectTemplate`, and `resetAll` unchanged.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the command from Step 2. Expected: both files pass.

- [ ] **Step 5: Commit Task 1**

```powershell
git add src/components/editor/CardToolbar.vue src/components/editor/ExportActions.vue tests/component/CardToolbar.spec.ts tests/component/ExportActions.spec.ts
git commit -m "refactor: align editor actions with DaisyUI"
```

### Task 2: DaisyUI inspector and avatar sliders

**Files:**

- Modify: `tests/component/CardInspector.spec.ts`
- Modify: `src/components/editor/CardInspector.vue`

**Interfaces:**

- Consumes: `document.avatar`, `activeGroup`, `disabled`, `fieldErrors`, and existing emits.
- Produces: three `input[type=range][data-avatar-range]` controls paired with the existing numeric inputs, both emitting fresh complete `AvatarTransform` objects through `update-avatar`.

- [ ] **Step 1: Write failing slider and DaisyUI form tests**

Add a focused test that opens the avatar group and asserts:

```ts
const ranges = wrapper.findAll('input[type="range"][data-avatar-range]');
expect(ranges.map((range) => range.attributes("data-avatar-range"))).toEqual([
  "left",
  "top",
  "scale",
]);
expect(ranges[0].attributes()).toMatchObject({
  min: "-960",
  max: "960",
  step: "0.01",
});
expect(ranges[2].attributes()).toMatchObject({
  min: "0.1",
  max: "3",
  step: "0.01",
});
expect(ranges.every((range) => range.classes().includes("range"))).toBe(true);
expect(wrapper.get('input[data-field="name"]').classes()).toContain(
  "input-bordered",
);
```

Set a range value, assert one immutable `update-avatar` payload, then update props and assert range and number values reflect the clamped prop value. Verify both controls are disabled when `disabled=true`.

- [ ] **Step 2: Run the focused inspector test and verify RED**

```powershell
node_modules\.bin\vitest.cmd run tests/component/CardInspector.spec.ts
```

Expected: failure because range controls and DaisyUI form classes do not exist.

- [ ] **Step 3: Implement range metadata and shared immutable update handler**

Define literal metadata:

```ts
const avatarControlConfig = {
  left: { min: -960, max: 960, step: 1 },
  top: { min: -960, max: 960, step: 1 },
  scale: { min: 0.1, max: 3, step: 0.01 },
} as const;
```

Render each row as a labelled DaisyUI range plus compact number input:

```vue
<input
  class="range range-primary range-sm"
  type="range"
  :data-avatar-range="field"
  :min="avatarControlConfig[field].min"
  :max="avatarControlConfig[field].max"
  :step="avatarControlConfig[field].step"
  :value="props.document.avatar[field]"
  @input="handleAvatarNumberInput(field, $event)"
/>
<input class="input input-bordered input-sm avatar-number" type="number" ... />
```

Keep the existing immutable handler and all tab keyboard behavior. Apply `card`, `tabs-boxed`, `tab`, `input`, `file-input`, `btn-ghost`, and error semantic classes without replacing ARIA relationships.

- [ ] **Step 4: Run the inspector test and verify GREEN**

Run the command from Step 2. Expected: all inspector tests pass.

- [ ] **Step 5: Commit Task 2**

```powershell
git add src/components/editor/CardInspector.vue tests/component/CardInspector.spec.ts
git commit -m "refactor: add DaisyUI avatar controls"
```

### Task 3: Studio workspace and preview surfaces

**Files:**

- Modify: `tests/component/CardEditorWorkspace.spec.ts`
- Modify: `tests/component/FullPreviewShell.spec.ts`
- Modify: `tests/component/FabricCardCanvas.spec.ts`
- Modify: `tests/component/EditorDialog.spec.ts`
- Modify: `src/components/editor/CardEditorWorkspace.vue`
- Modify: `src/components/editor/FullPreviewShell.vue`
- Modify: `src/components/editor/FabricCardCanvas.vue`
- Modify: `src/components/editor/EditorDialog.vue`

**Interfaces:**

- Consumes: unchanged child props/emits and persistent full-preview slot identity.
- Produces: DaisyUI studio shell with compact status surfaces, preview stage, and visually aligned dialogs.

- [ ] **Step 1: Write failing workspace and preview-style tests**

Assert real behavior and semantic classes:

```ts
expect(wrapper.get("main").classes()).toContain("bg-base-300");
expect(wrapper.get(".editor-preview-region").classes()).toContain(
  "rounded-box",
);
expect(wrapper.get("[data-resource-status]").classes()).toContain("badge");
expect(shell.get(".full-preview-trigger").classes()).toContain("btn");
expect(canvas.get(".fabric-card-canvas").classes()).toContain("bg-base-100");
expect(dialog.get('[role="dialog"]').classes()).toContain("card");
```

Retain existing exact reading order, slot persistence, focus restoration, dialog trap, event identity, and responsive CSS assertions. Replace obsolete assertions that require the old bespoke color declarations with assertions for the new studio layout and mobile media block.

- [ ] **Step 2: Run focused workspace/preview tests and verify RED**

```powershell
node_modules\.bin\vitest.cmd run tests/component/CardEditorWorkspace.spec.ts tests/component/FullPreviewShell.spec.ts tests/component/FabricCardCanvas.spec.ts tests/component/EditorDialog.spec.ts
```

Expected: failures for missing DaisyUI surface classes while behavioral tests remain green.

- [ ] **Step 3: Implement studio surfaces without changing behavior**

Update template classes and narrow scoped CSS:

- Workspace: dark `bg-neutral`, contained max-width shell, 13/7 desktop grid, one-column mobile grid, grouped status card/alert.
- Preview: `rounded-box`, subtle border, dark inset stage, unchanged sticky and full-preview slot behavior.
- Canvas wrapper: `bg-base-100`, consistent radius and loading overlay; preserve all lifecycle code.
- Dialogs: DaisyUI `card`, `btn`, and semantic surfaces; preserve focus traversal, opener restoration, Escape, backdrop, safe-area, and overflow logic.

Do not add gradient backgrounds, fixed workspace actions, or duplicate state.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the command from Step 2. Expected: all focused component files pass.

- [ ] **Step 5: Run full static and automated gates**

```powershell
node_modules\.bin\vitest.cmd run tests/unit tests/component
node_modules\.bin\vue-tsc.cmd --build
node_modules\.bin\prettier.cmd --check src/components/editor tests/component
node_modules\.bin\eslint.cmd src/components/editor tests/component
git diff --check
```

Expected: zero test failures, type errors, lint errors, formatting errors, or whitespace errors.

- [ ] **Step 6: Commit Task 3**

```powershell
git add src/components/editor tests/component
git commit -m "refactor: refine DaisyUI editor workspace"
```

### Task 4: Browser validation and bounded visual correction

**Files:**

- Modify only files already in Tasks 1–3 if browser evidence identifies defects.

**Interfaces:**

- Consumes: completed DaisyUI editor at `/editor/current` and `/editor/legacy`.
- Produces: validated desktop/mobile screenshots and one bounded correction pass.

- [ ] **Step 1: Run the manual detector once**

```powershell
node C:\Users\mikan\.agents\skills\impeccable\scripts\detect.mjs --json src/components/editor/CardEditorWorkspace.vue src/components/editor/CardToolbar.vue src/components/editor/CardInspector.vue src/components/editor/ExportActions.vue src/components/editor/FullPreviewShell.vue src/components/editor/FabricCardCanvas.vue src/components/editor/EditorDialog.vue
```

Expected: inspect every reported item; fix real defects in the single correction batch.

- [ ] **Step 2: Inspect desktop and mobile together in Chrome DevTools**

- Desktop: 1440×1000 on `/editor/current` and `/editor/legacy`.
- Mobile: 390×844 on `/editor/current`.
- Capture full-page screenshots.
- Check no horizontal overflow, preview dominance, readable status, sticky behavior, 44px targets, visible focus, and zero console errors.

- [ ] **Step 3: Apply one concentrated correction batch**

If evidence shows defects, first add or update a failing component test for each structural regression, verify RED, then patch the smallest owning component. Do not continue open-ended polishing.

- [ ] **Step 4: Re-run final verification**

```powershell
node_modules\.bin\vitest.cmd run tests/unit tests/component
node_modules\.bin\vue-tsc.cmd --build
node_modules\.bin\prettier.cmd --check src/components/editor tests/component
node_modules\.bin\eslint.cmd src/components/editor tests/component
git diff --check
```

Then repeat screenshots once at 1440×1000 and 390×844 and confirm the browser console has no errors.

- [ ] **Step 5: Commit final corrections**

```powershell
git add src/components/editor tests/component
git commit -m "fix: finish DaisyUI editor polish"
```
