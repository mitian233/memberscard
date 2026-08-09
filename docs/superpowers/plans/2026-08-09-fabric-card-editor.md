# Fabric.js Card Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the duplicated Konva member-card editors with a shared Fabric.js fixed-template editor that keeps preview and controls together, supports direct avatar/text editing, and exports clean 3840×2560 PNG files.

**Architecture:** `CardDocument` is the single business-state source. Template definitions supply immutable 960×640 geometry; Fabric adapters render and interact with that state; Vue components consume typed props and emit patches. Interactive `Canvas` and offscreen `StaticCanvas` share one renderer so preview and export cannot drift.

**Tech Stack:** Vue 3.5 Composition API, TypeScript 6, Vite 8, Fabric.js, Tailwind CSS 3/DaisyUI 4, Vitest, Vue Test Utils, happy-dom, Playwright.

## Global Constraints

- Use Vue 3 Composition API with `<script setup lang="ts">`; route views remain composition surfaces.
- Store Fabric class instances in `shallowRef`/raw values; never deep-proxy them with Vue reactivity.
- Logical template coordinates are always 960×640; viewport scaling must not mutate document coordinates.
- Current template route is `/`; legacy template route is `/old`; keep both URLs and lazy route loading.
- Desktop editor uses approximately 65% preview and 35% inspector; mobile keeps preview visible above two control groups and a safe-area-aware export bar.
- Avatar manipulation allows drag and uniform scale only; it must never expose empty pixels inside the template clip frame.
- Editable text uses `IText`, but movement, scale, rotation, skew, and flip are locked.
- Fixed template objects are `selectable: false` and `evented: false`.
- Export uses an offscreen `StaticCanvas`, multiplier `4`, output size 3840×2560, and never includes active controls or helper objects.
- JPG, PNG, and WebP uploads are accepted up to 10 MB; a failed upload preserves the current avatar.
- No complete undo/redo, arbitrary object creation, free layer ordering, cloud persistence, or autosave in this release.
- Every production behavior follows red-green-refactor. Each worker records the failing command/output before implementation and the passing command/output afterward.
- Use `pnpm-lock.yaml` as the only lockfile. Do not add, regenerate, stage, or delete the existing untracked `package-lock.json`.
- Do not remove Konva or the old routes until Task 12A has passing current/legacy browser tests.

### Template Geometry Contract

- Current card: background/card `0,0,960,640,r40`; avatar background `25,40,370,560,r25`; avatar clip `30,45,360,550,r25`; default avatar `{ left: -133.56, top: 45, scale: 0.58 }`; title `430,65,35`; logo `430,190,120,49.6`; editable fields name `430,313,40`, nameEn `430,363,20`, bandName `430,453,40`, birthday `730,453,40`; disclaimer markers `430,531,15,15` and `430,576,15,15`.
- Legacy card: background/card `0,0,960,640,r40`; avatar background and clip `87,221,305,368,r0`; default avatar `{ left: -76.56, top: 221, scale: 0.58 }`; logo `730,220,150,62`; editable fields bandName `430,300,35`, name `430,340,60`, nameEn `430,420,30`; disclaimer circles radius `7.5` centered at `430,510` and `430,560`; birthday is absent.
- These values are golden template data. Workers may add typed structure around them but must not visually tune them without updating the literal-coordinate tests and reporting the deviation for review.

## Component Map

- `CardEditorView.vue`: route-level composition, responsive shell, template switch, mobile tab/fullscreen state.
- `FabricCardCanvas.vue`: Fabric lifecycle, viewport resize, pointer/touch bridge, typed canvas patch events.
- `CardInspector.vue`: accessible HTML field and avatar controls; no direct Fabric imports.
- `CardToolbar.vue`: template navigation and reset-all request.
- `ExportActions.vue`: copy/export controls and `aria-live` status.
- `useCardEditor.ts`: owns `CardDocument`, validation/status state, reset/update actions, and source-tagged patch flow.
- `renderCardDocument.ts`: the only scene renderer used by interactive and export canvases.

---

### Task 1: Test foundation and `CardDocument` contracts

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Create: `vitest.config.ts`
- Create: `tests/setup.ts`
- Create: `tests/unit/cardDocument.spec.ts`
- Create: `src/types/card.ts`
- Create: `src/editor/cardDocument.ts`

