// Banana-leaf brand, taken from the Anndaan screen designs.
export const C = {
  tur: '#FFC20E', // turmeric
  leaf: '#0B4D2C',
  chilli: '#E0301E',
  rice: '#FFFBF0',
  ink: '#1D2B22',
  mut: '#5A665D',
  line: '#E8DFC4',
  tint: '#FFF3C9',
  leafTint: '#E6EFE8',
  white: '#FFFFFF',
  paleYellow: '#FFE9A6',
  amberText: '#6B4A00',
  reservedBg: '#F1EEE6',
  reservedText: '#8A8D86',
  reservedTag: '#3A3A36',
  barTrack: '#EFE6CC',
  veg: '#1E8E3E',
  nonveg: '#8B3A1A',
  danger: '#B3261E',
} as const;

// Android ignores fontWeight for custom fonts, so each weight is its own family.
export const F = {
  body: 'Mukta_400Regular',
  medium: 'Mukta_500Medium',
  semi: 'Mukta_600SemiBold',
  bold: 'Mukta_700Bold',
  display: 'Eczar_700Bold',
  displaySemi: 'Eczar_600SemiBold',
} as const;

export const R = { sm: 12, md: 14, lg: 16, xl: 18, xxl: 20, pill: 999 } as const;
