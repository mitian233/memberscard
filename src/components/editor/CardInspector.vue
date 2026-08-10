<script setup lang="ts">
import { computed, useId, useTemplateRef } from "vue";
import type {
  AvatarTransform,
  CardDocument,
  CardField,
  CardTemplateDefinition,
  FieldValidationError,
} from "@/types/card";

export type InspectorGroup = "basic" | "avatar";
type AvatarNumberField = "left" | "top" | "scale";

const props = defineProps<{
  document: CardDocument;
  template: CardTemplateDefinition;
  activeGroup: InspectorGroup;
  fieldErrors: Readonly<Partial<Record<CardField, FieldValidationError>>>;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  "update:activeGroup": [group: InspectorGroup];
  "update-field": [field: CardField, value: string];
  "update-avatar": [value: AvatarTransform];
  "reset-field": [field: CardField];
  "reset-avatar": [];
  "avatar-file": [file: File];
}>();

const idPrefix = `card-inspector-${useId()}`;
const basicTabRef = useTemplateRef<HTMLButtonElement>("basicTab");
const avatarTabRef = useTemplateRef<HTMLButtonElement>("avatarTab");
const fileInputRef = useTemplateRef<HTMLInputElement>("fileInput");

const fieldOrder = [
  "name",
  "nameEn",
  "bandName",
  "birthday",
] as const satisfies readonly CardField[];
const fieldLabels: Record<CardField, string> = {
  name: "姓名",
  nameEn: "英文名",
  bandName: "乐队名",
  birthday: "出生日期",
};

const avatarFieldOrder = [
  "left",
  "top",
  "scale",
] as const satisfies readonly AvatarNumberField[];
const avatarFieldLabels: Record<AvatarNumberField, string> = {
  left: "水平位置",
  top: "垂直位置",
  scale: "缩放",
};
const avatarControlConfig = {
  left: { min: -960, max: 960, step: 0.01 },
  top: { min: -960, max: 960, step: 0.01 },
  scale: { min: 0.1, max: 3, step: 0.01 },
} as const satisfies Record<
  AvatarNumberField,
  { min: number; max: number; step: number }
>;

const visibleFields = computed(() =>
  fieldOrder.filter(
    (field) =>
      props.template.fields[field] !== undefined &&
      props.document[field] !== undefined,
  ),
);

const selectedPanelId = computed(() => panelId(props.activeGroup));

function tabId(group: InspectorGroup) {
  return `${idPrefix}-${group}-tab`;
}

function panelId(group: InspectorGroup) {
  return `${idPrefix}-${group}-panel`;
}

function fieldControlId(field: CardField) {
  return `${idPrefix}-field-${field}`;
}

function fieldErrorId(field: CardField) {
  return `${idPrefix}-field-${field}-error`;
}

function fileInputId() {
  return `${idPrefix}-avatar-file`;
}

function avatarControlId(field: AvatarNumberField) {
  return `${idPrefix}-avatar-${field}`;
}

function selectGroup(group: InspectorGroup) {
  if (props.disabled) return;
  emit("update:activeGroup", group);
}

function focusGroupTab(group: InspectorGroup) {
  if (group === "basic") {
    basicTabRef.value?.focus();
  } else {
    avatarTabRef.value?.focus();
  }
}

function handleTabKeydown(event: KeyboardEvent, group: InspectorGroup) {
  if (props.disabled) return;

  let nextGroup: InspectorGroup;
  switch (event.key) {
    case "ArrowLeft":
    case "ArrowUp":
      nextGroup = group === "basic" ? "avatar" : "basic";
      break;
    case "ArrowRight":
    case "ArrowDown":
      nextGroup = group === "basic" ? "avatar" : "basic";
      break;
    case "Home":
      nextGroup = "basic";
      break;
    case "End":
      nextGroup = "avatar";
      break;
    default:
      return;
  }

  event.preventDefault();
  selectGroup(nextGroup);
  focusGroupTab(nextGroup);
}

function handleFieldInput(field: CardField, event: Event) {
  if (props.disabled) return;
  const target = event.target as HTMLInputElement | null;
  if (!target) return;
  emit("update-field", field, target.value);
}

