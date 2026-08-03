// popup.js
import { createApp, h } from "vue";
import PopupComponent from "./src/adapters/popup/Popup.vue";
import { PopupController } from "./src/adapters/popup/PopupController.js";

const bootApplicationLayer = () => {
  const controller = new PopupController();

  // Render the SFC directly to satisfy Manifest V3 AOT requirements
  const vueApp = createApp({
    render() {
      return h(PopupComponent, { controller });
    }
  });

  vueApp.mount("#app");
};

document.addEventListener("DOMContentLoaded", bootApplicationLayer);