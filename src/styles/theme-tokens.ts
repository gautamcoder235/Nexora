export interface ColorTokens {
  background: string;
  foreground: string;
  cardBackground: string;
  border: string;
  borderGlass: string;
  borderGlassHover: string;
  borderGlassActive: string;
  bgGlass: string;
  bgGlassHover: string;
  bgGlassLight: string;
  bgOverlay: string;
  
  primary: string;
  primaryHover: string;
  primaryRgb: string;
  
  secondary: string;
  secondaryHover: string;
  secondaryRgb: string;
  
  accent: string;
  accentHover: string;
  accentRgb: string;
  
  muted: string;
  mutedForeground: string;

  // Semantic Status Tokens
  agentStatusIdle: string;
  agentStatusWorking: string;
  agentStatusPaused: string;
  agentStatusError: string;
  agentStatusSuccess: string;
  
  // Terminal palette
  terminalBackground: string;
  terminalForeground: string;
  terminalCursor: string;
  terminalBlack: string;
  terminalRed: string;
  terminalGreen: string;
  terminalYellow: string;
  terminalBlue: string;
  terminalMagenta: string;
  terminalCyan: string;
  terminalWhite: string;
  terminalBrightBlack: string;
  terminalBrightRed: string;
  terminalBrightGreen: string;
  terminalBrightYellow: string;
  terminalBrightBlue: string;
  terminalBrightMagenta: string;
  terminalBrightCyan: string;
  terminalBrightWhite: string;
}

export interface TypographyTokens {
  fontSans: string;
  fontMono: string;
  
  fontSizeXs: string;
  fontSizeSm: string;
  fontSizeBase: string;
  fontSizeLg: string;
  fontSizeXl: string;
  fontSize2xl: string;
  fontSize3xl: string;
  
  fontWeightLight: string;
  fontWeightNormal: string;
  fontWeightMedium: string;
  fontWeightSemibold: string;
  fontWeightBold: string;
  
  lineHeightTight: string;
  lineHeightBase: string;
  lineHeightRelaxed: string;
  
  letterSpacingTight: string;
  letterSpacingNormal: string;
  letterSpacingWide: string;
}

export interface SpacingTokens {
  space0: string;
  spacePx: string;
  space0_5: string;
  space1: string;
  space1_5: string;
  space2: string;
  space3: string;
  space4: string;
  space5: string;
  space6: string;
  space7: string;
  space8: string;
  space9: string;
  space10: string;
  space11: string;
  space12: string;
}

export interface RadiusTokens {
  none: string;
  xs: string;
  sm: string;
  md: string;
  lg: string;
  xl: string;
  full: string;
}

export interface ShadowTokens {
  none: string;
  sm: string;
  md: string;
  lg: string;
  elevated: string;
  glow: string;
  glowLg: string;
  glowSuccess: string;
  glowError: string;
  glowWarning: string;
  insetHighlight: string;
}

export interface MotionTokens {
  durationFast: string;
  durationNormal: string;
  durationSlow: string;
  durationBounce: string;
  easeIn: string;
  easeOut: string;
  easeInOut: string;
}

export interface ZIndexTokens {
  below: number;
  base: number;
  dropdown: number;
  sticky: number;
  overlay: number;
  modal: number;
  popover: number;
  tooltip: number;
  toast: number;
}

export interface LayoutTokens {
  sidebarWidth: string;
  sidebarCollapsedWidth: string;
  topbarHeight: string;
  bottombarHeight: string;
  panelSpacing: string;
}

export interface ThemeTokens {
  colors: ColorTokens;
  typography: TypographyTokens;
  spacing: SpacingTokens;
  radius: RadiusTokens;
  shadows: ShadowTokens;
  motion: MotionTokens;
  zIndex: ZIndexTokens;
  layout: LayoutTokens;
}
