import React from 'react';
import { ActivityIndicator, Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useBusinessPortal } from '../../hooks/useBusinessPortal';
import { portalStyles } from '../../styles/portalStyles';

export default function BusinessLandingScreen() {
  const { businessUser, loading, businessName, isNarrowWeb, handleNavigation, router } = useBusinessPortal();

  if (loading) {
    return (
      <View style={portalStyles.container}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!businessUser) {
    return (
      <View style={portalStyles.container}>
        <Text style={portalStyles.errorTextLarge}>Business not found</Text>
      </View>
    );
  }

  const navigateToLogin = () => {
    if (Platform.OS === 'web') {
      window.location.href = `/${businessName}/login`;
    } else {
      router.push(`/${businessName}/login` as any);
    }
  };

  const navigateToQuote = () => {
    if (Platform.OS === 'web') {
      window.location.href = `/${businessName}/quote`;
    } else {
      router.push(`/${businessName}/quote` as any);
    }
  };

  return (
    <ScrollView style={portalStyles.container} contentContainerStyle={portalStyles.contentContainer}>
      {/* Navigation Header */}
      <View style={portalStyles.navigation}>
        <View style={[portalStyles.navContent, isNarrowWeb && portalStyles.navContentMobile]}>
          <Pressable onPress={() => handleNavigation('/home')} style={portalStyles.logoContainer}>
            <Image
              source={require('../../assets/images/logo_transparent.png')}
              style={[portalStyles.navLogo, isNarrowWeb && portalStyles.navLogoMobile]}
              resizeMode="contain"
            />
          </Pressable>
          {Platform.OS === 'web' && !isNarrowWeb && (
            <View style={portalStyles.navLinks}>
              <Pressable onPress={() => handleNavigation('/home')} style={portalStyles.navLink}>
                <Text style={portalStyles.navLinkText}>Home</Text>
              </Pressable>
              <Pressable onPress={() => handleNavigation('/pricing')} style={portalStyles.navLink}>
                <Text style={portalStyles.navLinkText}>Pricing</Text>
              </Pressable>
              <Pressable onPress={() => handleNavigation('/about')} style={portalStyles.navLink}>
                <Text style={portalStyles.navLinkText}>About</Text>
              </Pressable>
              <Pressable onPress={() => handleNavigation('/contact')} style={portalStyles.navLink}>
                <Text style={portalStyles.navLinkText}>Contact</Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>

      {/* Main Content */}
      <View style={styles.mainContent}>
        <View style={styles.heroSection}>
          <Text style={[styles.heroTitle, isNarrowWeb && styles.heroTitleMobile]}>
            {businessUser.businessName}
          </Text>
          <Text style={[styles.heroSubtitle, isNarrowWeb && styles.heroSubtitleMobile]}>
            Welcome to our client portal
          </Text>
        </View>

        <View style={styles.buttonsContainer}>
          <Pressable
            style={({ pressed }) => [styles.portalButton, styles.loginButton, pressed && styles.buttonPressed]}
            onPress={navigateToLogin}
          >
            <Text style={styles.buttonIcon}>👤</Text>
            <Text style={styles.buttonTitle}>Existing Customer</Text>
            <Text style={styles.buttonSubtitle}>Sign in to view your account</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.portalButton, styles.quoteButton, pressed && styles.buttonPressed]}
            onPress={navigateToQuote}
          >
            <Text style={styles.buttonIcon}>📋</Text>
            <Text style={[styles.buttonTitle, styles.quoteButtonTitle]}>Get a Quote</Text>
            <Text style={[styles.buttonSubtitle, styles.quoteButtonSubtitle]}>New customer? Request a free quote</Text>
          </Pressable>
        </View>
      </View>

      {/* Footer */}
      <View style={portalStyles.footer}>
        <View style={portalStyles.footerContent}>
          <View style={portalStyles.footerSection}>
            <Image
              source={require('../../assets/images/logo_colourInverted.png')}
              style={[portalStyles.footerLogo, isNarrowWeb && portalStyles.footerLogoMobile]}
              resizeMode="contain"
            />
          </View>
          <View style={portalStyles.footerLinks}>
            <View style={portalStyles.footerColumn}>
              <Text style={portalStyles.footerColumnTitle}>Company</Text>
              <Pressable onPress={() => handleNavigation('/about')}>
                <Text style={portalStyles.footerLink}>About</Text>
              </Pressable>
              <Pressable onPress={() => handleNavigation('/contact')}>
                <Text style={portalStyles.footerLink}>Contact</Text>
              </Pressable>
            </View>
          </View>
        </View>
        <View style={portalStyles.footerBottom}>
          <Text style={portalStyles.copyright}>© 2025 Guvnor. All rights reserved.</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  mainContent: {
    flex: 1,
    maxWidth: Platform.OS === 'web' ? 800 : ('100%' as any),
    marginHorizontal: 'auto' as any,
    paddingHorizontal: 24,
    paddingBottom: 48,
  },
  heroSection: {
    paddingVertical: 48,
    alignItems: 'center',
  },
  heroTitle: {
    fontSize: Platform.OS === 'web' ? 48 : 32,
    fontWeight: 'bold',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 16,
  },
  heroTitleMobile: {
    fontSize: 28,
    marginBottom: 12,
  },
  heroSubtitle: {
    fontSize: 20,
    color: '#6b7280',
    textAlign: 'center',
    maxWidth: 600,
    lineHeight: 28,
  },
  heroSubtitleMobile: {
    fontSize: 16,
    lineHeight: 22,
  },
  buttonsContainer: {
    gap: 20,
    maxWidth: 440,
    width: '100%',
    marginHorizontal: 'auto' as any,
  },
  portalButton: {
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    ...Platform.select({
      web: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.1,
        shadowRadius: 25,
        cursor: 'pointer',
      },
      default: {
        elevation: 8,
      },
    }),
  },
  loginButton: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#4f46e5',
  },
  quoteButton: {
    backgroundColor: '#10b981',
    borderWidth: 2,
    borderColor: '#10b981',
  },
  buttonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  buttonIcon: {
    fontSize: 36,
    marginBottom: 12,
  },
  buttonTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#4f46e5',
    marginBottom: 6,
  },
  quoteButtonTitle: {
    color: '#fff',
  },
  buttonSubtitle: {
    fontSize: 15,
    color: '#6b7280',
  },
  quoteButtonSubtitle: {
    color: 'rgba(255,255,255,0.85)',
  },
});
