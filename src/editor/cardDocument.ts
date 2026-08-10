import type {
  AvatarTransform,
  CardDocument,
  CardField,
  CardTemplateDefinition
} from '@/types/card';

function copyAvatar(avatar: AvatarTransform): AvatarTransform {
  return { ...avatar };
}

function copyDocument(document: CardDocument): CardDocument {
  return {
    ...document,
    avatar: copyAvatar(document.avatar)
  };
}

export function createCardDocument(template: CardTemplateDefinition): CardDocument {
  const { defaults } = template;
  const document: CardDocument = {
    templateId: template.id,
    name: defaults.name,
    nameEn: defaults.nameEn,
    bandName: defaults.bandName,
    avatar: copyAvatar(defaults.avatar)
  };

  if (defaults.birthday !== undefined) {
    document.birthday = defaults.birthday;
  }

  return document;
}

export function updateCardField(
  document: CardDocument,
  field: CardField,
  value: string
): CardDocument {
  const next = copyDocument(document);
  next[field] = value;
  return next;
}

export function resetCardField(
  document: CardDocument,
  template: CardTemplateDefinition,
  field: CardField
): CardDocument {
  const next = copyDocument(document);
  const defaultValue = template.defaults[field];

  if (defaultValue === undefined) {
    delete next[field];
  } else {
    next[field] = defaultValue;
  }

  return next;
}

export function resetAvatar(
  document: CardDocument,
  template: CardTemplateDefinition
): CardDocument {
  return {
    ...copyDocument(document),
    avatar: copyAvatar(template.defaults.avatar)
  };
}

export function resetCardDocument(template: CardTemplateDefinition): CardDocument {
  return createCardDocument(template);
}
