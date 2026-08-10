<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import EditorDialog from "@/components/editor/EditorDialog.vue";

interface NewEditorGuideModalProps {
  cookieName: string;
  targetPath: string;
}

const props = defineProps<NewEditorGuideModalProps>();

const router = useRouter();
const open = ref(false);

function hasCookie(name: string): boolean {
  const prefix = `${encodeURIComponent(name)}=`;
  return document.cookie.split(";").some((cookie) => {
    return cookie.trim().startsWith(prefix);
  });
}

function setDismissedCookie(): void {
  const expires = new Date();
  expires.setHours(24, 0, 0, 0);
  document.cookie = [
    `${encodeURIComponent(props.cookieName)}=1`,
    `expires=${expires.toUTCString()}`,
    "path=/",
    "SameSite=Lax",
  ].join("; ");
}

function close(): void {
  setDismissedCookie();
  open.value = false;
}

async function tryNewDesign(): Promise<void> {
  setDismissedCookie();
  open.value = false;
  await router.push(props.targetPath);
}

onMounted(() => {
  open.value = !hasCookie(props.cookieName);
});
</script>

<template>
  <EditorDialog :open="open" title="试试全新会员证编辑器" @close="close">
    <p class="guide-copy">
      新版编辑器提供更灵活的卡片编辑和实时预览体验，立即体验全新网站。
    </p>

    <template #actions>
      <button class="btn btn-ghost" type="button" @click="close">
        暂不体验
      </button>
      <button class="btn btn-primary" type="button" @click="tryNewDesign">
        即刻体验
      </button>
    </template>
  </EditorDialog>
</template>

<style scoped>
.guide-copy {
  margin: 0;
  line-height: 1.7;
}
</style>