**Interfaces:**
- Produces: `TemplateId`, `CardField`, `AvatarTransform`, `CardDocument`, `CardTemplateDefinition`.
- Uses `left`/`top` as the only persisted avatar position names; Fabric adapters may translate internally but never expose a competing `x`/`y` document shape.
- Produces: `CardPatch`, `PatchSource`, `EditorSelection`, `EditorStatus`, `ResourceStatus`, `FieldValidationError`, and stable upload/export error-code unions used by every later task.
- Produces: `createCardDocument(template)`, `updateCardField(document, field, value)`, `resetCardField(document, template, field)`, `resetAvatar(document, template)`, `resetCardDocument(template)`.

- [ ] **Step 1: Install only the unit/component test foundation**

Run:

```powershell
pnpm add -D vitest @vue/test-utils happy-dom @eslint/js
```

Add scripts:

```json
"test": "vitest run",
"test:unit": "vitest run tests/unit",
"test:component": "vitest run tests/component",
"test:watch": "vitest"
```

Configure happy-dom, `tests/setup.ts`, `clearMocks: true`, and `restoreMocks: true` in `vitest.config.ts`. Reuse Vite's `@` alias or declare the same `@ → src` alias explicitly. Adding `@eslint/js` repairs the repository's existing ESLint import so the final lint gate is meaningful.

- [ ] **Step 2: Write the failing document-state tests**

```ts
import { describe, expect, it } from 'vitest'
import {
  createCardDocument,
  resetAvatar,
  resetCardDocument,
  resetCardField,
  updateCardField,
} from '@/editor/cardDocument'
import type { CardTemplateDefinition } from '@/types/card'

const template: CardTemplateDefinition = {
  id: 'current',
  canvas: { width: 960, height: 640, radius: 40 },
  assets: { background: '/background.svg', logo: '/logo.svg', avatarFrame: '/frame.jpg' },
  defaults: {
    name: '二葉 つくし', nameEn: 'Tsukushi Futaba', bandName: 'Morfonica', birthday: '9/15',
    avatar: { src: '/demo.png', left: -133.56, top: 45, scale: 0.58 },
  },
  avatarFrame: { left: 30, top: 45, width: 360, height: 550, radius: 25 },
  fields: {},
  staticObjects: [],
}

describe('CardDocument', () => {
  it('creates an independent document from template defaults', () => {
    const first = createCardDocument(template)
    const second = createCardDocument(template)
    first.avatar.left = 0
    expect(second.avatar.left).toBe(-133.56)
  })

  it('updates and resets one field without changing the avatar', () => {
    const edited = updateCardField(createCardDocument(template), 'name', '新名字')
    edited.avatar.left = -100
    const reset = resetCardField(edited, template, 'name')
    expect(reset.name).toBe('二葉 つくし')
    expect(reset.avatar.left).toBe(-100)
  })

  it('resets only avatar state and can reset the full document', () => {
    const edited = updateCardField(createCardDocument(template), 'bandName', 'Other')
    edited.avatar.left = 2
    expect(resetAvatar(edited, template).bandName).toBe('Other')
    expect(resetCardDocument(template)).toEqual(createCardDocument(template))
  })
})
```

- [ ] **Step 3: Run the test and verify RED**

Run: `pnpm exec vitest run tests/unit/cardDocument.spec.ts`

Expected: FAIL because `@/editor/cardDocument` and card types do not exist.

- [ ] **Step 4: Implement immutable document operations**

Use copied roots and copied avatar objects; never return shared template default objects. `CardTemplateDefinition.fields` is a partial record so legacy may omit birthday. Make every patch and status union exhaustive so workers in Tasks 7–11 cannot invent local event shapes or message codes.

- [ ] **Step 5: Verify GREEN and type-check**

Run:

```powershell
pnpm exec vitest run tests/unit/cardDocument.spec.ts
node_modules\.bin\vue-tsc.cmd --build
```

Expected: all document tests pass; type-check exits 0.

- [ ] **Step 6: Commit**

```powershell
git add package.json pnpm-lock.yaml vitest.config.ts tests/setup.ts tests/unit/cardDocument.spec.ts src/types/card.ts src/editor/cardDocument.ts
git commit -m "test: establish card editor domain model"
```

### Task 2: Current-template definition

**Files:**
- Create: `src/templates/currentCardTemplate.ts`
- Create: `tests/unit/currentCardTemplate.spec.ts`

**Interfaces:**
- Consumes: `CardTemplateDefinition` from Task 1.
- Produces: `currentCardTemplate` with exact current-card coordinates and defaults.

- [ ] **Step 1: Write the failing literal-coordinate test**

