import type { FabricImage, FabricObject } from "fabric";

import { fitText } from "@/editor/textFit";
import {
  configureAvatarImage,
  createEditableFabricText,
  createStaticFabricObject,
} from "@/fabric/objectFactories";
import type {
  CardDocument,
  CardField,
  CardFieldDefinition,
  CardStaticImageDefinition,
  CardTemplateDefinition,
  FieldValidationError,
  ResourceStatus,
} from "@/types/card";
import type {
  CanvasAdapter,
  FabricCardScene,
  RenderCardOptions,
} from "@/fabric/types";

const scenes = new WeakMap<CanvasAdapter, FabricCardScene>();

interface StaticEntry {
  definition: CardTemplateDefinition["staticObjects"][number];
  object: FabricObject;
}

function collectFontFamilies(template: CardTemplateDefinition): string[] {
  const families = new Set<string>();

  for (const definition of template.staticObjects) {
    if (definition.type === "text") {
      families.add(definition.fontFamily);
    }
  }

  for (const definition of Object.values(template.fields)) {
    if (definition?.fontFamily !== undefined) {
      families.add(definition.fontFamily);
    }
  }

  return [...families];
}

function resolveStaticImageUrls(
  template: CardTemplateDefinition,
): Array<{ definition: CardStaticImageDefinition; src: string }> {
  const images: Array<{
    definition: CardStaticImageDefinition;
    src: string;
  }> = [];

  for (const definition of template.staticObjects) {
    if (definition.type !== "image") {
      continue;
    }

    const src = template.assets[definition.asset];
    if (src === undefined) {
      throw new TypeError(
        `Missing asset URL for static image ${definition.id} (${definition.asset})`,
      );
    }

    images.push({ definition, src });
  }

  return images;
}

function withMeasureOptions(
  definition: CardFieldDefinition,
  fontSize: number,
): { fontSize: number; fontFamily?: string; fontWeight?: string } {
  if (definition.fontFamily === undefined) {
    return { fontSize, fontWeight: definition.fontWeight };
  }

  return {
    fontSize,
    fontFamily: definition.fontFamily,
    fontWeight: definition.fontWeight,
  };
}

function isDisclaimer(entry: StaticEntry): boolean {
  return entry.definition.id.startsWith("disclaimer-");
}

function isObject(value: unknown): value is FabricObject {
  return typeof value === "object" && value !== null;
}

function uniqueObjectGraph(objects: readonly FabricObject[]): FabricObject[] {
  const result: FabricObject[] = [];
  const seen = new Set<FabricObject>();

  const visit = (object: FabricObject): void => {
    if (seen.has(object)) {
      return;
    }

    seen.add(object);
    result.push(object);

    const clipPath = object.clipPath;
    if (isObject(clipPath)) {
      visit(clipPath);
    }
  };

  for (const object of objects) {
    visit(object);
  }

  return result;
}

function disposeObjects(objects: readonly FabricObject[]): void {
  for (const object of uniqueObjectGraph(objects)) {
    try {
      object.dispose();
    } catch {
      // Cleanup must continue so every newly-built object is visited once.
    }
  }
}

function createFieldObjects(
  document: CardDocument,
  template: CardTemplateDefinition,
  options: RenderCardOptions,
  builtObjects: FabricObject[],
): {
  fields: Partial<
    Record<CardField, ReturnType<typeof createEditableFabricText>>
  >;
  objects: FabricObject[];
  fieldErrors: FieldValidationError[];
} {
  const fields: Partial<
    Record<CardField, ReturnType<typeof createEditableFabricText>>
  > = {};
  const objects: FabricObject[] = [];
  const fieldErrors: FieldValidationError[] = [];

  for (const definition of Object.values(template.fields)) {
    if (definition === undefined) {
      continue;
    }

    const value = document[definition.field] ?? "";
    let fontSize = definition.fontSize;

    if (definition.minSize !== undefined && definition.maxWidth !== undefined) {
      const result = fitText({
        text: value,
        baseSize: definition.fontSize,
        minSize: definition.minSize,
        maxWidth: definition.maxWidth,
        measure: (text, measuredSize) =>
          options.measureText(
            text,
            withMeasureOptions(definition, measuredSize),
          ),
      });
      fontSize = result.fontSize;

      if (!result.valid) {
        fieldErrors.push({
          field: definition.field,
          code: "text-too-wide",
          message: "内容过长，请缩短后重试。",
        });
      }
    }

    const factoryDefinition =
      fontSize === definition.fontSize
        ? definition
        : { ...definition, fontSize };
    const fieldObject = createEditableFabricText(
      factoryDefinition,
      value,
      options.mode,
    );

    fields[definition.field] = fieldObject;
    objects.push(fieldObject);
    builtObjects.push(fieldObject);
  }

  return { fields, objects, fieldErrors };
}

interface LoadedResources {
  resourceStatus: ResourceStatus;
  staticImages: FabricImage[];
  avatar: FabricImage;
}

function startResource<T>(load: () => Promise<T>): Promise<T> {
  try {
    return Promise.resolve(load());
  } catch (error) {
    return Promise.reject(error);
  }
}