function resetField(field: CardField) {
  if (props.disabled) return;
  emit("reset-field", field);
}

function fieldError(field: CardField) {
  return props.fieldErrors[field];
}

function handleAvatarNumberInput(field: AvatarNumberField, event: Event) {
  if (props.disabled) return;
  const target = event.target as HTMLInputElement | null;
  const rawValue = target?.value ?? "";
  if (rawValue.trim() === "") return;

  const value = Number(rawValue);
  if (!Number.isFinite(value)) return;

  emit("update-avatar", {
    ...props.document.avatar,
    [field]: value,
  });
}

function handleAvatarFileChange(event: Event) {
  const target = event.target as HTMLInputElement | null;
  const file = target?.files?.[0];

  if (!props.disabled && file) {
    emit("avatar-file", file);
  }

  if (target) target.value = "";
  const fileInput = fileInputRef.value;
  if (fileInput) fileInput.value = "";
}

function resetAvatar() {
  if (props.disabled) return;
  emit("reset-avatar");
}
</script>

<template>
  <aside
    class="card card-inspector border border-base-300 bg-base-100 text-base-content shadow-sm"
    :aria-labelledby="`${idPrefix}-title`"
  >
    <div class="card-body inspector-body">
      <header class="inspector-header">
        <h2 :id="`${idPrefix}-title`" class="card-title inspector-title">
          编辑控制台
        </h2>
        <p class="inspector-helper text-base-content/60">
          编辑卡片信息与头像，改动会即时同步到预览。
        </p>
      </header>

      <div
        class="tabs tabs-boxed inspector-tabs bg-base-200"
        role="tablist"
        aria-label="编辑分组"
      >
        <button
          :id="tabId('basic')"
          ref="basicTab"
          class="tab inspector-control inspector-tab"
          :class="{ 'tab-active': props.activeGroup === 'basic' }"
          type="button"
          role="tab"
          :aria-selected="props.activeGroup === 'basic'"
          :aria-controls="panelId('basic')"
          :tabindex="props.activeGroup === 'basic' ? 0 : -1"
          :disabled="props.disabled"
          @click="selectGroup('basic')"
          @keydown="handleTabKeydown($event, 'basic')"
        >
          基本信息
        </button>
        <button
          :id="tabId('avatar')"
          ref="avatarTab"
          class="tab inspector-control inspector-tab"
          :class="{ 'tab-active': props.activeGroup === 'avatar' }"
          type="button"
          role="tab"
          :aria-selected="props.activeGroup === 'avatar'"
          :aria-controls="panelId('avatar')"
          :tabindex="props.activeGroup === 'avatar' ? 0 : -1"
          :disabled="props.disabled"
          @click="selectGroup('avatar')"
          @keydown="handleTabKeydown($event, 'avatar')"
        >
          头像调整
        </button>
      </div>

      <section
        :id="selectedPanelId"
        class="inspector-panel"
        role="tabpanel"
        :aria-labelledby="tabId(props.activeGroup)"
        tabindex="0"
      >
        <div v-if="props.activeGroup === 'basic'" class="inspector-fields">
          <div
            v-for="field in visibleFields"
            :key="field"
            class="form-control inspector-field"
          >
            <div class="inspector-field-heading">
              <label class="label field-label" :for="fieldControlId(field)">
                <span class="label-text">{{ fieldLabels[field] }}</span>
              </label>
              <button
                class="btn btn-ghost btn-xs inspector-control reset-button"
                type="button"
                :data-reset-field="field"
                :aria-label="`重置${fieldLabels[field]}`"
                :disabled="props.disabled"
                @click="resetField(field)"
              >
                重置
              </button>
            </div>
            <input
              :id="fieldControlId(field)"
              class="input input-bordered inspector-control inspector-input"
              :class="{ 'input-error': fieldError(field) }"
              :data-field="field"
              type="text"
              autocomplete="off"
              :disabled="props.disabled"
              :value="props.document[field]"
              :aria-invalid="fieldError(field) ? 'true' : undefined"
              :aria-describedby="
                fieldError(field) ? fieldErrorId(field) : undefined
              "
              @input="handleFieldInput(field, $event)"
            />
            <p
              v-if="fieldError(field)"
              :id="fieldErrorId(field)"
              class="label-text-alt text-error field-error"
              role="alert"
              :data-field-error="field"
            >
              {{ fieldError(field)?.message }}
            </p>
          </div>
        </div>

        <div v-else class="avatar-controls">
          <div class="form-control inspector-field avatar-file-field">
            <label class="label field-label" :for="fileInputId()">
              <span class="label-text">更换头像</span>
            </label>
            <input
              :id="fileInputId()"
              ref="fileInput"
              class="file-input file-input-bordered inspector-control inspector-input"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              :disabled="props.disabled"
              @change="handleAvatarFileChange"
            />
          </div>

          <div
            v-for="field in avatarFieldOrder"
            :key="field"
            class="form-control inspector-field avatar-slider-field"
          >
            <div class="avatar-field-heading">
              <label class="label field-label" :for="avatarControlId(field)">
                <span class="label-text">{{ avatarFieldLabels[field] }}</span>
              </label>
              <output class="badge badge-ghost badge-sm avatar-value">
                {{ props.document.avatar[field] }}
              </output>
            </div>
            <div class="avatar-control-pair">
              <input
                class="range range-primary range-sm inspector-control avatar-range"
                type="range"
                :data-avatar-range="field"
                :aria-label="`${avatarFieldLabels[field]}拉杆`"
                :min="avatarControlConfig[field].min"
                :max="avatarControlConfig[field].max"
                :step="avatarControlConfig[field].step"
                :disabled="props.disabled"
                :value="props.document.avatar[field]"
                @input="handleAvatarNumberInput(field, $event)"
              />
              <input
                :id="avatarControlId(field)"
                class="input input-bordered input-sm inspector-control inspector-input avatar-number"
                :data-avatar-field="field"
                type="number"
                :min="avatarControlConfig[field].min"
                :max="avatarControlConfig[field].max"
                :step="avatarControlConfig[field].step"
                autocomplete="off"
                :disabled="props.disabled"
                :value="props.document.avatar[field]"
                @input="handleAvatarNumberInput(field, $event)"
              />
            </div>
          </div>

          <button
            class="btn btn-ghost inspector-control reset-avatar-button"
            type="button"
            data-reset-avatar
            :disabled="props.disabled"
            @click="resetAvatar"
          >
            恢复默认头像
          </button>
        </div>
      </section>
    </div>
  </aside>
