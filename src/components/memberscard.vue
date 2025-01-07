<script setup lang="ts">
import { ref, reactive, onMounted, computed } from 'vue';
import MembersCardBg from '@/assets/memberscard_bg.svg';
import RingLogo from '@/assets/ring_logo.svg';
import AvatarBg from '@/assets/avatar_bg.jpg';
import demoAvatar from '@/assets/getImg.png';
import Konva from 'konva';
import { type Context } from 'konva/lib/Context';
import { type Shape } from 'konva/lib/Shape';
import type { space } from 'postcss/lib/list';
import type { Rect } from 'konva/lib/shapes/Rect';

const stageSize = {
    width: 960,
    height: 640
}

const MCBgImageObj = new Image();
MCBgImageObj.src = MembersCardBg;
const RingLogoObj = new Image();
RingLogoObj.src = RingLogo;
const AvatarBgObj = new Image();
AvatarBgObj.src = AvatarBg;
const AvatarImgObj = ref<HTMLImageElement>(new Image());

const AvatarImgOffsetStr = reactive({
    x: "0",
    y: "0"
})
const AvatarImgOffset = computed(() => {
    return {
        x: Number(AvatarImgOffsetStr.x),
        y: Number(AvatarImgOffsetStr.y)
    }
})
const AvatarScaleStr = ref<string>("100");
const AvatarScale = computed(() => Number(AvatarScaleStr.value) / 100);
const bandName = ref<string>('Morfonica');
const name = ref<string>('二葉 つくし');
const nameEn = ref<string>('Tsukushi Futaba');
const birthday = ref<string>('9/15');

const handleFileChange = (e: Event) => {
    const target = e.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.src = e.target?.result as string;
        img.onload = () => {
            AvatarImgObj.value = img;
        }
    }
    reader.readAsDataURL(file);
}

const handleDragMove = () => {
    console.debug('dragging');
}

onMounted(() => {
    AvatarImgObj.value.src = demoAvatar;
})
</script>