async function loadResources(
  document: CardDocument,
  template: CardTemplateDefinition,
  options: RenderCardOptions,
  staticImages: Array<{ definition: CardStaticImageDefinition; src: string }>,
): Promise<LoadedResources> {
  const families = collectFontFamilies(template);
  const fontPromise = startResource(() =>
    options.assets.waitForFonts(families),
  );
  const staticImagePromises = staticImages.map(({ src }) =>
    startResource(() => options.assets.loadImage(src)),
  );
  const avatarPromise = startResource(() =>
    options.assets.loadImage(document.avatar.src),
  );

  const [fontResult] = await Promise.allSettled([fontPromise]);
  const imageResults = await Promise.allSettled([
    ...staticImagePromises,
    avatarPromise,
  ]);

  const loadedImages = imageResults.flatMap((result) =>
    result.status === "fulfilled" ? [result.value] : [],
  );

  if (fontResult.status === "rejected") {
    disposeObjects(loadedImages);
    throw fontResult.reason;
  }

  for (const result of imageResults) {
    if (result.status === "rejected") {
      disposeObjects(loadedImages);
      throw result.reason;
    }
  }

  const avatarResult = imageResults.pop();
  if (avatarResult === undefined || avatarResult.status !== "fulfilled") {
    disposeObjects(loadedImages);
    throw avatarResult?.reason;
  }

  const loadedStaticImages: FabricImage[] = [];
  for (const result of imageResults) {
    if (result.status !== "fulfilled") {
      disposeObjects(loadedImages);
      throw result.reason;
    }
    loadedStaticImages.push(result.value);
  }

  return {
    resourceStatus: fontResult.value,
    staticImages: loadedStaticImages,
    avatar: avatarResult.value,
  };
}

function buildScene(
  document: CardDocument,
  template: CardTemplateDefinition,
  options: RenderCardOptions,
  resources: LoadedResources,
): {
  avatar: FabricImage;
  fields: Partial<
    Record<CardField, ReturnType<typeof createEditableFabricText>>
  >;
  objects: FabricObject[];
  fieldErrors: FieldValidationError[];
  builtObjects: FabricObject[];
} {
  const builtObjects: FabricObject[] = [];
  const staticEntries: StaticEntry[] = [];
  let imageIndex = 0;

  try {
    for (const definition of template.staticObjects) {
      let loadedImage: FabricImage | undefined;
      if (definition.type === "image") {
        loadedImage = resources.staticImages[imageIndex];
        imageIndex += 1;
      }
      const object = createStaticFabricObject(definition, loadedImage);
      staticEntries.push({ definition, object });
      builtObjects.push(object);
    }

    const avatar = configureAvatarImage(
      resources.avatar,
      document.avatar,
      template.avatarFrame,
      options.mode,
    );
    builtObjects.push(avatar);

    const fieldResult = createFieldObjects(
      document,
      template,
      options,
      builtObjects,
    );

    const anchorId =
      template.id === "legacy" ? "avatar-background" : "avatar-frame";
    const anchorIndex = staticEntries.findIndex(
      ({ definition }) => definition.id === anchorId,
    );
    const prefixEnd = anchorIndex < 0 ? 0 : anchorIndex + 1;
    const prefix = staticEntries
      .slice(0, prefixEnd)
      .filter((entry) => !isDisclaimer(entry))
      .map(({ object }) => object);
    const remaining = staticEntries
      .slice(prefixEnd)
      .filter((entry) => !isDisclaimer(entry))
      .map(({ object }) => object);
    const disclaimers = staticEntries
      .filter(isDisclaimer)
      .map(({ object }) => object);
    const orderedObjects = [
      ...prefix,
      avatar,
      ...remaining,
      ...fieldResult.objects,
      ...disclaimers,
    ];

    if (anchorIndex < 0) {
      orderedObjects.splice(
        0,
        orderedObjects.length,
        ...staticEntries
          .filter((entry) => !isDisclaimer(entry))
          .map(({ object }) => object),
        avatar,
        ...fieldResult.objects,
        ...staticEntries.filter(isDisclaimer).map(({ object }) => object),
      );
    }

    return {
      avatar,
      fields: fieldResult.fields,
      objects: orderedObjects,
      fieldErrors: fieldResult.fieldErrors,
      builtObjects,
    };
  } catch (error) {
    disposeObjects([
      ...resources.staticImages,
      resources.avatar,
      ...builtObjects,
    ]);
    throw error;
  }
}

export async function renderCardDocument(
  canvas: CanvasAdapter,
  document: CardDocument,
  template: CardTemplateDefinition,
  options: RenderCardOptions,
): Promise<FabricCardScene> {
  if (document.templateId !== template.id) {
    throw new RangeError(
      `Document template ${document.templateId} does not match template ${template.id}`,
    );
  }

  const staticImages = resolveStaticImageUrls(template);
  const resources = await loadResources(
    document,
    template,
    options,
    staticImages,
  );

  const built = buildScene(document, template, options, resources);

  const previous = scenes.get(canvas);
  if (previous !== undefined) {
    previous.disposeObjectListeners();
    disposeObjects(previous.objects);
  }

  canvas.discardActiveObject();
  canvas.clear();
  canvas.add(...built.objects);
  canvas.requestRenderAll();

  const scene: FabricCardScene = {
    avatar: built.avatar,
    fields: built.fields,
    objects: built.objects,
    resourceStatus: resources.resourceStatus,
    fieldErrors: built.fieldErrors,
    disposeObjectListeners: () => undefined,
  };
  scenes.set(canvas, scene);

  return scene;
}