Assert one complete ordered object list covering the card/background radius, avatar background and clip, avatar default, title, logo, every label rectangle/text, all four editable fields, both disclaimer markers, both disclaimer strings, positions, sizes, fonts, and roles. The literal list must match the Global Geometry Contract, including frame `{30,45,360,550,25}`, avatar `{left:-133.56,top:45,scale:0.58}`, fields `(430,313,40)`, `(430,363,20)`, `(430,453,40)`, `(730,453,40)`, and logo `(430,190,120,49.6)`.

- [ ] **Step 2: Verify RED**

Run: `pnpm exec vitest run tests/unit/currentCardTemplate.spec.ts`

Expected: FAIL because `currentCardTemplate` does not exist.

- [ ] **Step 3: Implement the current template**

Use imported asset URLs for `memberscard_bg.svg`, `ring_logo.svg`, `avatar_bg.jpg`, and `/demo.png`. Record static objects in render order, including labels and Japanese disclaimer text. Every static object carries `role: 'static'`; editable field specs carry `role: 'field'` and a `field` key.

- [ ] **Step 4: Verify GREEN**

Run: `pnpm exec vitest run tests/unit/currentCardTemplate.spec.ts`

- [ ] **Step 5: Commit**

```powershell
git add src/templates/currentCardTemplate.ts tests/unit/currentCardTemplate.spec.ts
git commit -m "feat: define current member card template"
```

### Task 3: Legacy-template definition

**Files:**
- Create: `src/templates/legacyCardTemplate.ts`
- Create: `tests/unit/legacyCardTemplate.spec.ts`

**Interfaces:**
- Consumes: `CardTemplateDefinition` from Task 1.
- Produces: `legacyCardTemplate`; `fields.birthday` must be absent.

- [ ] **Step 1: Write the failing literal-coordinate test**

Assert one complete ordered object list covering card/background radius, avatar background and clip, avatar default, logo, all three editable fields, both disclaimer circles/texts, positions, sizes, fonts, and roles. Include canvas `960×640`; frame `{87,221,305,368,0}`; avatar `{left:-76.56,top:221,scale:0.58}`; logo `(730,220,150,62)`; fields `(430,300,35)`, `(430,340,60)`, `(430,420,30)`; no birthday; marker centers `(430,510)` and `(430,560)`.

- [ ] **Step 2: Verify RED**

Run: `pnpm exec vitest run tests/unit/legacyCardTemplate.spec.ts`

- [ ] **Step 3: Implement and verify GREEN**

Use `oldVerBg.svg`, `ring_logo.svg`, and `/demo.png`. Keep the avatar background as a locked `#d8e8f2` rectangle.

Run: `pnpm exec vitest run tests/unit/legacyCardTemplate.spec.ts`

- [ ] **Step 4: Commit**

```powershell
git add src/templates/legacyCardTemplate.ts tests/unit/legacyCardTemplate.spec.ts
git commit -m "feat: define legacy member card template"
```

### Task 4: Avatar cover and movement constraints

**Files:**
- Create: `src/editor/avatarGeometry.ts`
- Create: `tests/unit/avatarGeometry.spec.ts`

**Interfaces:**
- Produces: `getCoverScale(imageSize, frame)`, `clampAvatarTransform(transform, imageSize, frame)`, `scaleAvatarAroundPoint(transform, nextScale, anchor, imageSize, frame)`.

- [ ] **Step 1: Write failing geometry tests with literal expectations**

```ts
expect(getCoverScale({ width: 1334, height: 1002 }, { width: 360, height: 550 })).toBeCloseTo(550 / 1002)

expect(clampAvatarTransform(
  { src: '/demo.png', left: 100, top: 100, scale: 0.1 },
  { width: 1334, height: 1002 },
  { left: 30, top: 45, width: 360, height: 550, radius: 25 },
)).toMatchObject({ left: 30, top: 45, scale: 550 / 1002 })
```

Add cases for dragging beyond every edge and scaling around the frame center. Expectations must prove that `left <= frame.left`, `top <= frame.top`, `left + width*scale >= frame.right`, and `top + height*scale >= frame.bottom`.

- [ ] **Step 2: Verify RED**

Run: `pnpm exec vitest run tests/unit/avatarGeometry.spec.ts`

- [ ] **Step 3: Implement the minimal pure math**

Clamp scale first, then clamp left to `[frame.right - image.width*scale, frame.left]` and top to `[frame.bottom - image.height*scale, frame.top]`.

- [ ] **Step 4: Verify GREEN and commit**

