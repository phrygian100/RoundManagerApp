import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import PermissionGate from '../components/PermissionGate';

// Invoice Component
const InvoicePreview = () => {
  // Placeholder data - will be populated from user settings/context later
  const businessName = 'TGM';
  const businessNameLine2 = 'Window Cleaning';
  const tagline = 'Local. Reliable. Professional.';
  const phoneNumber = '07814 804 759';
  const facebookHandle = 'tgmwindowcleaningUK';
  const website = 'www.tgmwindowcleaning.co.uk';
  const bankAccountName = 'TGM Window Cleaning';
  const sortCode = '30-98-97';
  const accountNo = '36215362';
  const paymentReference = 'RWC';
  const directDebitUrl = 'www.tgmwindowcleaning.co.uk/gocardless';
  const businessAddress = {
    line1: 'TGM Window Cleaning',
    line2: '16 Church Street',
    postcode: 'LN4 4HN',
  };
  
  const services = [
    'Exterior window cleaning',
    'Gutter cleaning',
    'Soffits and Facias',
    'Conservatory roof clean',
    'Solar panels',
    'UPVc Restoration',
    'Caravan softwash',
    '',
    '',
  ];

  return (
    <View style={invoiceStyles.invoiceContainer}>
      {/* Two Column Layout */}
      <View style={invoiceStyles.columns}>
        {/* Left Column */}
        <View style={invoiceStyles.leftColumn}>
          {/* Services Provided Header */}
          <View style={invoiceStyles.servicesHeader}>
            <Text style={invoiceStyles.servicesHeaderText}>Services provided on: </Text>
            <Ionicons name="checkmark-circle" size={16} color="#2E86AB" />
            <Text style={invoiceStyles.dateSlash}>    /    /    </Text>
          </View>

          {/* Logo and Branding */}
          <View style={invoiceStyles.brandingSection}>
            {/* Logo Circle */}
            <View style={invoiceStyles.logoCircle}>
              <Ionicons name="home" size={40} color="#fff" />
            </View>
            
            <Text style={invoiceStyles.businessName}>{businessName}</Text>
            <Text style={invoiceStyles.businessNameBlue}>{businessNameLine2}</Text>
            <Text style={invoiceStyles.tagline}>{tagline}</Text>
            <Text style={invoiceStyles.phoneNumber}>{phoneNumber}</Text>
            
            <View style={invoiceStyles.socialRow}>
              <Text style={invoiceStyles.socialText}>f/{facebookHandle}</Text>
            </View>
            <Text style={invoiceStyles.websiteText}>{website}</Text>
          </View>

          {/* Direct Debit Box */}
          <View style={invoiceStyles.blueBox}>
            <Text style={invoiceStyles.boxTitle}>Direct Debit</Text>
            <Text style={invoiceStyles.boxText}>With your card details at hand go to:</Text>
            <Text style={invoiceStyles.linkText}>{directDebitUrl}</Text>
          </View>

          {/* Cash Box */}
          <View style={invoiceStyles.blueBox}>
            <Text style={invoiceStyles.boxTitle}>Cash</Text>
            <Text style={invoiceStyles.boxText}>
              Let us know to knock on your door or look somewhere for an envelope.
            </Text>
          </View>

          {/* Business Address */}
          <View style={invoiceStyles.addressSection}>
            <Text style={invoiceStyles.addressText}>{businessAddress.line1}</Text>
            <Text style={invoiceStyles.addressText}>{businessAddress.line2}</Text>
            <Text style={invoiceStyles.addressText}>{businessAddress.postcode}</Text>
          </View>
        </View>

        {/* Right Column */}
        <View style={invoiceStyles.rightColumn}>
          {/* Bank Transfer Box */}
          <View style={invoiceStyles.blueBox}>
            <Text style={invoiceStyles.boxTitle}>Bank Transfer</Text>
            <Text style={invoiceStyles.bankLabel}>Business Account Name:</Text>
            <Text style={invoiceStyles.bankValueBlue}>{bankAccountName}</Text>
            
            <View style={invoiceStyles.bankRow}>
              <Text style={invoiceStyles.bankLabel}>Sort Code:</Text>
              <Text style={invoiceStyles.bankValue}>{sortCode}</Text>
            </View>
            <View style={invoiceStyles.bankRow}>
              <Text style={invoiceStyles.bankLabel}>Account No:</Text>
              <Text style={invoiceStyles.bankValue}>{accountNo}</Text>
            </View>
            
            <Text style={invoiceStyles.bankLabel}>Payment reference:</Text>
            <Text style={invoiceStyles.paymentRef}>{paymentReference}</Text>
          </View>

          {/* Notes Box */}
          <View style={invoiceStyles.blueBox}>
            <Text style={invoiceStyles.boxTitle}>Notes</Text>
            <View style={invoiceStyles.notesArea} />
          </View>

          {/* Work Completed Box */}
          <View style={invoiceStyles.blueBox}>
            <Text style={invoiceStyles.boxTitle}>Work completed</Text>
            
            {/* Service Rows */}
            {services.map((service, index) => (
              <View key={index} style={invoiceStyles.serviceRow}>
                <Text style={invoiceStyles.serviceText}>{service}</Text>
                <Text style={invoiceStyles.priceText}>£</Text>
              </View>
            ))}
            
            {/* Total Row */}
            <View style={invoiceStyles.totalRow}>
              <Text style={invoiceStyles.totalLabel}>Total</Text>
              <Text style={invoiceStyles.totalPrice}>£</Text>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
};

export default function MaterialsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <PermissionGate perm="viewMaterials" fallback={<View style={styles.container}><Text>You don't have permission to view this page.</Text></View>}>
      <SafeAreaView style={[styles.container, { paddingTop: insets.top }]}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => router.replace('/')} style={styles.homeButton} accessibilityLabel="Home">
            <Ionicons name="home" size={24} color="#007AFF" />
          </Pressable>
          <Text style={styles.title}>Materials</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Content */}
        <ScrollView style={styles.scrollContent} contentContainerStyle={styles.scrollContentContainer}>
          {/* Invoice Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Invoice</Text>
            <Text style={styles.sectionSubtitle}>Preview of your customizable invoice template</Text>
            <InvoicePreview />
          </View>
        </ScrollView>
      </SafeAreaView>
    </PermissionGate>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    backgroundColor: '#fff',
  },
  homeButton: {
    padding: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  scrollContent: {
    flex: 1,
  },
  scrollContentContainer: {
    padding: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
  },
});

const invoiceStyles = StyleSheet.create({
  invoiceContainer: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  columns: {
    flexDirection: 'row',
    gap: 12,
  },
  leftColumn: {
    flex: 1,
  },
  rightColumn: {
    flex: 1,
  },
  servicesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  servicesHeaderText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#333',
  },
  dateSlash: {
    fontSize: 11,
    color: '#333',
    marginLeft: 4,
  },
  brandingSection: {
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 12,
  },
  logoCircle: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#555',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  businessName: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
  },
  businessNameBlue: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2E86AB',
  },
  tagline: {
    fontSize: 10,
    color: '#333',
    marginTop: 2,
  },
  phoneNumber: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2E86AB',
    marginTop: 6,
  },
  socialRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  socialText: {
    fontSize: 9,
    color: '#333',
  },
  websiteText: {
    fontSize: 9,
    color: '#333',
  },
  blueBox: {
    borderWidth: 2,
    borderColor: '#2E86AB',
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
  },
  boxTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 6,
  },
  boxText: {
    fontSize: 10,
    color: '#333',
    lineHeight: 14,
  },
  linkText: {
    fontSize: 10,
    color: '#2E86AB',
    marginTop: 4,
  },
  addressSection: {
    paddingTop: 8,
  },
  addressText: {
    fontSize: 10,
    color: '#333',
    lineHeight: 14,
  },
  bankLabel: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#333',
  },
  bankValueBlue: {
    fontSize: 11,
    color: '#2E86AB',
    marginBottom: 4,
  },
  bankRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  bankValue: {
    fontSize: 11,
    color: '#2E86AB',
  },
  paymentRef: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#2E86AB',
    marginTop: 2,
  },
  notesArea: {
    height: 60,
  },
  serviceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#2E86AB',
    paddingVertical: 4,
  },
  serviceText: {
    fontSize: 9,
    color: '#333',
    flex: 1,
  },
  priceText: {
    fontSize: 9,
    color: '#333',
    width: 30,
    textAlign: 'right',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 6,
  },
  totalLabel: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#333',
    flex: 1,
    textAlign: 'right',
    paddingRight: 8,
  },
  totalPrice: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#333',
    width: 30,
    textAlign: 'right',
  },
});
