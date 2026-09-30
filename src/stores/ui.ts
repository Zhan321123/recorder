import { create } from "zustand";

export type TabKey = "bill" | "work" | "schedule" | "settings";

interface UiState {
  tab: TabKey;
  setTab: (tab: TabKey) => void;
}

export const useUiStore = create<UiState>((set) => ({
  tab: "bill",
  setTab: (tab) => set({ tab }),
}));
