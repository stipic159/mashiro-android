import { defineStore } from "pinia";

export const usePanelsStore = defineStore("panels", {
  state: () => ({
    queueOpen: false,
    hidden: false,
  }),

  actions: {
    toggleQueue() {
      this.queueOpen = !this.queueOpen;
    },

    openQueue() {
      this.queueOpen = true;
    },

    closeQueue() {
      this.queueOpen = false;
    },
  },
});