<template>
    <div class="w-full overflow-auto">
        <div class="w-fit overflow-hidden rounded-xl">
            <v-stage :config="stageSize">
                <v-layer>
                    <v-rect :config="{
                        x: 0,
                        y: 0,
                        width: stageSize.width,
                        height: stageSize.height,
                        fill: '#fff',
                    }"></v-rect>
                    <v-image :config="{
                        x: 0,
                        y: 0,
                        image: MCBgImageObj,
                        ...stageSize
                    }"></v-image>
                    <v-image :config="{
                        x: 25,
                        y: 40,
                        image: AvatarBgObj,
                        width: 370,
                        height: 560,
                        cornerRadius: 25
                    }"></v-image>
                    <v-group :config="{
                        x: 30,
                        y: 45,
                        width: 360,
                        height: 550,
                        cornerRadius: 25
                    }">
                        <v-rect
                            :config="{
                                x: 0,
                                y: 0,
                                width: 360,
                                height: 550,
                                cornerRadius: 25,
                                fillPatternImage: AvatarImgObj,
                                fillPatternOffset: AvatarImgOffset,
                                fillPatternScale: { x: AvatarScale, y: AvatarScale },
                            }"></v-rect>
                    </v-group>
                    <v-text :config="{
                        text: `MEMBER\'S CARD`,
                        x: 430,
                        y: 65,
                        fontSize: 35,
                        fill: '#fff',
                        fontStyle: '',
                        letterSpacing: 5,
                        fontFamily: 'sans',
                    }">
                    </v-text>
                    <v-image :config="{
                        x: 430,
                        y: 190,
                        image: RingLogoObj,
                        width: RingLogoObj.width / 2.5,
                        height: RingLogoObj.height / 2.5
                    }"></v-image>
                    <v-group :config="{
                        x: 430,
                        y: 280,
                    }">
                        <v-rect :config="{
                            x: 0,
                            y: 0,
                            width: 55,
                            height: 22,
                            letterSpacing: 1,
                            fill: '#000',
                        }"></v-rect>
                        <v-text :config="{
                            x: 5,
                            y: 5,
                            fontStyle: 'bold',
                            text: 'NAME',
                            fontSize: 15,
                            fill: '#fff',
                        }"></v-text>
                        <v-text :config="{
                            x: 0,
                            y: 33,
                            text: name,
                            fontStyle: 'bold',
                            fontSize: 40,
                        }"></v-text>
                        <v-text :config="{
                            x: 0,
                            y: 83,
                            text: nameEn,
                            fontSize: 20,
                        }"></v-text>
                    </v-group>
                    <v-group :config="{
                        x: 430,
                        y: 420,
                    }">
                        <v-rect :config="{
                            x: 0,
                            y: 0,
                            width: 102,
                            height: 22,
                            letterSpacing: 1,
                            fill: '#000',
                        }"></v-rect>
                        <v-text :config="{
                            x: 5,
                            y: 5,
                            fontStyle: 'bold',
                            text: 'BAND NAME',
                            fontSize: 15,
                            fill: '#fff',
                        }"></v-text>
                        <v-text :config="{
                            x: 0,
                            y: 33,
                            text: bandName,
                            fontStyle: 'bold',
                            fontSize: 40,
                        }"></v-text>
                    </v-group>
                    <v-group :config="{
                        x: 730,
                        y: 420,
                    }">
                        <v-rect :config="{
                            x: 0,
                            y: 0,
                            width: 125,
                            height: 22,
                            letterSpacing: 1,
                            fill: '#000',
                        }"></v-rect>
                        <v-text :config="{
                            x: 5,
                            y: 5,
                            fontStyle: 'bold',
                            text: 'DATE OF BIRTH',
                            fontSize: 15,
                            fill: '#fff',
                        }"></v-text>
                        <v-text :config="{
                            x: 0,
                            y: 33,
                            text: birthday,
                            fontStyle: 'bold',
                            fontSize: 40,
                        }"></v-text>
                    </v-group>
                    <v-group :config="{
                        x: 430,
                        y: 530,
                    }">
                        <v-rect :config="{
                            x: 0,
                            y: 0,
                            width: 15,
                            height: 15,
                            letterSpacing: 1,
                            fill: '#000',
                        }"></v-rect>
                        <v-rect :config="{
                            x: 0,
                            y: 45,
                            width: 15,
                            height: 15,
                            letterSpacing: 1,
                            fill: '#000',
                        }"></v-rect>
                        <v-text :config="{
                            x: 16,
                            y: 0,
                            text: 'この会員証はライブハウスRiNGの\n会員であることを証明するものです。',
                            fontSize: 20,
                            fontStyle: 'bold',
                            fill: '#000',
                        }"></v-text>
                        <v-text :config="{
                            x: 16,
                            y: 45,
                            text: 'この会員証は会員本人以外は使用できません。',
                            fontSize: 20,
                            fontStyle: 'bold',
                            fill: '#000',
                        }"></v-text>
                    </v-group>
                </v-layer>
            </v-stage>
        </div>
    </div>

    <div>
        <div>名称：<input class="input input-bordered w-full max-w-xs" placeholder="名称" v-model="name" /></div>
        <div>名称英文：<input class="input input-bordered w-full max-w-xs" placeholder="Name" v-model="nameEn" /></div>
        <div>乐队名称：<input class="input input-bordered w-full max-w-xs" placeholder="Morfonica" v-model="bandName" /></div>
        <div>生日：<input class="input input-bordered w-full max-w-xs" placeholder="9/15" v-model="birthday" /></div>
        <div>调整图像：
            load:<input class="file-input w-full max-w-xs" type="file" accept="image/*" @change="handleFileChange" />
            scale:<input type="range" min="25" max="200" value="100" class="range" v-model="AvatarScaleStr" />
            x:<input type="range" min="0" :max="AvatarImgObj.width - 360" class="range" v-model="AvatarImgOffsetStr.x" />
            y:<input type="range" min="0" :max="AvatarImgObj.height - 550" class="range" v-model="AvatarImgOffsetStr.y" />
        </div>
    </div>
</template>

<style scoped></style>