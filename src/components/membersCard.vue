<script setup lang="ts">
import { ref, reactive, onMounted, computed, onBeforeUnmount } from 'vue';
import { Popover, PopoverButton, PopoverPanel } from '@headlessui/vue';
import Konva from 'konva';
import MembersCardBg from '@/assets/memberscard_bg.svg';
import RingLogo from '@/assets/ring_logo.svg';
import AvatarBg from '@/assets/avatar_bg.jpg';

const stageSize = {
    width: 960,
    height: 640
};

const stageConfig = reactive({
    width: 960,
    height: 640,
    scaleX: 1,
    scaleY: 1
});

const memberCardRef = ref<HTMLElement | null>(null);
const stageRef = ref<Konva.Stage | null>(null);

const MCBgImageObj = new Image();
MCBgImageObj.src = MembersCardBg;
const RingLogoObj = new Image();
RingLogoObj.src = RingLogo;
const AvatarBgObj = new Image();
AvatarBgObj.src = AvatarBg;
const AvatarImgObj = ref<HTMLImageElement>(new Image());

const AvatarImgOffsetStr = reactive({
    x: '282',
    y: '0'
});
const AvatarImgOffset = computed(() => {
    return {
        x: Number(AvatarImgOffsetStr.x),
        y: Number(AvatarImgOffsetStr.y)
    };
});
const AvatarScaleStr = ref<string>('58');
const AvatarScale = computed(() => Number(AvatarScaleStr.value) / 100);
const bandName = ref<string>('Morfonica');
const name = ref<string>('二葉 つくし');
const nameEn = ref<string>('Tsukushi Futaba');
const birthday = ref<string>('9/15');

const handleFileChange = (event: Event) => {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = event => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
            AvatarImgObj.value = img;
        };
    };
    reader.readAsDataURL(file);
};

const handleResize = () => {
    //padding 20px
    const width = Math.min((memberCardRef.value?.clientWidth ?? 0) - 40, stageSize.width);
    const scaleRatio = Math.min(width / stageSize.width, 1);
    stageConfig.scaleX = scaleRatio;
    stageConfig.scaleY = scaleRatio;
    stageConfig.width = stageSize.width * stageConfig.scaleX;
    stageConfig.height = stageSize.height * stageConfig.scaleY;
};

const saveAsImage = () => {
    if (stageRef.value) {
        // clone stage to avoid changing the original stage
        const originalStage = stageRef.value.getStage().clone({
            width: stageSize.width * 4,
            height: stageSize.height * 4,
            scaleX: 4,
            scaleY: 4
        });
        const dataURL = originalStage.toDataURL();
        const link = document.createElement('a');
        link.download = 'memberscard.png';
        link.href = dataURL;
        link.click();

        originalStage.destroy();
    }
};

const copyImage = async () => {
    if (stageRef.value) {
        const originalStage = stageRef.value.getStage().clone({
            width: stageSize.width * 2,
            height: stageSize.height * 2,
            scaleX: 2,
            scaleY: 2
        });
        originalStage.toBlob().then(blob => {
            const item = new ClipboardItem({ 'image/png': blob as Blob });
            navigator.clipboard.write([item]);
            originalStage.destroy();
        });
    }
};

onMounted(() => {
    const img = new Image();
    img.src = '/demo.png';
    img.onload = () => {
        AvatarImgObj.value = img;
    };
    window.addEventListener('resize', handleResize);
    handleResize(); //init
    document.fonts.ready.then(() => {
        stageRef.value?.getStage().draw();
    });
});

onBeforeUnmount(() => {
    window.removeEventListener('resize', handleResize);
});
</script>