```powershell
pnpm exec vitest run tests/unit/avatarGeometry.spec.ts
git add src/editor/avatarGeometry.ts tests/unit/avatarGeometry.spec.ts
git commit -m "feat: constrain avatar transforms"
```

### Task 5: Text fitting and field validation

**Files:**
- Create: `src/editor/textFit.ts`
- Create: `tests/unit/textFit.spec.ts`

**Interfaces:**
- Produces: `fitText({ text, baseSize, minSize, maxWidth, measure }): { fontSize: number; valid: boolean }`.

- [ ] **Step 1: Write failing tests**

Use a literal measure function `(_, size) => size * 10`. Assert text that fits retains `40`; text requiring `24` returns `24`; text wider than the minimum returns `{ fontSize: 18, valid: false }`; empty text remains valid at base size.

- [ ] **Step 2: Verify RED**

Run: `pnpm exec vitest run tests/unit/textFit.spec.ts`

- [ ] **Step 3: Implement deterministic descending-size fitting**

Check integer sizes from `baseSize` down to `minSize`; never mutate Fabric objects in this utility.

- [ ] **Step 4: Verify GREEN and commit**

```powershell
pnpm exec vitest run tests/unit/textFit.spec.ts
git add src/editor/textFit.ts tests/unit/textFit.spec.ts
git commit -m "feat: fit editable card text"
```

### Task 6A: Fabric contracts and object-option factories

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Create: `src/fabric/types.ts`
- Create: `src/fabric/objectFactories.ts`
- Create: `tests/unit/fabricObjectPolicies.spec.ts`

**Interfaces:**
- Produces: `CanvasAdapter`, `AssetLoader`, `TextMeasurer`, `ExportCanvasFactory`, `FabricCardScene`, and renderer option types in `src/fabric/types.ts`.
- Produces pure option builders for fixed objects, editable `IText`, and the avatar. Later tests inject these contracts instead of constructing a browser canvas in happy-dom.

- [ ] **Step 1: Install Fabric.js**

Run: `pnpm add fabric@7.4.0`

Use Fabric 7 named imports: `Canvas`, `StaticCanvas`, `FabricImage`, and `IText`. Do not use deprecated namespace-style APIs.

- [ ] **Step 2: Write failing pure policy tests**

Assert a static-object option builder returns `selectable=false,evented=false`; editable-text options return `editable=true`, locked movement/scale/rotation, no rotation/side controls; avatar options allow selection and uniform scale but lock rotation and flip. Do not construct `Canvas` or rely on native canvas bindings in these unit tests.

- [ ] **Step 3: Verify RED**

Run: `pnpm exec vitest run tests/unit/fabricObjectPolicies.spec.ts`

- [ ] **Step 4: Implement typed contracts and factories**

Keep Fabric runtime classes behind the adapter contracts. Object factories may construct leaf objects, but their policy inputs and identifiers must remain testable as pure data.

- [ ] **Step 5: Verify GREEN, full unit suite, and type-check**

```powershell
pnpm exec vitest run tests/unit/fabricObjectPolicies.spec.ts
pnpm exec vitest run tests/unit
node_modules\.bin\vue-tsc.cmd --build
```

- [ ] **Step 6: Commit**

```powershell
git add package.json pnpm-lock.yaml src/fabric tests/unit/fabricObjectPolicies.spec.ts
git commit -m "feat: define Fabric editor contracts"
```

### Task 6B: Editor canvas and shared renderer

**Files:**
- Create: `src/fabric/createEditorCanvas.ts`
- Create: `src/fabric/renderCardDocument.ts`
- Create: `tests/unit/renderCardDocument.spec.ts`

**Interfaces:**
- Consumes the Task 6A adapters and factories.
- Produces: `createEditorCanvas(element): CanvasAdapter` with logical `960×640`.
- Produces: `renderCardDocument(canvas, document, template, options): Promise<FabricCardScene>`; `FabricCardScene` exposes `avatar`, `fields`, ordered `objects`, and `disposeObjectListeners()`.

- [ ] **Step 1: Write the failing injected-renderer tests**

Use fake `CanvasAdapter`, `AssetLoader`, and `TextMeasurer` implementations. Verify ordered additions for the complete current and legacy template object lists, stable `data.role`/`data.field` identifiers, absolute clip geometry, `IText` only for editable fields, one final render request, and disposal of replaced scene resources. Do not instantiate a real DOM canvas in Vitest.

- [ ] **Step 2: Verify RED**

Run: `pnpm exec vitest run tests/unit/renderCardDocument.spec.ts`

