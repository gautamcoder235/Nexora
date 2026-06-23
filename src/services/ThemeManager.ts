import { AppearanceSettings, ThemeSettings, TypographySettings, WorkspaceAppearanceSettings, TerminalAppearanceSettings, AgentAppearanceSettings, AccessibilitySettings, WorkspaceLayoutSettings, AdvancedAppearanceSettings } from '../types';
import { ThemeDefinition, TerminalThemeDefinition, OLEDTheme, MidnightTheme, SlateTheme, GraphiteTheme, LightTheme } from './ThemeDefinitions';
import { ColorTokens, TypographyTokens } from '../styles/theme-tokens';

export function validateTheme(theme: ThemeDefinition): { valid: boolean; warnings: string[]; errors: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  if (!theme) {
    return { valid: false, errors: ["Theme definition is completely null or undefined."], warnings: [] };
  }

  if (!theme.id) errors.push("Theme ID is missing.");
  if (!theme.name) errors.push("Theme Name is missing.");
  
  // 1. Missing Token Groups check
  if (!theme.tokens) {
    errors.push("Theme tokens object is missing.");
    return { valid: false, errors, warnings };
  }

  const groups = ['colors', 'typography', 'spacing', 'radius', 'shadows', 'motion', 'zIndex', 'layout'];
  for (const group of groups) {
    if (!theme.tokens[group as keyof typeof theme.tokens]) {
      errors.push(`Token group '${group}' is missing.`);
    }
  }

  // If critical groups are missing, return early
  if (errors.length > 0) {
    return { valid: false, errors, warnings };
  }

  // 2. Critical Tokens checking
  const requiredColors = [
    'background', 'foreground', 'cardBackground', 'border', 
    'primary', 'secondary', 'accent', 'muted', 'mutedForeground'
  ];
  for (const col of requiredColors) {
    if (!theme.tokens.colors[col as keyof ColorTokens]) {
      errors.push(`Critical color token '${col}' is missing.`);
    }
  }

  const requiredTypography = ['fontSans', 'fontMono', 'fontSizeBase', 'fontWeightNormal', 'lineHeightBase'];
  for (const typ of requiredTypography) {
    if (!theme.tokens.typography[typ as keyof TypographyTokens]) {
      errors.push(`Critical typography token '${typ}' is missing.`);
    }
  }

  // Check semantic status colors mapping
  const semanticColors = ['agentStatusIdle', 'agentStatusWorking', 'agentStatusPaused', 'agentStatusError', 'agentStatusSuccess'];
  for (const sem of semanticColors) {
    const val = theme.tokens.colors[sem as keyof ColorTokens];
    if (!val) {
      errors.push(`Semantic status color token '${sem}' is missing.`);
    } else if (typeof val === 'string' && !val.startsWith('#') && !val.startsWith('rgb') && !val.startsWith('hsl')) {
      warnings.push(`Semantic color '${sem}' has an unusual value: '${val}'. Ensure it is a valid CSS color.`);
    }
  }

  // 3. Contrast checking (WCAG AA ratio: 4.5:1, WCAG AAA ratio: 7.0:1)
  const getLuminance = (hex: string): number => {
    const clean = hex.replace("#", "");
    if (clean.length !== 6) return 0.5;
    const r = parseInt(clean.substring(0, 2), 16) / 255;
    const g = parseInt(clean.substring(2, 4), 16) / 255;
    const b = parseInt(clean.substring(4, 6), 16) / 255;
    const a = [r, g, b].map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
    return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
  };

  const bgHex = theme.tokens.colors.background;
  const fgHex = theme.tokens.colors.foreground;

  if (bgHex && fgHex && bgHex.startsWith('#') && fgHex.startsWith('#')) {
    try {
      const bgLum = getLuminance(bgHex);
      const fgLum = getLuminance(fgHex);
      const ratio = (Math.max(bgLum, fgLum) + 0.05) / (Math.min(bgLum, fgLum) + 0.05);
      if (ratio < 4.5) {
        errors.push(`Insufficient contrast ratio (${ratio.toFixed(2)}:1) between theme background (${bgHex}) and foreground (${fgHex}). WCAG AA requires at least 4.5:1.`);
      } else if (ratio < 7.0) {
        warnings.push(`Contrast ratio (${ratio.toFixed(2)}:1) does not meet WCAG AAA high-contrast standards (minimum 7:1).`);
      }
    } catch (e) {
      warnings.push("Failed to calculate contrast luminance.");
    }
  }

  // 4. Validate terminal theme tokens
  if (!theme.terminal) {
    errors.push("Theme terminal configuration is missing.");
  } else {
    const requiredTerminal = ['background', 'foreground', 'cursor', 'black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white'];
    for (const termKey of requiredTerminal) {
      if (!theme.terminal[termKey as keyof TerminalThemeDefinition]) {
        errors.push(`Terminal theme property '${termKey}' is missing.`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

export class ThemeManager {
  private static activeTheme: ThemeDefinition = MidnightTheme;

  public static getTheme(themeName: string): ThemeDefinition {
    const nameLower = (themeName || 'Midnight').toLowerCase();
    if (nameLower.includes('oled')) return OLEDTheme;
    if (nameLower.includes('slate')) return SlateTheme;
    if (nameLower.includes('graphite')) return GraphiteTheme;
    if (nameLower.includes('light')) return LightTheme;
    return MidnightTheme;
  }

  public static getActiveTheme(): ThemeDefinition {
    return this.activeTheme;
  }

  public static getSemanticColor(status: 'idle' | 'working' | 'paused' | 'error' | 'success'): string {
    const theme = this.getActiveTheme();
    const colors = theme.tokens.colors;
    switch (status) {
      case 'idle': return colors.agentStatusIdle;
      case 'working': return colors.agentStatusWorking;
      case 'paused': return colors.agentStatusPaused;
      case 'error': return colors.agentStatusError;
      case 'success': return colors.agentStatusSuccess;
      default: return colors.foreground;
    }
  }

  public static applyAppearance(settings: AppearanceSettings) {
    if (!settings) return;

    // 1. Resolve Theme Definition
    let themeName = settings.theme?.theme || 'Midnight';
    if (settings.theme?.mode === 'system') {
      const isSystemDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      themeName = isSystemDark ? 'Midnight' : 'Light';
    }
    const theme = this.getTheme(themeName);
    this.activeTheme = theme;

    // 2. Apply base theme tokens
    this.applyBaseTheme(theme, settings.theme);

    // 3. Accent color layer
    this.applyAccent(settings.theme?.accentColor || 'blue', settings.theme?.customAccentColor);

    // 4. Density layer
    this.applyDensity(settings.theme?.density || 'comfortable');

    // 5. Typography layer
    this.applyTypography(settings.typography);

    // 6. Accessibility & Motion layer
    this.applyAccessibilityAndMotion(settings.accessibility, settings.theme?.animationLevel || 'normal', settings.theme?.cornerRadius || 'medium');

    // 7. Layout layer
    this.applyLayout(settings.layout);

    // 8. Custom css injection
    this.applyAdvancedOverrides(settings.advanced);
  }

  private static applyBaseTheme(theme: ThemeDefinition, themeSettings?: ThemeSettings) {
    const root = document.documentElement;
    const colors = theme.tokens.colors;

    // Set custom backgrounds and text variables
    root.style.setProperty('--bg-primary', colors.background);
    root.style.setProperty('--bg-secondary', colors.cardBackground);
    
    // Create tertiary color slightly offset from primary background
    const bgTertiary = theme.isDark ? '#040406' : '#e2e8f0';
    root.style.setProperty('--bg-tertiary', bgTertiary);

    // Calculate transparency overlay
    const transparency = themeSettings ? themeSettings.transparency : 90;
    const alpha = transparency / 100;
    const blurSetting = themeSettings ? themeSettings.backgroundBlur : 'medium';
    let blurPx = '16px';
    if (blurSetting === 'low') blurPx = '8px';
    else if (blurSetting === 'high') blurPx = '28px';

    const bgHex = colors.background;
    const cleanHex = bgHex.replace('#', '');
    const r = parseInt(cleanHex.substring(0, 2), 16) || 0;
    const g = parseInt(cleanHex.substring(2, 4), 16) || 0;
    const b = parseInt(cleanHex.substring(4, 6), 16) || 0;

    root.style.setProperty('--bg-glass', `rgba(${r}, ${g}, ${b}, ${alpha})`);
    root.style.setProperty('--bg-glass-hover', `rgba(${r + 8}, ${g + 8}, ${b + 8}, ${Math.min(1, alpha + 0.05)})`);
    root.style.setProperty('--bg-glass-light', `rgba(${r + 15}, ${g + 15}, ${b + 15}, 0.5)`);
    root.style.setProperty('--bg-overlay', `rgba(${r}, ${g}, ${b}, 0.85)`);

    root.style.setProperty('--border-glass', colors.borderGlass);
    root.style.setProperty('--border-glass-hover', colors.borderGlassHover);
    root.style.setProperty('--border-glass-active', colors.borderGlassActive);

    root.style.setProperty('--text-primary', colors.foreground);
    root.style.setProperty('--text-secondary', colors.secondary);
    root.style.setProperty('--text-muted', colors.mutedForeground);
    root.style.setProperty('--text-inverse', theme.isDark ? '#050507' : '#ffffff');

    // Semantic Status Colors
    root.style.setProperty('--agent-status-idle', colors.agentStatusIdle);
    root.style.setProperty('--agent-status-working', colors.agentStatusWorking);
    root.style.setProperty('--agent-status-paused', colors.agentStatusPaused);
    root.style.setProperty('--agent-status-error', colors.agentStatusError);
    root.style.setProperty('--agent-status-success', colors.agentStatusSuccess);

    // Blur levels
    root.style.setProperty('--glass-blur', blurPx);
    root.style.setProperty('--glass-blur-lg', `${parseFloat(blurPx) * 1.25}px`);
    root.style.setProperty('--glass-blur-xl', `${parseFloat(blurPx) * 1.5}px`);
    root.style.setProperty('--glass-blur-modal', `${parseFloat(blurPx) * 2}px`);
  }

  private static applyAccent(accentColor: string, customAccentColor?: string) {
    const root = document.documentElement;

    const accentPresets: Record<string, { hex: string; rgb: string; hover: string }> = {
      amber: { hex: '#f59e0b', rgb: '245, 158, 11', hover: '#d97706' },
      blue: { hex: '#3b82f6', rgb: '59, 130, 246', hover: '#2563eb' },
      emerald: { hex: '#10b981', rgb: '16, 185, 129', hover: '#059669' },
      red: { hex: '#ef4444', rgb: '239, 68, 68', hover: '#dc2626' },
      violet: { hex: '#8b5cf6', rgb: '139, 92, 246', hover: '#7c3aed' },
      cyan: { hex: '#06b6d4', rgb: '6, 182, 212', hover: '#0891b2' },
      pink: { hex: '#ec4899', rgb: '236, 72, 153', hover: '#db2777' }
    };

    let targetHex = '#3b82f6';
    let targetRgb = '59, 130, 246';
    let targetHover = '#2563eb';

    if (accentColor === 'custom' && customAccentColor) {
      targetHex = customAccentColor;
      targetRgb = this.hexToRgb(customAccentColor);
      targetHover = customAccentColor; // Simplification
    } else {
      const preset = accentPresets[accentColor] || accentPresets.blue;
      targetHex = preset.hex;
      targetRgb = preset.rgb;
      targetHover = preset.hover;
    }

    root.style.setProperty('--accent-primary', targetHex);
    root.style.setProperty('--accent-primary-rgb', targetRgb);
    root.style.setProperty('--accent-secondary', targetHover);
    root.style.setProperty('--accent-secondary-rgb', this.hexToRgb(targetHover));
  }

  private static applyDensity(density: 'compact' | 'comfortable' | 'spacious') {
    const root = document.documentElement;

    const spacingScales = {
      compact: { s1: '2px', s2: '4px', s3: '8px', s4: '12px', s5: '16px' },
      comfortable: { s1: '4px', s2: '8px', s3: '12px', s4: '16px', s5: '20px' },
      spacious: { s1: '6px', s2: '12px', s3: '18px', s4: '24px', s5: '32px' }
    };

    const scale = spacingScales[density] || spacingScales.comfortable;
    root.style.setProperty('--space-1', scale.s1);
    root.style.setProperty('--space-2', scale.s2);
    root.style.setProperty('--space-3', scale.s3);
    root.style.setProperty('--space-4', scale.s4);
    root.style.setProperty('--space-5', scale.s5);
  }

  private static applyTypography(typography?: TypographySettings) {
    if (!typography) return;
    const root = document.documentElement;

    root.style.setProperty('--font-ui', typography.fontFamily);
    root.style.setProperty('--font-mono', typography.codeFontFamily || typography.fontFamily);
    
    const uiSize = typography.fontSize || 13;
    root.style.setProperty('--font-size-base', `${uiSize}px`);
    root.style.setProperty('--font-size-xs', `${uiSize - 2}px`);
    root.style.setProperty('--font-size-sm', `${uiSize - 1}px`);
    root.style.setProperty('--font-size-md', `${uiSize + 1}px`);
    root.style.setProperty('--font-size-lg', `${uiSize + 3}px`);
    root.style.setProperty('--font-size-xl', `${uiSize + 7}px`);
    root.style.setProperty('--font-size-2xl', `${uiSize + 11}px`);
    
    root.style.setProperty('--font-weight-normal', typography.fontWeight || '400');
    root.style.setProperty('--line-height-normal', String(typography.lineHeight || 1.5));
  }

  private static applyAccessibilityAndMotion(accessibility?: AccessibilitySettings, animLevel?: string, cornerRadius?: string) {
    const root = document.documentElement;

    // Radius Layer
    const radiusMap = {
      sharp: { xs: '0', sm: '0', md: '0', lg: '0', xl: '0' },
      small: { xs: '1px', sm: '2px', md: '3px', lg: '4px', xl: '6px' },
      medium: { xs: '2px', sm: '4px', md: '6px', lg: '8px', xl: '12px' },
      large: { xs: '4px', sm: '8px', md: '12px', lg: '16px', xl: '20px' }
    };

    const activeRadius = radiusMap[cornerRadius as 'sharp' | 'small' | 'medium' | 'large'] || radiusMap.medium;
    root.style.setProperty('--radius-xs', activeRadius.xs);
    root.style.setProperty('--radius-sm', activeRadius.sm);
    root.style.setProperty('--radius-md', activeRadius.md);
    root.style.setProperty('--radius-lg', activeRadius.lg);
    root.style.setProperty('--radius-xl', activeRadius.xl);

    // Transitions and animations
    const isReduced = accessibility?.reducedMotion || animLevel === 'none';
    const activeLevel = isReduced ? 'none' : (animLevel || 'normal');

    const animScales = {
      none: { fast: '0ms', smooth: '0ms', slow: '0ms' },
      reduced: { fast: '75ms', smooth: '150ms', slow: '250ms' },
      normal: { fast: '150ms', smooth: '300ms', slow: '500ms' },
      enhanced: { fast: '250ms', smooth: '500ms', slow: '800ms' }
    };

    const anim = animScales[activeLevel as 'none' | 'reduced' | 'normal' | 'enhanced'] || animScales.normal;
    root.style.setProperty('--transition-fast', anim.fast);
    root.style.setProperty('--transition-smooth', anim.smooth);
    root.style.setProperty('--transition-slow', anim.slow);
    root.style.setProperty('--transition-bounce', anim.smooth); // fallback
  }

  private static applyLayout(layout?: WorkspaceLayoutSettings) {
    if (!layout) return;
    const root = document.documentElement;

    const sidebarWidth = layout.sidebarWidth ? Math.max(220, Math.min(500, layout.sidebarWidth)) : 260;
    const panelHeight = layout.topPanelHeight ? Math.max(180, Math.min(800, layout.topPanelHeight)) : 320;

    root.style.setProperty('--sidebar-width', `${sidebarWidth}px`);
    root.style.setProperty('--panel-height', `${panelHeight}px`);
  }

  private static applyAdvancedOverrides(advanced?: AdvancedAppearanceSettings) {
    // Inject custom CSS styles if any
    const styleId = 'nexora-advanced-css-overrides';
    let styleEl = document.getElementById(styleId) as HTMLStyleElement;
    
    if (advanced?.customCss) {
      if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = styleId;
        document.head.appendChild(styleEl);
      }
      styleEl.textContent = advanced.customCss;
    } else if (styleEl) {
      styleEl.remove();
    }
  }

  private static hexToRgb(hex: string): string {
    const clean = hex.replace('#', '');
    if (clean.length !== 6) return '245, 158, 11';
    const r = parseInt(clean.substring(0, 2), 16) || 0;
    const g = parseInt(clean.substring(2, 4), 16) || 0;
    const b = parseInt(clean.substring(4, 6), 16) || 0;
    return `${r}, ${g}, ${b}`;
  }
}
