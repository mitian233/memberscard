import "./assets/main.css";

import { createApp } from "vue";
import App from "./App.vue";
import router from "./router";
import VueKonva from "vue-konva";

const app = createApp(App);

app.use(router).use(VueKonva).mount("#app");
