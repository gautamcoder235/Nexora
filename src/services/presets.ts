import { AppearanceSettings } from '../types';

export interface AppearancePreset {
  id: string;
  name: string;
  description: string;
  appearance: Partial<AppearanceSettings>;
}

export const NexoraDefaultPreset: AppearancePreset = {
  id: 'nexora-default',
  name: 'Nexora Default',
  description: 'The standard premium blue and pure black look.',
  appearance: {
    theme: {
      theme: 'Midnight',
      accentColor: 'blue',
      mode: 'dark',
      density: 'comfortable',
      transparency: 90,
      backgroundBlur: 'medium',
      animationLevel: 'normal',
      cornerRadius: 'medium'
    },
    typography: {
      fontFamily: "'Inter', sans-serif",
      fontSize: 13,
      lineHeight: 1.5,
      fontWeight: '400',
      codeFontFamily: "'JetBrains Mono', monospace",
      codeFontSize: 12,
      terminalFontFamily: "'JetBrains Mono', monospace",
      terminalFontSize: 12,
      letterSpacing: '0'
    },
    layout: {
      layoutMode: 'flexible',
      sidebarWidth: 260,
      topPanelHeight: 320,
      bottomPanelHeight: 240,
      showTerminalTitleBar: true
    }
  }
};

export const CursorPreset: AppearancePreset = {
  id: 'cursor',
  name: 'Cursor Inspired',
  description: 'Sleek cyan accents with a subtle midnight hue and compact rounding.',
  appearance: {
    theme: {
      theme: 'Midnight',
      accentColor: 'cyan',
      mode: 'dark',
      density: 'comfortable',
      transparency: 95,
      backgroundBlur: 'medium',
      animationLevel: 'normal',
      cornerRadius: 'small'
    },
    typography: {
      fontFamily: "'Inter', sans-serif",
      fontSize: 13,
      lineHeight: 1.45,
      fontWeight: '400',
      codeFontFamily: "'JetBrains Mono', monospace",
      codeFontSize: 12,
      terminalFontFamily: "'JetBrains Mono', monospace",
      terminalFontSize: 12,
      letterSpacing: '0'
    },
    layout: {
      layoutMode: 'flexible',
      sidebarWidth: 240,
      topPanelHeight: 300,
      bottomPanelHeight: 240,
      showTerminalTitleBar: true
    }
  }
};

export const WarpPreset: AppearancePreset = {
  id: 'warp',
  name: 'Warp Inspired',
  description: 'High-contrast graphite theme with larger rounding and smooth transitions.',
  appearance: {
    theme: {
      theme: 'Graphite',
      accentColor: 'blue',
      mode: 'dark',
      density: 'comfortable',
      transparency: 85,
      backgroundBlur: 'high',
      animationLevel: 'enhanced',
      cornerRadius: 'large'
    },
    typography: {
      fontFamily: "'Geist', sans-serif",
      fontSize: 14,
      lineHeight: 1.5,
      fontWeight: '400',
      codeFontFamily: "'Geist Mono', monospace",
      codeFontSize: 13,
      terminalFontFamily: "'Geist Mono', monospace",
      terminalFontSize: 13,
      letterSpacing: '0.01em'
    },
    layout: {
      layoutMode: 'flexible',
      sidebarWidth: 280,
      topPanelHeight: 350,
      bottomPanelHeight: 260,
      showTerminalTitleBar: true
    }
  }
};

export const VSCodePreset: AppearancePreset = {
  id: 'vscode',
  name: 'VS Code Dark+',
  description: 'Opaque pure dark backdrop with sharp corners and clean coding details.',
  appearance: {
    theme: {
      theme: 'OLED',
      accentColor: 'blue',
      mode: 'dark',
      density: 'compact',
      transparency: 100,
      backgroundBlur: 'low',
      animationLevel: 'reduced',
      cornerRadius: 'sharp'
    },
    typography: {
      fontFamily: "system-ui, sans-serif",
      fontSize: 12,
      lineHeight: 1.4,
      fontWeight: '400',
      codeFontFamily: "'Fira Code', monospace",
      codeFontSize: 12,
      terminalFontFamily: "'Fira Code', monospace",
      terminalFontSize: 12,
      letterSpacing: '0'
    },
    layout: {
      layoutMode: 'flexible',
      sidebarWidth: 220,
      topPanelHeight: 280,
      bottomPanelHeight: 220,
      showTerminalTitleBar: true
    }
  }
};

export const LinearPreset: AppearancePreset = {
  id: 'linear',
  name: 'Linear Dark',
  description: 'Premium slate backgrounds, purple accents, and spacious list layout.',
  appearance: {
    theme: {
      theme: 'Slate',
      accentColor: 'violet',
      mode: 'dark',
      density: 'spacious',
      transparency: 90,
      backgroundBlur: 'medium',
      animationLevel: 'normal',
      cornerRadius: 'medium'
    },
    typography: {
      fontFamily: "'Inter', sans-serif",
      fontSize: 13,
      lineHeight: 1.6,
      fontWeight: '400',
      codeFontFamily: "'JetBrains Mono', monospace",
      codeFontSize: 13,
      terminalFontFamily: "'JetBrains Mono', monospace",
      terminalFontSize: 13,
      letterSpacing: '0'
    },
    layout: {
      layoutMode: 'flexible',
      sidebarWidth: 260,
      topPanelHeight: 320,
      bottomPanelHeight: 240,
      showTerminalTitleBar: true
    }
  }
};

export const APPEARANCE_PRESETS: AppearancePreset[] = [
  NexoraDefaultPreset,
  CursorPreset,
  WarpPreset,
  VSCodePreset,
  LinearPreset
];

// Preset registry lookup map
export const presetRegistry: Record<string, AppearancePreset> = {
  'nexora-default': NexoraDefaultPreset,
  'cursor': CursorPreset,
  'warp': WarpPreset,
  'vscode': VSCodePreset,
  'linear': LinearPreset
};

export const getPreset = (id: string): AppearancePreset => {
  return presetRegistry[id] || NexoraDefaultPreset;
};
