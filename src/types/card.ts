export type TemplateId = 'current' | 'legacy';

export type CardField = 'name' | 'nameEn' | 'bandName' | 'birthday';

export interface AvatarTransform {
  src: string;
  left: number;
  top: number;
  scale: number;
}

export interface CardDocument {
  templateId: TemplateId;
  name: string;
  nameEn: string;
  bandName: string;
  birthday?: string;
  avatar: AvatarTransform;
}

export interface CardDocumentDefaults {
  name: string;
  nameEn: string;
  bandName: string;
  birthday?: string;
  avatar: AvatarTransform;
}

export interface CardCanvasDefinition {
  width: number;
  height: number;
  radius: number;
}

export interface CardAssetsDefinition {
  background: string;
  logo: string;
  avatarFrame?: string;
}

export interface AvatarFrameDefinition {
  left: number;
  top: number;
  width: number;
  height: number;
  radius: number;
}

export interface CardFieldDefinition {
  role: 'field';
  field: CardField;
  left: number;
  top: number;
  fontSize: number;
  fontFamily?: string;
  fontWeight: 'normal' | 'bold';
  fill: string;
  minSize?: number;
  maxWidth?: number;
}

interface CardStaticObjectBase {
  role: 'static';
  id: string;
}

export interface CardStaticRectDefinition extends CardStaticObjectBase {
  type: 'rect';
  left: number;
  top: number;
  width: number;
  height: number;
  fill: string;
  radius?: number;
}

export interface CardStaticCircleDefinition extends CardStaticObjectBase {
  type: 'circle';
  left: number;
  top: number;
  radius: number;
  fill: string;
}

export interface CardStaticTextDefinition extends CardStaticObjectBase {
  type: 'text';
  left: number;
  top: number;
  text: string;
  fontSize: number;
  fontFamily: string;
  fontWeight: 'normal' | 'bold';
  fill: string;
  letterSpacing?: number;
}

export interface CardStaticImageDefinition extends CardStaticObjectBase {
  type: 'image';
  left: number;
  top: number;
  width: number;
  height: number;
  asset: 'background' | 'logo' | 'avatarFrame';
  radius?: number;
}

export type CardStaticObjectDefinition =
  | CardStaticRectDefinition
  | CardStaticCircleDefinition
  | CardStaticTextDefinition
  | CardStaticImageDefinition;

export interface CardTemplateDefinition {
  id: TemplateId;
  canvas: CardCanvasDefinition;
  assets: CardAssetsDefinition;
  defaults: CardDocumentDefaults;
  avatarFrame: AvatarFrameDefinition;
  fields: Partial<Record<CardField, CardFieldDefinition>>;
  staticObjects: CardStaticObjectDefinition[];
}

export type PatchSource = 'inspector' | 'canvas' | 'system';

export interface FieldCardPatch {
  type: 'field';
  field: CardField;
  value: string;
}

export interface AvatarCardPatch {
  type: 'avatar';
  value: AvatarTransform;
}

export type CardPatch = FieldCardPatch | AvatarCardPatch;

export type EditorSelection =
  | { type: 'none' }
  | { type: 'avatar' }
  | { type: 'field'; field: CardField };

export type EditorAction = 'copy' | 'export';

export type EditorStatus =
  | { state: 'idle' }
  | { state: 'working'; action: EditorAction }
  | { state: 'success'; action: EditorAction; message: string }
  | { state: 'error'; action: EditorAction; code: ExportErrorCode; message: string };

export type ResourceErrorCode =
  | 'background-load-failed'
  | 'logo-load-failed'
  | 'avatar-load-failed'
  | 'font-load-failed';

export type ResourceStatus =
  | { state: 'loading' }
  | { state: 'ready' }
  | { state: 'degraded'; code: 'font-fallback'; message: string }
  | { state: 'error'; code: ResourceErrorCode; message: string; recoverable: boolean };

export interface FieldValidationError {
  field: CardField;
  code: 'text-too-wide';
  message: string;
}

export type AvatarUploadErrorCode =
  | 'unsupported-type'
  | 'file-too-large'
  | 'decode-failed'
  | 'load-failed';

export type ExportErrorCode =
  | 'render-failed'
  | 'download-failed'
  | 'clipboard-unsupported'
  | 'clipboard-denied'
  | 'clipboard-failed';
