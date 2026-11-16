// Final user-approved ivory palette; Stitch supplies layout/accessibility guidance.
// Screen examples are layout references only, never a source of health readings.
export const designTokens = {
  colors: {
    primary: '#205C73', primaryContainer: '#24667E', secondary: '#25816A',
    secondaryContainer: '#DCEAE3', surface: '#F3F0E7', surfaceLow: '#ECEDE5',
    onSecondaryContainer: '#1F6957',
    surfaceContainer: '#E1EAE9', surfaceHigh: '#DCEAE3', outline: '#C7D1C9',
    onSurface: '#28433F', onSurfaceVariant: '#4C605A', inverseSurface: '#203E4C',
    inverseOnSurface: '#FFFCF6', white: '#FFFCF6', lavender: '#E5EDE6',
    error: '#BA1A1A', errorContainer: '#FFDAD6',
  },
  typography: { heading: 26, headingLine: 38, section: 20, sectionLine: 30, body: 17, bodyLine: 28, label: 17, caption: 14 },
  spacing: { gutter: 16, card: 20, section: 24, small: 12 },
  radius: { inner: 8, card: 16, dialog: 24, pill: 9999 },
  touch: 56,
} as const;
