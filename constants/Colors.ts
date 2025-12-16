/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

const tintColorLight = '#0a7ea4';
const tintColorDark = '#fff';

export const Colors = {
  light: {
    text: '#11181C',
    background: '#fff',
    tint: tintColorLight,
    icon: '#687076',
    tabIconDefault: '#687076',
    tabIconSelected: tintColorLight,
    // Card and surface colors
    card: '#f9f9f9',
    cardBorder: '#e0e0e0',
    // Secondary/muted text
    secondaryText: '#666666',
    tertiaryText: '#999999',
    // Input fields
    inputBackground: '#f5f5f5',
    inputBorder: '#cccccc',
    inputText: '#333333',
    // Section cards
    sectionCard: '#ffffff',
    sectionCardHeader: '#f8faff',
    sectionCardBorder: '#eeeeee',
    // History items (jobs/payments)
    jobItemBackground: '#eef5ff',
    jobItemBorder: '#cce0ff',
    paymentItemBackground: '#e8fff4',
    paymentItemBorder: '#b8eed7',
    // Modal
    modalBackground: '#ffffff',
    modalOverlay: 'rgba(0,0,0,0.4)',
    // Dividers
    divider: '#e0e0e0',
    // Notes
    notesBackground: '#e8f4fd',
    // Button backgrounds
    buttonSecondary: '#f8f9fa',
    // Additional service panel
    panelBackground: '#f8f9fa',
  },
  dark: {
    text: '#ECEDEE',
    background: '#151718',
    tint: tintColorDark,
    icon: '#9BA1A6',
    tabIconDefault: '#9BA1A6',
    tabIconSelected: tintColorDark,
    // Card and surface colors
    card: '#1e2022',
    cardBorder: '#3a3f42',
    // Secondary/muted text
    secondaryText: '#a0a5a8',
    tertiaryText: '#787d80',
    // Input fields
    inputBackground: '#252829',
    inputBorder: '#444849',
    inputText: '#e0e0e0',
    // Section cards
    sectionCard: '#1e2022',
    sectionCardHeader: '#252a2d',
    sectionCardBorder: '#333738',
    // History items (jobs/payments)
    jobItemBackground: '#1a2533',
    jobItemBorder: '#2a3d52',
    paymentItemBackground: '#1a2b22',
    paymentItemBorder: '#2a4a38',
    // Modal
    modalBackground: '#1e2022',
    modalOverlay: 'rgba(0,0,0,0.6)',
    // Dividers
    divider: '#333738',
    // Notes
    notesBackground: '#1a2533',
    // Button backgrounds
    buttonSecondary: '#252829',
    // Additional service panel
    panelBackground: '#252829',
  },
};
