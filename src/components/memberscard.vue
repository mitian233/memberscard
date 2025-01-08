<script setup lang="ts">
import { ref, reactive, onMounted, computed, onBeforeUnmount } from 'vue';
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

const handleFileChange = (e: Event) => {
    const target = e.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
        const img = new Image();
        img.src = e.target?.result as string;
        img.onload = () => {
            AvatarImgObj.value = img;
        };
    };
    reader.readAsDataURL(file);
};

const handleResize = () => {
    //padding 20px
    const width = Math.min((memberCardRef.value?.clientWidth ?? 0) - 40, stageSize.width);
    const scaleX = Math.min(width / stageSize.width, 1);
    stageConfig.scaleX = scaleX;
    stageConfig.scaleY = scaleX;
    stageConfig.width = stageSize.width * stageConfig.scaleX;
    stageConfig.height = stageSize.height * stageConfig.scaleY;
};

const saveAsImage = () => {
    if (stageRef.value) {
        // clone stage to avoid changing the original stage
        const originalStage = stageRef.value.getStage().clone({
            width: stageSize.width,
            height: stageSize.height,
            scaleX: 1,
            scaleY: 1
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
            width: stageSize.width,
            height: stageSize.height,
            scaleX: 1,
            scaleY: 1
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

import { Popover, PopoverButton, PopoverPanel } from '@headlessui/vue';

const solutions = [
    {
        name: 'Insights',
        description: 'Measure actions your users take',
        href: '##',
        icon: `
      <svg
        width="48"
        height="48"
        viewBox="0 0 48 48"
        fill="none"
        aria-hidden="true"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect width="48" height="48" rx="8" fill="#FFEDD5" />
        <path
          d="M24 11L35.2583 17.5V30.5L24 37L12.7417 30.5V17.5L24 11Z"
          stroke="#FB923C"
          stroke-width="2"
        />
        <path
          fill-rule="evenodd"
          clip-rule="evenodd"
          d="M16.7417 19.8094V28.1906L24 32.3812L31.2584 28.1906V19.8094L24 15.6188L16.7417 19.8094Z"
          stroke="#FDBA74"
          stroke-width="2"
        />
        <path
          fill-rule="evenodd"
          clip-rule="evenodd"
          d="M20.7417 22.1196V25.882L24 27.7632L27.2584 25.882V22.1196L24 20.2384L20.7417 22.1196Z"
          stroke="#FDBA74"
          stroke-width="2"
        />
      </svg>
    `
    },
    {
        name: 'Automations',
        description: 'Create your own targeted content',
        href: '##',
        icon: `
      <svg
        width="48"
        height="48"
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect width="48" height="48" rx="8" fill="#FFEDD5" />
        <path
          d="M28.0413 20L23.9998 13L19.9585 20M32.0828 27.0001L36.1242 34H28.0415M19.9585 34H11.8755L15.9171 27"
          stroke="#FB923C"
          stroke-width="2"
        />
        <path
          fill-rule="evenodd"
          clip-rule="evenodd"
          d="M18.804 30H29.1963L24.0001 21L18.804 30Z"
          stroke="#FDBA74"
          stroke-width="2"
        />
      </svg>
    `
    },
    {
        name: 'Reports',
        description: 'Keep track of your growth',
        href: '##',
        icon: `
      <svg
        width="48"
        height="48"
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect width="48" height="48" rx="8" fill="#FFEDD5" />
        <rect x="13" y="32" width="2" height="4" fill="#FDBA74" />
        <rect x="17" y="28" width="2" height="8" fill="#FDBA74" />
        <rect x="21" y="24" width="2" height="12" fill="#FDBA74" />
        <rect x="25" y="20" width="2" height="16" fill="#FDBA74" />
        <rect x="29" y="16" width="2" height="20" fill="#FB923C" />
        <rect x="33" y="12" width="2" height="24" fill="#FB923C" />
      </svg>
    `
    }
];
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
        </div>
    </div>
    <div class="fixed bottom-10 w-full max-w-sm left-1/2 -translate-x-1/2">
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
                                                class="input input-bordered w-full max-w-xs"
                                                placeholder="名称"
                                                v-model="name"
                                            />
                                        </th>
                                    </tr>
                                    <tr>
                                        <th>名称英文</th>
                                        <th>
                                            <input
                                                class="input input-bordered w-full max-w-xs"
                                                placeholder="Name"
                                                v-model="nameEn"
                                            />
                                        </th>
                                    </tr>
                                    <tr>
                                        <th>乐队名称</th>
                                        <th>
                                            <input
                                                class="input input-bordered w-full max-w-xs"
                                                placeholder="Morfonica"
                                                v-model="bandName"
                                            />
                                        </th>
                                    </tr>
                                    <tr>
                                        <th>生日</th>
                                        <th>
                                            <input
                                                class="input input-bordered w-full max-w-xs"
                                                placeholder="9/15"
                                                v-model="birthday"
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
                                                                type="range"
                                                                min="1"
                                                                max="300"
                                                                class="range"
                                                                v-model="AvatarScaleStr"
                                                            />
                                                        </th>
                                                    </tr>
                                                    <tr>
                                                        <th>x</th>
                                                        <th>
                                                            <input
                                                                type="range"
                                                                min="0"
                                                                :max="AvatarImgObj.width - 360"
                                                                class="range"
                                                                v-model="AvatarImgOffsetStr.x"
                                                            />
                                                        </th>
                                                    </tr>
                                                    <tr>
                                                        <th>y</th>
                                                        <th>
                                                            <input
                                                                type="range"
                                                                min="0"
                                                                :max="AvatarImgObj.height - 550"
                                                                class="range"
                                                                v-model="AvatarImgOffsetStr.y"
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