<template>
    <div class="container mx-auto">
        <div class="w-full flex justify-center items-center bg-black">
            <div
                ref="memberCardRef"
                class="memberCard w-full h-full max-w-[1000px] max-h-[680px] overflow-hidden p-5"
            >
                <v-stage ref="stageRef" :config="stageConfig">
                    <v-layer>
                        <v-rect
                            :config="{
                                x: 0,
                                y: 0,
                                width: stageSize.width,
                                height: stageSize.height,
                                cornerRadius: 40,
                                fill: '#fff'
                            }"
                        ></v-rect>
                        <v-image
                            :config="{
                                x: 0,
                                y: 0,
                                image: MCBgImageObj,
                                cornerRadius: 40,
                                ...stageSize
                            }"
                        ></v-image>
                        <v-image
                            :config="{
                                x: 25,
                                y: 40,
                                image: AvatarBgObj,
                                width: 370,
                                height: 560,
                                cornerRadius: 25
                            }"
                        ></v-image>
                        <v-group
                            :config="{
                                x: 30,
                                y: 45,
                                width: 360,
                                height: 550,
                                cornerRadius: 25
                            }"
                        >
                            <v-rect
                                :config="{
                                    x: 0,
                                    y: 0,
                                    width: 360,
                                    height: 550,
                                    cornerRadius: 25,
                                    fillPatternImage: AvatarImgObj,
                                    fillPatternOffset: AvatarImgOffset,
                                    fillPatternScale: { x: AvatarScale, y: AvatarScale }
                                }"
                            ></v-rect>
                        </v-group>
                        <v-text
                            :config="{
                                text: `MEMBER\'S CARD`,
                                x: 430,
                                y: 65,
                                fontSize: 35,
                                fill: '#fff',
                                fontStyle: '',
                                letterSpacing: 5,
                                fontFamily: 'Noto Sans JP'
                            }"
                        ></v-text>
                        <v-image
                            :config="{
                                x: 430,
                                y: 190,
                                image: RingLogoObj,
                                width: 300 / 2.5,
                                height: 124 / 2.5
                            }"
                        ></v-image>
                        <v-group
                            :config="{
                                x: 430,
                                y: 280
                            }"
                        >
                            <v-rect
                                :config="{
                                    x: 0,
                                    y: 0,
                                    width: 55,
                                    height: 22,
                                    letterSpacing: 1,
                                    fill: '#000'
                                }"
                            ></v-rect>
                            <v-text
                                :config="{
                                    x: 5,
                                    y: 5,
                                    fontStyle: 'bold',
                                    text: 'NAME',
                                    fontFamily: 'Poppins',
                                    fontSize: 15,
                                    fill: '#fff'
                                }"
                            ></v-text>
                            <v-text
                                :config="{
                                    x: 0,
                                    y: 33,
                                    text: name,
                                    fontStyle: 'bold',
                                    fontSize: 40,
                                    fontFamily: 'Noto Sans JP'
                                }"
                            ></v-text>
                            <v-text
                                :config="{
                                    x: 0,
                                    y: 83,
                                    text: nameEn,
                                    fontSize: 20,
                                    fontFamily: 'Poppins'
                                }"
                            ></v-text>
                        </v-group>
                        <v-group
                            :config="{
                                x: 430,
                                y: 420
                            }"
                        >
                            <v-rect
                                :config="{
                                    x: 0,
                                    y: 0,
                                    width: 102,
                                    height: 22,
                                    letterSpacing: 1,
                                    fill: '#000'
                                }"
                            ></v-rect>
                            <v-text
                                :config="{
                                    x: 5,
                                    y: 5,
                                    fontStyle: 'bold',
                                    text: 'BAND NAME',
                                    fontSize: 15,
                                    fontFamily: 'Poppins',
                                    fill: '#fff'
                                }"
                            ></v-text>
                            <v-text
                                :config="{
                                    x: 0,
                                    y: 33,
                                    text: bandName,
                                    fontStyle: 'bold',
                                    fontFamily: 'Poppins',
                                    fontSize: 40
                                }"
                            ></v-text>
                        </v-group>
                        <v-group
                            :config="{
                                x: 730,
                                y: 420
                            }"
                        >
                            <v-rect
                                :config="{
                                    x: 0,
                                    y: 0,
                                    width: 120,
                                    height: 22,
                                    letterSpacing: 1,
                                    fill: '#000'
                                }"
                            ></v-rect>
                            <v-text
                                :config="{
                                    x: 5,
                                    y: 5,
                                    fontStyle: 'bold',
                                    text: 'DATE OF BIRTH',
                                    fontSize: 15,
                                    fontFamily: 'Poppins',
                                    fill: '#fff'
                                }"
                            ></v-text>
                            <v-text
                                :config="{
                                    x: 0,
                                    y: 33,
                                    text: birthday,
                                    fontStyle: 'bold',
                                    fontFamily: 'Poppins',
                                    fontSize: 40
                                }"
                            ></v-text>
                        </v-group>
                        <v-group
                            :config="{
                                x: 430,
                                y: 530
                            }"
                        >
                            <v-rect
                                :config="{
                                    x: 0,
                                    y: 1,
                                    width: 15,
                                    height: 15,
                                    letterSpacing: 1,
                                    fill: '#000'
                                }"
                            ></v-rect>
                            <v-rect
                                :config="{
                                    x: 0,
                                    y: 46,
                                    width: 15,
                                    height: 15,
                                    letterSpacing: 1,
                                    fill: '#000'
                                }"
                            ></v-rect>
                            <v-text
                                :config="{
                                    x: 16,
                                    y: 0,
                                    text: 'この会員証はライブハウスRiNGの\n会員であることを証明するものです。',
                                    fontFamily: 'Noto Sans JP',
                                    fontSize: 20,
                                    fontStyle: 'bold',
                                    fill: '#000'
                                }"
                            ></v-text>
                            <v-text
                                :config="{
                                    x: 16,
                                    y: 45,
                                    text: 'この会員証は会員本人以外は使用できません。',
                                    fontFamily: 'Noto Sans JP',
                                    fontSize: 20,
                                    fontStyle: 'bold',
                                    fill: '#000'
                                }"
                            ></v-text>
                        </v-group>
                    </v-layer>
                </v-stage>
            </div>
        </div>
        <div class="card card-compact shadow-xl">
            <div class="card-body">
                <p>为了最佳使用体验，请使用电脑访问。</p>
                <p>
                    注意：Chrome 请右键或长按 canvas 画布下载，Safari 暂不支持右键保存 canvas
                    元素。第一次加载可能需要等待外部字体载入，如果字体显示不正常请多刷新几次。
                </p>
                <p>
                    如果你喜欢这个项目，请在
                    <a href="https://github.com/mitian233/memberscard" class="underline">GitHub</a>
                    为我点一颗星
                </p>
            </div>
        </div>
        <div class="my-5 grid grid-cols-2 gap-5">
            <button class="btn" @click="saveAsImage">保存图片</button>
            <button class="btn" @click="copyImage">复制图片</button>
            <a href="/old" class="btn col-span-2">一代会员证版本</a>
        </div>
    </div>
    <div class="fixed bottom-10 w-full max-w-fit left-1/2 -translate-x-1/2">
        <Popover v-slot="{ open }" class="relative flex justify-center">
            <PopoverButton
                :class="open ? 'text-white' : 'text-white/90'"
                class="group inline-flex items-center rounded-md bg-orange-700 px-5 py-2 text-base font-medium hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/75"
            >
                <span>自定义内容</span>
            </PopoverButton>

            <transition
                enter-active-class="transition duration-200 ease-out"
                enter-from-class="translate-y-1 opacity-0"
                enter-to-class="translate-y-0 opacity-100"
                leave-active-class="transition duration-150 ease-in"
                leave-from-class="translate-y-0 opacity-100"
                leave-to-class="translate-y-1 opacity-0"
            >
                <PopoverPanel
                    class="absolute left-1/2 bottom-1/2 z-10 mt-3 w-screen max-w-lg -translate-x-1/2 transform px-4 sm:px-0 lg:max-w-3xl"
                >
                    <div
                        class="overflow-hidden rounded-lg shadow-lg ring-1 ring-black/5 hover:opacity-90 duration-200"
                    >
                        <div class="bg-gray-50 p-4">
                            <table class="table-out">
                                <tbody>
                                    <tr>
                                        <th>名称</th>
                                        <th>
                                            <input
                                                v-model="name"
                                                class="input input-bordered w-full max-w-xs"
                                                placeholder="名称"
                                            />
                                        </th>
                                    </tr>
                                    <tr>
                                        <th>名称英文</th>
                                        <th>
                                            <input
                                                v-model="nameEn"
                                                class="input input-bordered w-full max-w-xs"
                                                placeholder="Name"
                                            />
                                        </th>
                                    </tr>
                                    <tr>
                                        <th>乐队名称</th>
                                        <th>
                                            <input
                                                v-model="bandName"
                                                class="input input-bordered w-full max-w-xs"
                                                placeholder="Morfonica"
                                            />
                                        </th>
                                    </tr>
                                    <tr>
                                        <th>生日</th>
                                        <th>
                                            <input
                                                v-model="birthday"
                                                class="input input-bordered w-full max-w-xs"
                                                placeholder="9/15"
                                            />
                                        </th>
                                    </tr>
                                    <tr>
                                        <th>调整图像</th>
                                        <th>
                                            <table class="table-in">
                                                <tbody>
                                                    <tr>
                                                        <th>加载</th>
                                                        <th>
                                                            <input
                                                                class="file-input w-full max-w-xs"
                                                                type="file"
                                                                accept="image/*"
                                                                @change="handleFileChange"
                                                            />
                                                        </th>
                                                    </tr>
                                                    <tr>
                                                        <th>缩放</th>
                                                        <th>
                                                            <input
                                                                v-model="AvatarScaleStr"
                                                                type="range"
                                                                min="1"
                                                                max="300"
                                                                class="range"
                                                            />
                                                        </th>
                                                    </tr>
                                                    <tr>
                                                        <th>x</th>
                                                        <th>
                                                            <input
                                                                v-model="AvatarImgOffsetStr.x"
                                                                type="range"
                                                                min="0"
                                                                :max="AvatarImgObj.width - 360"
                                                                class="range"
                                                            />
                                                        </th>
                                                    </tr>
                                                    <tr>
                                                        <th>y</th>
                                                        <th>
                                                            <input
                                                                v-model="AvatarImgOffsetStr.y"
                                                                type="range"
                                                                min="0"
                                                                :max="AvatarImgObj.height - 550"
                                                                class="range"
                                                            />
                                                        </th>
                                                    </tr>
                                                </tbody>
                                            </table>
                                        </th>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </PopoverPanel>
            </transition>
        </Popover>
    </div>
</template>

<style scoped>
table[class^='table-'] {
    tbody {
        tr {
            th {
                font-weight: normal;
                padding: 5px;
                text-align: right;
            }

            th:nth-child(2) {
                text-align: left;
            }
        }
    }
}

table[class^='table-in'] {
    margin-left: 0;

    tbody {
        tr {
            th {
                font-weight: normal;
                padding: 5px;
                text-align: right;
            }

            th:nth-child(2) {
                text-align: left;
            }
        }
    }
}
</style>