- [ ] **Step 3: Implement the renderer**

Clear the target; load background, logo, frame, avatar, and fonts asynchronously through injected loaders; add objects in template order; apply the absolute rounded clip; settle all resources before marking the scene ready. Use only documented Fabric public APIs in the production adapters.

- [ ] **Step 4: Verify GREEN and commit**

```powershell
pnpm exec vitest run tests/unit/renderCardDocument.spec.ts
pnpm exec vitest run tests/unit
node_modules\.bin\vue-tsc.cmd --build
git add src/fabric/createEditorCanvas.ts src/fabric/renderCardDocument.ts tests/unit/renderCardDocument.spec.ts
git commit -m "feat: render card documents with Fabric"
```

### Task 7: Fabric interaction bridge

**Files:**
- Create: `src/fabric/bindEditorEvents.ts`
- Create: `src/fabric/pinchGesture.ts`
- Create: `tests/unit/bindEditorEvents.spec.ts`
- Create: `tests/unit/pinchGesture.spec.ts`

**Interfaces:**
- Consumes: `FabricCardScene`, `TextMeasurer`, avatar geometry, text fitting, and the Task 1 patch/error unions.
- Produces: `bindEditorEvents(canvas, scene, options): () => void`.
- Produces callbacks `onDocumentPatch(patch, source: 'canvas')`, `onSelectionChange(selection)`, `onValidationError(error)`.

- [ ] **Step 1: Write failing event tests**

Using fake observable scene objects that match the adapter contract, verify moving/scaling avatar emits a clamped transform patch; text `changed` measures and fits the value before emitting the matching field patch; values below the minimum-size threshold emit the stable field-validation error; Escape restores the captured pre-edit value; disposer stops later emissions. Cover both Canvas-origin text changes and Inspector-origin document refreshes so font size and validation remain identical in both directions.

- [ ] **Step 2: Write failing pinch tests**

Verify two pointer positions produce the expected distance ratio and center anchor, and one pointer cannot produce a scale update.

- [ ] **Step 3: Verify RED**

Run: `pnpm exec vitest run tests/unit/bindEditorEvents.spec.ts tests/unit/pinchGesture.spec.ts`

- [ ] **Step 4: Implement the bridge**

Use the disposer returned by Fabric `on()` registrations; never call unscoped `off(eventName)`. Lock avatar rotation/flips after every transform, call `setCoords()`, and render after constraint correction. Re-run injected text measurement on both scene edits and external document updates; map an invalid fit to the Task 1 error union.

- [ ] **Step 5: Verify GREEN and commit**

```powershell
pnpm exec vitest run tests/unit/bindEditorEvents.spec.ts tests/unit/pinchGesture.spec.ts
git add src/fabric/bindEditorEvents.ts src/fabric/pinchGesture.ts tests/unit/bindEditorEvents.spec.ts tests/unit/pinchGesture.spec.ts
git commit -m "feat: bind direct Fabric editing"
```

### Task 8: Editor composable and source-tagged state flow

**Files:**
- Create: `src/composables/useCardEditor.ts`
- Create: `tests/unit/useCardEditor.spec.ts`

**Interfaces:**
- Produces readonly `document`, `status`, `resourceStatus`, `fieldErrors`, `selection`, `isDirty`, `isReady`, `isExporting`; `isReady` stays false until fonts and all required template assets settle.
- Produces actions `updateField`, `updateAvatar`, `handleCanvasPatch`, `resetField`, `resetAvatar`, `resetAll`, `requestTemplateChange`, `confirmTemplateChange`, `cancelTemplateChange`, `beginExport`, `finishExport`, `failExport`.

- [ ] **Step 1: Write failing state-flow tests**

Verify Inspector and Canvas patches update the same document once; Canvas-origin patches do not echo back as a second Canvas patch; resets obey template defaults; invalid text populates the corresponding error; export transitions are `idle → working → success|error`. Verify resource transitions cover initial loading, ready, recoverable image error, and font fallback; copy/export remain unavailable before ready. Verify a dirty template change enters a pending-confirmation state, cancel keeps the current document, and confirm replaces it with the selected template defaults.

- [ ] **Step 2: Verify RED**

Run: `pnpm exec vitest run tests/unit/useCardEditor.spec.ts`

- [ ] **Step 3: Implement the composable**

Use a replace-on-write `shallowRef<CardDocument>` and computed/read-only derived state. Keep Fabric instances outside the composable. Source tags are explicit function parameters, not global flags. Template changes must never silently discard dirty edits. Resource errors use stable codes plus visible recovery copy; a font failure uses the documented fallback family and reports degraded readiness rather than blocking forever.

