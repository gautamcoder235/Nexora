import { StateCreator } from 'zustand';

export interface DialogConfig {
  type: 'alert' | 'confirm' | 'prompt';
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel?: () => void;
  promptDefaultValue?: string;
  promptPlaceholder?: string;
  onConfirmPrompt?: (value: string) => void;
}

export interface UiSlice {
  isSidebarVisible: boolean;
  isTaskCenterVisible: boolean;
  isAgentPanelPinned: boolean;
  isTaskPanelPinned: boolean;
  sidebarWidth: number;
  topPanelHeight: number;
  dialog: DialogConfig | null;

  setSidebarVisible: (visible: boolean) => void;
  setTaskCenterVisible: (visible: boolean) => void;
  setAgentPanelPinned: (pinned: boolean) => void;
  setTaskPanelPinned: (pinned: boolean) => void;
  setSidebarWidth: (width: number) => void;
  setTopPanelHeight: (height: number) => void;

  showAlertDialog: (title: string, message: string) => void;
  showConfirmDialog: (title: string, message: string, onConfirm: () => void, onCancel?: () => void) => void;
  showPromptDialog: (
    title: string,
    message: string,
    onConfirmPrompt: (value: string) => void,
    onCancel?: () => void,
    defaultValue?: string,
    placeholder?: string
  ) => void;
  closeDialog: () => void;
}

export const createUiSlice: StateCreator<any, [], [], UiSlice> = (set, get) => ({
  isSidebarVisible: false,
  isTaskCenterVisible: false,
  isAgentPanelPinned: false,
  isTaskPanelPinned: false,
  sidebarWidth: 490,
  topPanelHeight: 320,
  dialog: null,

  setSidebarVisible: (visible) => {
    set({ isSidebarVisible: visible });
    if (typeof get().saveSnapshot === 'function') get().saveSnapshot();
  },
  setTaskCenterVisible: (visible) => {
    set({ isTaskCenterVisible: visible });
    if (typeof get().saveSnapshot === 'function') get().saveSnapshot();
  },
  setAgentPanelPinned: (pinned) => {
    set({ isAgentPanelPinned: pinned });
    if (typeof get().saveSnapshot === 'function') get().saveSnapshot();
  },
  setTaskPanelPinned: (pinned) => {
    set({ isTaskPanelPinned: pinned });
    if (typeof get().saveSnapshot === 'function') get().saveSnapshot();
  },
  setSidebarWidth: (width) => set({ sidebarWidth: width }),
  setTopPanelHeight: (height) => set({ topPanelHeight: height }),

  showAlertDialog: (title, message) => {
    set({
      dialog: {
        type: 'alert',
        title,
        message,
        onConfirm: () => get().closeDialog(),
      }
    });
  },

  showConfirmDialog: (title, message, onConfirm, onCancel) => {
    set({
      dialog: {
        type: 'confirm',
        title,
        message,
        onConfirm: () => {
          onConfirm();
          get().closeDialog();
        },
        onCancel: () => {
          if (onCancel) onCancel();
          get().closeDialog();
        }
      }
    });
  },

  showPromptDialog: (title, message, onConfirmPrompt, onCancel, defaultValue = '', placeholder = '') => {
    set({
      dialog: {
        type: 'prompt',
        title,
        message,
        promptDefaultValue: defaultValue,
        promptPlaceholder: placeholder,
        onConfirmPrompt: (value: string) => {
          onConfirmPrompt(value);
          get().closeDialog();
        },
        onCancel: () => {
          if (onCancel) onCancel();
          get().closeDialog();
        },
        onConfirm: () => {}
      }
    });
  },

  closeDialog: () => set({ dialog: null }),
});
