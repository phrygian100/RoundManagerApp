import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useRef } from 'react';
import { Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import PermissionGate from '../components/PermissionGate';

const INVOICE_HEIGHT = 580;
const INVOICE_WIDTH = 400;
const LEAFLET_WIDTH = 800; // Double width for New Business Leaflet

// Invoice Front Component
const InvoiceFront = () => {
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

// Invoice Back Component
const InvoiceBack = () => {
  // Placeholder data - will be populated from user settings/context later
  const portalUrl = 'guvnor.app/tgmwindowcleaning';
  const businessName = 'TGM Window Cleaning';

  return (
    <View style={invoiceStyles.invoiceContainer}>
      {/* Top Half - Client Portal Instructions */}
      <View style={invoiceStyles.backTopHalf}>
        <View style={invoiceStyles.portalBox}>
          <Ionicons name="person-circle-outline" size={48} color="#2E86AB" style={{ alignSelf: 'center', marginBottom: 12 }} />
          
          <Text style={invoiceStyles.portalTitle}>Manage Your Account Online</Text>
          
          <Text style={invoiceStyles.portalText}>
            View your statement, check your balance, and manage your account details online through our customer portal.
          </Text>
          
          <View style={invoiceStyles.portalSteps}>
            <Text style={invoiceStyles.stepTitle}>How to access:</Text>
            
            <View style={invoiceStyles.stepRow}>
              <Text style={invoiceStyles.stepNumber}>1.</Text>
              <Text style={invoiceStyles.stepText}>Visit our customer portal at:</Text>
            </View>
            <Text style={invoiceStyles.portalUrl}>{portalUrl}</Text>
            
            <View style={invoiceStyles.stepRow}>
              <Text style={invoiceStyles.stepNumber}>2.</Text>
              <Text style={invoiceStyles.stepText}>Enter your account number (shown on front as payment reference)</Text>
            </View>
            
            <View style={invoiceStyles.stepRow}>
              <Text style={invoiceStyles.stepNumber}>3.</Text>
              <Text style={invoiceStyles.stepText}>Verify with the last 4 digits of your phone number</Text>
            </View>
          </View>
          
          <View style={invoiceStyles.portalFeatures}>
            <Text style={invoiceStyles.featuresTitle}>You can:</Text>
            <Text style={invoiceStyles.featureItem}>• View your account balance</Text>
            <Text style={invoiceStyles.featureItem}>• See your service history</Text>
            <Text style={invoiceStyles.featureItem}>• Check upcoming visits</Text>
            <Text style={invoiceStyles.featureItem}>• Update your contact details</Text>
          </View>
        </View>
      </View>
      
      {/* Bottom Half - Empty/Reserved */}
      <View style={invoiceStyles.backBottomHalf}>
        <Text style={invoiceStyles.businessNameFooter}>{businessName}</Text>
      </View>
    </View>
  );
};

// Flyer Placeholder Components
const FlyerFront = () => {
  return (
    <View style={[invoiceStyles.invoiceContainer, styles.placeholderCanvas]}>
      <View style={styles.placeholderContent}>
        <Ionicons name="document-text-outline" size={48} color="#ccc" />
        <Text style={styles.placeholderTitle}>Flyer - Front</Text>
        <Text style={styles.placeholderText}>Coming soon</Text>
      </View>
    </View>
  );
};

const FlyerBack = () => {
  return (
    <View style={[invoiceStyles.invoiceContainer, styles.placeholderCanvas]}>
      <View style={styles.placeholderContent}>
        <Ionicons name="document-text-outline" size={48} color="#ccc" />
        <Text style={styles.placeholderTitle}>Flyer - Back</Text>
        <Text style={styles.placeholderText}>Coming soon</Text>
      </View>
    </View>
  );
};

// Canvassing Flyer Placeholder Components
const CanvassingFlyerFront = () => {
  return (
    <View style={[invoiceStyles.invoiceContainer, styles.placeholderCanvas]}>
      <View style={styles.placeholderContent}>
        <Ionicons name="megaphone-outline" size={48} color="#ccc" />
        <Text style={styles.placeholderTitle}>Canvassing Flyer - Front</Text>
        <Text style={styles.placeholderText}>Coming soon</Text>
      </View>
    </View>
  );
};

const CanvassingFlyerBack = () => {
  return (
    <View style={[invoiceStyles.invoiceContainer, styles.placeholderCanvas]}>
      <View style={styles.placeholderContent}>
        <Ionicons name="megaphone-outline" size={48} color="#ccc" />
        <Text style={styles.placeholderTitle}>Canvassing Flyer - Back</Text>
        <Text style={styles.placeholderText}>Coming soon</Text>
      </View>
    </View>
  );
};

// New Business Leaflet Placeholder Components (double width)
const NewBusinessLeafletFront = () => {
  return (
    <View style={[invoiceStyles.invoiceContainer, styles.placeholderCanvas, { width: LEAFLET_WIDTH }]}>
      <View style={styles.placeholderContent}>
        <Ionicons name="briefcase-outline" size={48} color="#ccc" />
        <Text style={styles.placeholderTitle}>New Business Leaflet - Front</Text>
        <Text style={styles.placeholderText}>Coming soon</Text>
        <Text style={styles.placeholderSubtext}>Double-width format for tri-fold printing</Text>
      </View>
    </View>
  );
};

const NewBusinessLeafletBack = () => {
  return (
    <View style={[invoiceStyles.invoiceContainer, styles.placeholderCanvas, { width: LEAFLET_WIDTH }]}>
      <View style={styles.placeholderContent}>
        <Ionicons name="briefcase-outline" size={48} color="#ccc" />
        <Text style={styles.placeholderTitle}>New Business Leaflet - Back</Text>
        <Text style={styles.placeholderText}>Coming soon</Text>
        <Text style={styles.placeholderSubtext}>Double-width format for tri-fold printing</Text>
      </View>
    </View>
  );
};

export default function MaterialsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const printRef = useRef<View>(null);

  const handleDownloadPDF = () => {
    if (Platform.OS === 'web') {
      // Create a new window with just the invoices for printing
      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        alert('Please allow popups to download the PDF');
        return;
      }
      
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Invoice - Print</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
            @media print {
              @page { size: A5 landscape; margin: 10mm; }
              .page-break { page-break-after: always; }
              .no-print { display: none; }
            }
            .invoice-container {
              width: 400px;
              height: 580px;
              padding: 16px;
              background: white;
              border: 1px solid #ddd;
              margin: 20px auto;
            }
            .columns { display: flex; gap: 12px; height: 100%; }
            .column { flex: 1; display: flex; flex-direction: column; }
            .blue-box { border: 2px solid #2E86AB; border-radius: 8px; padding: 10px; margin-bottom: 10px; }
            .box-title { font-size: 14px; font-weight: bold; margin-bottom: 6px; }
            .box-text { font-size: 10px; line-height: 1.4; }
            .link-text { font-size: 10px; color: #2E86AB; margin-top: 4px; }
            .branding { text-align: center; margin-bottom: 12px; }
            .logo-circle { width: 70px; height: 70px; border-radius: 50%; background: #555; margin: 0 auto 8px; display: flex; align-items: center; justify-content: center; }
            .logo-circle svg { width: 40px; height: 40px; fill: white; }
            .business-name { font-size: 22px; font-weight: bold; }
            .business-name-blue { font-size: 18px; font-weight: 600; color: #2E86AB; }
            .tagline { font-size: 10px; margin-top: 2px; }
            .phone { font-size: 16px; font-weight: bold; color: #2E86AB; margin-top: 6px; }
            .social, .website { font-size: 9px; }
            .address { font-size: 10px; line-height: 1.4; padding-top: 8px; }
            .bank-label { font-size: 10px; font-weight: bold; }
            .bank-value { font-size: 11px; color: #2E86AB; }
            .bank-row { display: flex; justify-content: space-between; margin-bottom: 2px; }
            .payment-ref { font-size: 14px; font-weight: bold; color: #2E86AB; }
            .notes-area { height: 60px; }
            .service-row { display: flex; justify-content: space-between; border-bottom: 1px solid #2E86AB; padding: 4px 0; font-size: 9px; }
            .total-row { display: flex; justify-content: space-between; padding-top: 6px; font-size: 10px; font-weight: bold; }
            .services-header { font-size: 11px; font-weight: bold; margin-bottom: 12px; }
            .portal-box { border: 2px solid #2E86AB; border-radius: 8px; padding: 16px; }
            .portal-title { font-size: 16px; font-weight: bold; color: #2E86AB; text-align: center; margin-bottom: 10px; }
            .portal-text { font-size: 10px; text-align: center; line-height: 1.4; margin-bottom: 12px; }
            .step-title { font-size: 11px; font-weight: bold; margin-bottom: 6px; }
            .step-row { display: flex; margin-bottom: 4px; font-size: 10px; }
            .step-number { font-weight: bold; color: #2E86AB; width: 16px; }
            .portal-url { font-size: 11px; font-weight: bold; color: #2E86AB; text-align: center; margin-bottom: 8px; margin-left: 16px; }
            .features-box { background: #f0f8ff; border-radius: 6px; padding: 10px; margin-top: 12px; }
            .features-title { font-size: 10px; font-weight: bold; margin-bottom: 4px; }
            .feature-item { font-size: 9px; line-height: 1.4; }
            .back-content { height: 100%; display: flex; flex-direction: column; }
            .back-top { flex: 1; }
            .back-bottom { text-align: center; padding-bottom: 16px; font-size: 10px; color: #999; font-style: italic; }
            .print-btn { display: block; margin: 20px auto; padding: 12px 24px; background: #007AFF; color: white; border: none; border-radius: 8px; font-size: 16px; cursor: pointer; }
            .print-btn:hover { background: #0056b3; }
            h2 { text-align: center; margin: 20px 0 10px; color: #666; font-size: 14px; text-transform: uppercase; letter-spacing: 1px; }
          </style>
        </head>
        <body>
          <button class="print-btn no-print" onclick="window.print()">🖨️ Print / Save as PDF</button>
          
          <h2 class="no-print">Front</h2>
          <div class="invoice-container">
            <div class="columns">
              <div class="column">
                <div class="services-header">Services provided on: ✓ &nbsp;&nbsp;/&nbsp;&nbsp;/&nbsp;&nbsp;</div>
                <div class="branding">
                  <div class="logo-circle">
                    <svg viewBox="0 0 24 24"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>
                  </div>
                  <div class="business-name">TGM</div>
                  <div class="business-name-blue">Window Cleaning</div>
                  <div class="tagline">Local. Reliable. Professional.</div>
                  <div class="phone">07814 804 759</div>
                  <div class="social">f/tgmwindowcleaningUK</div>
                  <div class="website">www.tgmwindowcleaning.co.uk</div>
                </div>
                <div class="blue-box">
                  <div class="box-title">Direct Debit</div>
                  <div class="box-text">With your card details at hand go to:</div>
                  <div class="link-text">www.tgmwindowcleaning.co.uk/gocardless</div>
                </div>
                <div class="blue-box">
                  <div class="box-title">Cash</div>
                  <div class="box-text">Let us know to knock on your door or look somewhere for an envelope.</div>
                </div>
                <div class="address">
                  TGM Window Cleaning<br>
                  16 Church Street<br>
                  LN4 4HN
                </div>
              </div>
              <div class="column">
                <div class="blue-box">
                  <div class="box-title">Bank Transfer</div>
                  <div class="bank-label">Business Account Name:</div>
                  <div class="bank-value">TGM Window Cleaning</div>
                  <div class="bank-row"><span class="bank-label">Sort Code:</span><span class="bank-value">30-98-97</span></div>
                  <div class="bank-row"><span class="bank-label">Account No:</span><span class="bank-value">36215362</span></div>
                  <div class="bank-label">Payment reference:</div>
                  <div class="payment-ref">RWC</div>
                </div>
                <div class="blue-box">
                  <div class="box-title">Notes</div>
                  <div class="notes-area"></div>
                </div>
                <div class="blue-box">
                  <div class="box-title">Work completed</div>
                  <div class="service-row"><span>Exterior window cleaning</span><span>£</span></div>
                  <div class="service-row"><span>Gutter cleaning</span><span>£</span></div>
                  <div class="service-row"><span>Soffits and Facias</span><span>£</span></div>
                  <div class="service-row"><span>Conservatory roof clean</span><span>£</span></div>
                  <div class="service-row"><span>Solar panels</span><span>£</span></div>
                  <div class="service-row"><span>UPVc Restoration</span><span>£</span></div>
                  <div class="service-row"><span>Caravan softwash</span><span>£</span></div>
                  <div class="service-row"><span></span><span>£</span></div>
                  <div class="service-row"><span></span><span>£</span></div>
                  <div class="total-row"><span>Total</span><span>£</span></div>
                </div>
              </div>
            </div>
          </div>
          
          <div class="page-break"></div>
          
          <h2 class="no-print">Back</h2>
          <div class="invoice-container">
            <div class="back-content">
              <div class="back-top">
                <div class="portal-box">
                  <div style="text-align: center; margin-bottom: 12px;">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="#2E86AB"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/></svg>
                  </div>
                  <div class="portal-title">Manage Your Account Online</div>
                  <div class="portal-text">View your statement, check your balance, and manage your account details online through our customer portal.</div>
                  <div class="step-title">How to access:</div>
                  <div class="step-row"><span class="step-number">1.</span><span>Visit our customer portal at:</span></div>
                  <div class="portal-url">guvnor.app/tgmwindowcleaning</div>
                  <div class="step-row"><span class="step-number">2.</span><span>Enter your account number (shown on front as payment reference)</span></div>
                  <div class="step-row"><span class="step-number">3.</span><span>Verify with the last 4 digits of your phone number</span></div>
                  <div class="features-box">
                    <div class="features-title">You can:</div>
                    <div class="feature-item">• View your account balance</div>
                    <div class="feature-item">• See your service history</div>
                    <div class="feature-item">• Check upcoming visits</div>
                    <div class="feature-item">• Update your contact details</div>
                  </div>
                </div>
              </div>
              <div class="back-bottom">TGM Window Cleaning</div>
            </div>
          </div>
        </body>
        </html>
      `);
      printWindow.document.close();
    } else {
      alert('PDF download is only available on web. Use your device\'s screenshot or print feature.');
    }
  };

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
            <View style={styles.sectionHeader}>
              <View>
                <Text style={styles.sectionTitle}>Invoice</Text>
                <Text style={styles.sectionSubtitle}>Preview of your customizable invoice template</Text>
              </View>
              {Platform.OS === 'web' && (
                <Pressable style={styles.downloadButton} onPress={handleDownloadPDF}>
                  <Ionicons name="download-outline" size={18} color="#fff" />
                  <Text style={styles.downloadButtonText}>Download PDF</Text>
                </Pressable>
              )}
            </View>
            
            {/* Side by side invoice previews */}
            <View style={styles.invoiceRow} ref={printRef}>
              <View style={styles.invoiceWrapper}>
                <Text style={styles.invoiceLabel}>Front</Text>
                <InvoiceFront />
              </View>
              <View style={styles.invoiceWrapper}>
                <Text style={styles.invoiceLabel}>Back</Text>
                <InvoiceBack />
              </View>
            </View>
          </View>

          {/* Flyer Section */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View>
                <Text style={styles.sectionTitle}>Flyer</Text>
                <Text style={styles.sectionSubtitle}>Promotional flyer for existing customers</Text>
              </View>
              <View style={styles.comingSoonBadge}>
                <Text style={styles.comingSoonText}>Coming Soon</Text>
              </View>
            </View>
            
            <View style={styles.invoiceRow}>
              <View style={styles.invoiceWrapper}>
                <Text style={styles.invoiceLabel}>Front</Text>
                <FlyerFront />
              </View>
              <View style={styles.invoiceWrapper}>
                <Text style={styles.invoiceLabel}>Back</Text>
                <FlyerBack />
              </View>
            </View>
          </View>

          {/* Canvassing Flyer Section */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View>
                <Text style={styles.sectionTitle}>Canvassing Flyer</Text>
                <Text style={styles.sectionSubtitle}>Door-to-door marketing flyer for new areas</Text>
              </View>
              <View style={styles.comingSoonBadge}>
                <Text style={styles.comingSoonText}>Coming Soon</Text>
              </View>
            </View>
            
            <View style={styles.invoiceRow}>
              <View style={styles.invoiceWrapper}>
                <Text style={styles.invoiceLabel}>Front</Text>
                <CanvassingFlyerFront />
              </View>
              <View style={styles.invoiceWrapper}>
                <Text style={styles.invoiceLabel}>Back</Text>
                <CanvassingFlyerBack />
              </View>
            </View>
          </View>

          {/* New Business Leaflet Section */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View>
                <Text style={styles.sectionTitle}>New Business Leaflet</Text>
                <Text style={styles.sectionSubtitle}>Tri-fold leaflet for business introductions</Text>
              </View>
              <View style={styles.comingSoonBadge}>
                <Text style={styles.comingSoonText}>Coming Soon</Text>
              </View>
            </View>
            
            <ScrollView horizontal showsHorizontalScrollIndicator={true} style={styles.leafletScroll}>
              <View style={styles.invoiceRow}>
                <View style={styles.invoiceWrapper}>
                  <Text style={styles.invoiceLabel}>Front</Text>
                  <NewBusinessLeafletFront />
                </View>
                <View style={styles.invoiceWrapper}>
                  <Text style={styles.invoiceLabel}>Back</Text>
                  <NewBusinessLeafletBack />
                </View>
              </View>
            </ScrollView>
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
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
    flexWrap: 'wrap',
    gap: 12,
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
  },
  downloadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#007AFF',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    gap: 8,
  },
  downloadButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  invoiceRow: {
    flexDirection: 'row',
    gap: 24,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  invoiceWrapper: {
    alignItems: 'center',
  },
  invoiceLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#666',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  comingSoonBadge: {
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  comingSoonText: {
    fontSize: 12,
    color: '#999',
    fontWeight: '600',
  },
  placeholderCanvas: {
    justifyContent: 'center',
    alignItems: 'center',
    borderStyle: 'dashed',
    borderWidth: 2,
    borderColor: '#ddd',
    backgroundColor: '#fafafa',
  },
  placeholderContent: {
    alignItems: 'center',
    padding: 20,
  },
  placeholderTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#999',
    marginTop: 12,
  },
  placeholderText: {
    fontSize: 14,
    color: '#bbb',
    marginTop: 4,
  },
  placeholderSubtext: {
    fontSize: 12,
    color: '#ccc',
    marginTop: 8,
    textAlign: 'center',
  },
  leafletScroll: {
    marginHorizontal: -16,
    paddingHorizontal: 16,
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
    width: INVOICE_WIDTH,
    height: INVOICE_HEIGHT,
  },
  columns: {
    flexDirection: 'row',
    gap: 12,
    flex: 1,
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
  // Back invoice styles
  backTopHalf: {
    flex: 1,
  },
  backBottomHalf: {
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 8,
  },
  portalBox: {
    borderWidth: 2,
    borderColor: '#2E86AB',
    borderRadius: 8,
    padding: 16,
  },
  portalTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2E86AB',
    textAlign: 'center',
    marginBottom: 10,
  },
  portalText: {
    fontSize: 10,
    color: '#333',
    textAlign: 'center',
    lineHeight: 14,
    marginBottom: 12,
  },
  portalSteps: {
    marginBottom: 12,
  },
  stepTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 6,
  },
  stepRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  stepNumber: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#2E86AB',
    width: 16,
  },
  stepText: {
    fontSize: 10,
    color: '#333',
    flex: 1,
    lineHeight: 14,
  },
  portalUrl: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#2E86AB',
    textAlign: 'center',
    marginBottom: 8,
    marginLeft: 16,
  },
  portalFeatures: {
    backgroundColor: '#f0f8ff',
    borderRadius: 6,
    padding: 10,
  },
  featuresTitle: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  featureItem: {
    fontSize: 9,
    color: '#333',
    lineHeight: 14,
  },
  businessNameFooter: {
    fontSize: 10,
    color: '#999',
    fontStyle: 'italic',
  },
});