- [ ] **Step 4: Verify GREEN and commit**

```powershell
pnpm exec vitest run tests/unit/useCardEditor.spec.ts
git add src/composables/useCardEditor.ts tests/unit/useCardEditor.spec.ts
git commit -m "feat: coordinate editor state"
```

### Task 9: Accessible Inspector, toolbar, and export controls

**Files:**
- Create: `src/components/editor/CardInspector.vue`
- Create: `src/components/editor/CardToolbar.vue`
- Create: `src/components/editor/ExportActions.vue`
- Create: `tests/component/CardInspector.spec.ts`
- Create: `tests/component/CardToolbar.spec.ts`
- Create: `tests/component/ExportActions.spec.ts`

**Interfaces:**
- `CardInspector` props: `document`, `template`, `activeGroup`, `fieldErrors`, `disabled`; emits `update-field`, `update-avatar`, `reset-field`, `reset-avatar`, `update:activeGroup`.
- `CardToolbar` props: `templateId`, `dirty`, `busy`; emits `template-change`, `reset-all`.
- `ExportActions` props: `isExporting`, `canExport`, `canCopy`, `statusMessage`; emits `copy`, `export`.

- [ ] **Step 1: Write failing component tests**

Mount real components. Assert every text/range/file control is discoverable with `get('label[for=...]')`; tab buttons expose `role=tab` and `aria-selected`; errors set `aria-invalid` and `aria-describedby`; export status uses `aria-live="polite"`; working export disables both actions; copy-unavailable keeps Save visible.

- [ ] **Step 2: Verify RED**

Run: `pnpm exec vitest run tests/component/CardInspector.spec.ts tests/component/CardToolbar.spec.ts tests/component/ExportActions.spec.ts`

- [ ] **Step 3: Implement focused SFCs**

Use typed props/emits, visible labels, 44px minimum interactive heights, and class selectors in scoped CSS. Do not import Fabric in these files. Use active voice Chinese copy and explicit recovery text.

- [ ] **Step 4: Verify GREEN and commit**

```powershell
pnpm exec vitest run tests/component
git add src/components/editor tests/component
git commit -m "feat: add accessible editor controls"
```

### Task 10: Canvas Vue wrapper, responsive shell, and internal routes

**Files:**
- Create: `src/components/editor/FabricCardCanvas.vue`
- Create: `src/views/CardEditorView.vue`
- Modify: `src/layouts/default.vue`
- Modify: `src/router/index.ts`
- Modify: `src/assets/main.css`
- Create: `tests/component/FabricCardCanvas.spec.ts`
- Create: `tests/component/CardEditorView.spec.ts`

**Interfaces:**
- `FabricCardCanvas` props: `document`, `template`, `disabled`, `loading`; emits `ready`, `change`, `selection-change`, `edit-cancel`, `validation-error`.
- Temporary routes: `/editor/current` and `/editor/legacy`; existing `/` and `/old` stay on Konva until Task 12B.

- [ ] **Step 1: Write failing lifecycle/layout tests**

Inject a typed canvas adapter in component tests. Assert mount creates once, document replacement updates once, unmount awaits dispose, and emitted patches retain source. Assert initial loading renders a preview skeleton and disables copy/export; recoverable asset errors show the next action; font fallback exposes degraded-ready status. Assert view landmarks exist, editor layout variant removes the 768px cap, mobile tabs have keyboard-operable native buttons, and export actions remain after Inspector content. Assert the mobile full-preview trigger opens a focus-contained dialog, Escape closes it, and focus returns to the trigger.

- [ ] **Step 2: Verify RED**

Run: `pnpm exec vitest run tests/component/FabricCardCanvas.spec.ts tests/component/CardEditorView.spec.ts`

- [ ] **Step 3: Implement the wrapper and layout**

Desktop grid: `minmax(0,13fr) minmax(320px,7fr)` at a content-driven breakpoint no wider than 1024px. Mobile: sticky toolbar, approximately one-third-height preview, two control groups, safe-area export padding, plus a full-preview dialog with close control, focus containment, Escape handling, and focus return. Apply `touch-action:none` only to the canvas interaction surface. Canvas has an accessible text summary and a keyboard-equivalent Inspector path.

- [ ] **Step 4: Add internal routes and verify GREEN**

Run:

