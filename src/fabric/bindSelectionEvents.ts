import type { Canvas } from "fabric";

import type { EditorSelection } from "@/types/card";

import type { FabricCardScene } from "./types";

export type SelectionCanvas = Pick<Canvas, "on" | "getActiveObject">;

export interface BindSelectionEventsOptions {
  onSelectionChange(selection: EditorSelection): void;
}

const CARD_FIELDS = ["name", "nameEn", "bandName", "birthday"] as const;

function selectionForActiveObject(
  canvas: SelectionCanvas,
  scene: Pick<FabricCardScene, "avatar" | "fields">,
): EditorSelection {
  const activeObject = canvas.getActiveObject();
  if (activeObject === scene.avatar) {
    return { type: "avatar" };
  }

  for (const field of CARD_FIELDS) {
    const fieldObject = scene.fields[field];
    if (fieldObject !== undefined && activeObject === fieldObject) {
      return { type: "field", field };
    }
  }

  return { type: "none" };
}

export function bindSelectionEvents(
  canvas: SelectionCanvas,
  scene: Pick<FabricCardScene, "avatar" | "fields">,
  options: BindSelectionEventsOptions,
): () => void {
  let disposed = false;
  const handleSelection = (): void => {
    if (disposed) {
      return;
    }
    options.onSelectionChange(selectionForActiveObject(canvas, scene));
  };
  const handleCleared = (): void => {
    if (disposed) {
      return;
    }
    options.onSelectionChange({ type: "none" });
  };

  const disposeCreated = canvas.on("selection:created", handleSelection);
  const disposeUpdated = canvas.on("selection:updated", handleSelection);
  const disposeCleared = canvas.on("selection:cleared", handleCleared);

  return (): void => {
    if (disposed) {
      return;
    }
    disposed = true;
    disposeCreated();
    disposeUpdated();
    disposeCleared();
  };
}