</template>

<style scoped>
.card-inspector {
  min-width: 18rem;
  border-radius: 1rem;
}

.inspector-body {
  gap: 1rem;
  padding: 1rem;
}

.inspector-header,
.inspector-fields,
.avatar-controls {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.inspector-title,
.inspector-helper,
.field-error {
  margin: 0;
}

.inspector-title {
  font-size: 1rem;
  line-height: 1.4;
}

.inspector-helper {
  font-size: 0.875rem;
  line-height: 1.5;
}

.inspector-tabs {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.25rem;
  padding: 0.25rem;
}

.inspector-control {
  box-sizing: border-box;
  min-height: 44px;
}

.inspector-tab:disabled,
.reset-button:disabled,
.reset-avatar-button:disabled,
.inspector-input:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.inspector-field {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.inspector-field-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.field-label {
  min-height: auto;
  padding: 0;
  font-size: 0.875rem;
  font-weight: 600;
}

.inspector-input {
  width: 100%;
}

.reset-button {
  min-width: 3.75rem;
  font-size: 0.8125rem;
}

.reset-avatar-button {
  width: 100%;
}

.field-error {
  color: #b42318;
  font-size: 0.8125rem;
  font-weight: 600;
  line-height: 1.4;
}

.inspector-control:focus-visible {
  outline: 3px solid hsl(var(--p));
  outline-offset: 2px;
}

.avatar-field-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.avatar-value {
  min-width: 4.5rem;
  font-variant-numeric: tabular-nums;
}

.avatar-control-pair {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 6rem;
  align-items: center;
  gap: 0.75rem;
}

.avatar-range {
  width: 100%;
}

.avatar-number {
  font-variant-numeric: tabular-nums;
  text-align: right;
}
</style>