```powershell
pnpm exec vitest run tests/component/FabricCardCanvas.spec.ts tests/component/CardEditorView.spec.ts
node_modules\.bin\vue-tsc.cmd --build
```

- [ ] **Step 5: Run the design detector on changed UI**

Run:

```powershell
node C:\Users\mikan\.agents\skills\impeccable\scripts\detect.mjs --json src/components/editor src/views/CardEditorView.vue src/layouts/default.vue
```

Resolve every verified finding in this task before commit.

- [ ] **Step 6: Commit**

```powershell
git add src/components/editor/FabricCardCanvas.vue src/views/CardEditorView.vue src/layouts/default.vue src/router/index.ts src/assets/main.css tests/component/FabricCardCanvas.spec.ts tests/component/CardEditorView.spec.ts
git commit -m "feat: add responsive Fabric editor shell"
```

### Task 11: Offscreen export, upload validation, and Clipboard fallback

**Files:**
- Create: `src/fabric/exportCard.ts`
- Create: `src/editor/avatarUpload.ts`
- Create: `src/editor/clipboard.ts`
- Create: `tests/unit/exportCard.spec.ts`
- Create: `tests/unit/avatarUpload.spec.ts`
- Create: `tests/unit/clipboard.spec.ts`
- Modify: `src/views/CardEditorView.vue`

**Interfaces:**
- Consumes: injected `ExportCanvasFactory` from Task 6A so unit tests can observe logical dimensions, multiplier, render mode, and disposal without a browser canvas.
- Produces: `exportCardPng(document, template, factory): Promise<Blob>`.
- `src/editor/clipboard.ts` produces: `copyCardPng(blob): Promise<'copied' | 'unsupported' | 'denied'>`.
- Produces: `validateAvatarFile(file): { valid: true } | { valid: false; message: string }`.
- Produces: `loadAvatarFile(file, frame): Promise<AvatarTransform>`; callers replace state only after resolution, so rejection preserves the previous avatar.

- [ ] **Step 1: Write failing export and validation tests**

With an injected fake `ExportCanvasFactory`, assert logical `960×640` with multiplier `4` produces `3840×2560`; export renderer uses `mode:'export'`; StaticCanvas dispose runs in success and error branches; helper state excludes selections. Assert Clipboard success, unsupported API, and denied permission map to the declared union. Assert JPG/PNG/WebP at or below `10*1024*1024` is valid, unsupported MIME or larger files return the exact recovery messages. Verify load failure rejects before state replacement, while success calculates a centered cover transform for the active template frame.

- [ ] **Step 2: Verify RED**

Run: `pnpm exec vitest run tests/unit/exportCard.spec.ts tests/unit/avatarUpload.spec.ts tests/unit/clipboard.spec.ts`

- [ ] **Step 3: Implement export and upload behavior**

Use one offscreen `StaticCanvas` and the shared renderer. End text editing before taking a document snapshot. Convert data URL to Blob without keeping a second full-size base64 copy longer than necessary. Clipboard rejection maps to a visible Save fallback; export errors preserve editor state. A successful avatar upload starts centered and fully covers the clip frame; any decode/load failure preserves the previous `src` and transform. Always dispose in `finally`.

- [ ] **Step 4: Verify GREEN and commit**

```powershell
pnpm exec vitest run tests/unit/exportCard.spec.ts tests/unit/avatarUpload.spec.ts tests/unit/clipboard.spec.ts
node_modules\.bin\vue-tsc.cmd --build
git add src/fabric/exportCard.ts src/editor/avatarUpload.ts src/editor/clipboard.ts tests/unit/exportCard.spec.ts tests/unit/avatarUpload.spec.ts tests/unit/clipboard.spec.ts src/views/CardEditorView.vue
git commit -m "feat: export and copy Fabric cards"
```

### Task 12A: Browser parity on internal Fabric routes

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Create: `playwright.config.ts`
- Create: `tests/e2e/editor.spec.ts`

**Interfaces:**
- Tests `/editor/current` and `/editor/legacy` only; no final-route mutation in this task.
- Readiness waits on the visible resource-ready status rather than an arbitrary timeout.

- [ ] **Step 1: Add Playwright and scripts**

Run: `pnpm add -D @playwright/test`

Add scripts `test:e2e` and `test:e2e:headed`. Configure a Vite web server and Chromium project. Install Chromium only if the environment lacks a compatible executable.

- [ ] **Step 2: Write E2E tests against temporary routes**

