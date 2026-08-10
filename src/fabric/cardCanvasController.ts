import {
  createBrowserAssetLoader,
  createBrowserTextMeasurer,
  classifyCardResourceError,
} from "./browserResources";
import {
  applyCardPatchToScene,
  type ApplyCardPatchToSceneOptions,
  type ApplyCardPatchToSceneResult,
} from "./applyCardPatchToScene";
import {
  bindEditorEvents,
  type BindEditorEventsOptions,
} from "./bindEditorEvents";
import { createEditorCanvas } from "./createEditorCanvas";
import { renderCardDocument } from "./renderCardDocument";
import type {
  AssetLoader,
  FabricCardScene,
  InteractiveCanvasAdapter,
  TextMeasurer,
} from "./types";
import type {
  CardDocument,
  CardPatch,
  CardTemplateDefinition,
  ResourceStatus,
} from "@/types/card";

export interface CardCanvasController {
  readonly measureText: TextMeasurer;
  createCanvas(element: HTMLCanvasElement): InteractiveCanvasAdapter;
  render(
    canvas: InteractiveCanvasAdapter,
    document: CardDocument,
    template: CardTemplateDefinition,
  ): Promise<FabricCardScene>;
  applyPatch(
    canvas: InteractiveCanvasAdapter,
    scene: Pick<FabricCardScene, "avatar" | "fields">,
    patch: CardPatch,
    options: ApplyCardPatchToSceneOptions,
  ): ApplyCardPatchToSceneResult;
  bind(
    canvas: InteractiveCanvasAdapter,
    scene: FabricCardScene,
    options: BindEditorEventsOptions,
  ): () => void;
  classifyResourceError(
    error: unknown,
    document: CardDocument,
    template: CardTemplateDefinition,
  ): Extract<ResourceStatus, { state: "error" }>;
}

export interface CardCanvasControllerDependencies {
  assets?: AssetLoader;
  measureText?: TextMeasurer;
  createCanvas?: typeof createEditorCanvas;
  render?: typeof renderCardDocument;
  applyPatch?: typeof applyCardPatchToScene;
  bind?: typeof bindEditorEvents;
  classifyResourceError?: typeof classifyCardResourceError;
}

export function createCardCanvasController(
  dependencies: CardCanvasControllerDependencies = {},
): CardCanvasController {
  const assets = dependencies.assets ?? createBrowserAssetLoader();
  const measureText = dependencies.measureText ?? createBrowserTextMeasurer();
  const createCanvas = dependencies.createCanvas ?? createEditorCanvas;
  const render = dependencies.render ?? renderCardDocument;
  const applyPatch = dependencies.applyPatch ?? applyCardPatchToScene;
  const bind = dependencies.bind ?? bindEditorEvents;
  const classifyResourceError =
    dependencies.classifyResourceError ?? classifyCardResourceError;

  return {
    measureText,
    createCanvas(element) {
      return createCanvas(element);
    },
    render(canvas, document, template) {
      return render(canvas, document, template, {
        mode: "interactive",
        assets,
        measureText,
      });
    },
    applyPatch(canvas, scene, patch, options) {
      return applyPatch(canvas, scene, patch, options);
    },
    bind(canvas, scene, options) {
      return bind(canvas, scene, options);
    },
    classifyResourceError(error, document, template) {
      return classifyResourceError(error, document, template);
    },
  };
}
