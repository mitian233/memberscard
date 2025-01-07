<script setup lang="ts">
import { ref, reactive, onMounted, computed, onBeforeUnmount } from 'vue';
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
    const width =
        document.getElementsByClassName('mcard')[0].clientWidth - 40 < stageSize.width
            ? document.getElementsByClassName('mcard')[0].clientWidth - 40
            : stageSize.width;
    const scaleX = width / stageSize.width > 1 ? 1 : width / stageSize.width;
    stageConfig.scaleX = scaleX;
    stageConfig.scaleY = scaleX;
    stageConfig.width = stageSize.width * stageConfig.scaleX;
    stageConfig.height = stageSize.height * stageConfig.scaleY;
};

onMounted(() => {
    const img = new Image();
    img.src = '/demo.png';
    img.onload = () => {
        AvatarImgObj.value = img;
    };
    window.addEventListener('resize', handleResize);
    handleResize();
});

onBeforeUnmount(() => {
    window.removeEventListener('resize', handleResize);
});
</script>

<template>
    <div class="container mx-auto">
        <div class="w-full overflow-hidden">
            <div
                class="mcard w-full h-full max-w-[1000px] max-h-[680px] overflow-hidden bg-black p-5"
            >
                <v-stage :config="stageConfig">
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
                        >
                        </v-text>
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
</template>

<style scoped>
table[class^='table-'] {
    margin-left: 50px;
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
