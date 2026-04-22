import { Platform, StyleSheet } from 'react-native';

export const portalStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  contentContainer: {
    flexGrow: 1,
  },

  // Navigation
  navigation: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    ...Platform.select({
      web: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 3,
      },
      default: {
        elevation: 2,
      },
    }),
  },
  navContent: {
    maxWidth: Platform.OS === 'web' ? 1280 : ('100%' as any),
    marginHorizontal: 'auto' as any,
    paddingHorizontal: 24,
    paddingVertical: 16,
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
  },
  navContentMobile: {
    justifyContent: 'center' as const,
  },
  logoContainer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
  },
  navLogo: {
    width: 520,
    height: 140,
  },
  navLogoMobile: {
    width: 440,
    height: 120,
  },
  navLinks: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 24,
  },
  navLink: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  navLinkText: {
    fontSize: 14,
    fontWeight: '500' as const,
    color: '#6b7280',
  },

  // Footer
  footer: {
    backgroundColor: '#111827',
    paddingVertical: 48,
  },
  footerContent: {
    maxWidth: Platform.OS === 'web' ? 1280 : ('100%' as any),
    marginHorizontal: 'auto' as any,
    paddingHorizontal: 24,
    flexDirection: Platform.OS === 'web' ? ('row' as const) : ('column' as const),
    gap: 32,
  },
  footerSection: {
    flex: 1,
    alignItems: 'center' as const,
  },
  footerLogo: {
    width: 360,
    height: 112,
    marginBottom: 16,
  },
  footerLogoMobile: {
    width: 288,
    height: 96,
  },
  footerLinks: {
    flexDirection: 'row' as const,
    gap: 48,
  },
  footerColumn: {
    gap: 8,
  },
  footerColumnTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600' as const,
    marginBottom: 8,
  },
  footerLink: {
    color: '#9ca3af',
    fontSize: 14,
    paddingVertical: 4,
  },
  footerBottom: {
    maxWidth: Platform.OS === 'web' ? 1280 : ('100%' as any),
    marginHorizontal: 'auto' as any,
    paddingHorizontal: 24,
    marginTop: 32,
    paddingTop: 32,
    borderTopWidth: 1,
    borderTopColor: '#374151',
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
  },
  copyright: {
    color: '#9ca3af',
    fontSize: 14,
  },

  // Error
  errorTextLarge: {
    fontSize: 18,
    color: '#f44336',
    textAlign: 'center' as const,
    marginTop: 48,
  },
});