Cover `/editor/current` and `/editor/legacy` at desktop `1440×1000`, phone `390×844`, phone landscape, and a small-tablet viewport. Wait for explicit canvas/resource readiness. Assert no horizontal overflow, current has birthday while legacy does not, Inspector and preview coexist, avatar drag changes numeric controls, desktop control-handle or wheel scaling stays uniform, X/Y/scale precision controls sync back to the canvas, direct IText editing syncs to Inspector, Escape restores text, mobile drag and two-pointer pinch update the transform without exposing empty pixels, export downloads a `3840×2560` PNG, and Clipboard denial leaves Save available.

- [ ] **Step 3: Verify GREEN and commit**

```powershell
pnpm exec playwright test tests/e2e/editor.spec.ts
git add package.json pnpm-lock.yaml playwright.config.ts tests/e2e/editor.spec.ts
git commit -m "test: verify Fabric editor browser parity"
```

### Task 12B: Final route cutover and Konva removal

**Files:**
- Modify: `tests/e2e/editor.spec.ts`
- Modify: `src/router/index.ts`
- Modify: `src/main.ts`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Delete: `src/components/membersCard.vue`
- Delete: `src/components/oldVerCard.vue`
- Delete: `src/views/HomeView.vue`
- Delete: `src/views/OldVerView.vue`

**Interfaces:**
- `/` renders `CardEditorView` with current template; `/old` renders legacy.
- No production import or dependency on `konva` or `vue-konva` remains.

- [ ] **Step 1: Add failing final-route expectations**

Reuse the parity helper for `/` and `/old`, and assert the Fabric editor landmark is present. Run `pnpm exec playwright test tests/e2e/editor.spec.ts`; expected RED is limited to final routes still rendering Konva.

- [ ] **Step 2: Cut over routes and remove Konva**

Point `/` and `/old` to `CardEditorView` with explicit template props/meta. Remove VueKonva registration, old components/views, `konva`, `vue-konva`, and now-unused HeadlessUI if no remaining import uses it. Keep temporary routes only if they add diagnostic value; otherwise remove them after cutover.

- [ ] **Step 3: Verify GREEN and commit**

```powershell
pnpm exec playwright test tests/e2e/editor.spec.ts
node_modules\.bin\vue-tsc.cmd --build
git add package.json pnpm-lock.yaml tests/e2e/editor.spec.ts src/router/index.ts src/main.ts src/components src/views
git commit -m "feat: replace Konva editor with Fabric"
```

### Task 12C: Whole-branch verification and bounded visual fixes

**Files:**
- Modify only files implicated by verified failures or visible defects.
- Create: task report with command outputs, screenshots, and detector disposition.

- [ ] **Step 1: Run the complete project gates fresh**

Run fresh:

```powershell
pnpm exec vitest run
pnpm exec playwright test
node_modules\.bin\vue-tsc.cmd --build
pnpm run build
pnpm run lint
node C:\Users\mikan\.agents\skills\impeccable\scripts\detect.mjs --json src
```

Expected: zero test failures, type-check/build/lint exit 0, and no unexplained detector findings.

- [ ] **Step 2: Visual inspection**

Capture desktop, phone portrait, phone landscape, and small-tablet screenshots for `/` and `/old` in one bounded browser pass. Verify the 65/35 desktop topology, persistent mobile preview, full-preview dialog focus behavior, readable text, no overlapping sticky controls, visible focus, loading/error/success states, and exact current/legacy art parity. Fix only verified defects in one batch, then perform at most one confirmation pass.

- [ ] **Step 3: Commit only if verification required fixes**

List every verified-fix path in the task report, stage only those exact paths, and commit them with `fix: resolve Fabric editor verification findings`. If no fix was required, record a clean verification result and do not create an empty commit.

## Task Review Contract

After every task:

1. Implementer writes the failing and passing command/output, changed files, commit SHA, and self-review to its task report.
2. A fresh `luna-worker` receives only the task brief, task report, and generated diff package.
3. Reviewer returns both verdicts: `Spec compliance: PASS|FAIL` and `Code quality: APPROVED|CHANGES_REQUIRED`.
4. Critical or Important findings return to the same implementer for up to three fix rounds; every fix receives a scoped re-review.
5. The controller records task completion and commit range in the SDD ledger before dispatching the next implementation task.

## Final Acceptance

The branch is complete only after every numbered and lettered task gate, the fresh command suite in Task 12C, a whole-branch spec review, a whole-branch code-quality review, and the bounded desktop/mobile visual pass succeed. The controller then presents branch integration options; it does not merge to `main` without the user choosing an integration action.
