import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import React, { useEffect, useRef, useState } from 'react';
import { Modal, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import PermissionGate from '../components/PermissionGate';
import { db } from '../core/firebase';
import { getDataOwnerId } from '../core/session';

const INVOICE_HEIGHT = 580;
const INVOICE_WIDTH = 400;
const LEAFLET_WIDTH = 800; // Double width for New Business Leaflet

// Materials Configuration Type
interface MaterialsConfig {
  businessName: string;
  tagline: string;
  mobileNumber: string;
  logoUrl: string;
  bankAccountName: string;
  sortCode: string;
  accountNumber: string;
  directDebitLink: string;
  businessAddress: {
    line1: string;
    line2: string;
    town: string;
    postcode: string;
  };
  services: string[];
  customerPortalLink: string;
  websiteAddress: string;
  facebookHandle: string;
}

const defaultConfig: MaterialsConfig = {
  businessName: 'Your Business Name',
  tagline: 'Your tagline here',
  mobileNumber: '07XXX XXX XXX',
  logoUrl: '',
  bankAccountName: 'Your Business Name',
  sortCode: '00-00-00',
  accountNumber: '00000000',
  directDebitLink: 'www.yourbusiness.co.uk/pay',
  businessAddress: {
    line1: 'Your Business Name',
    line2: '123 Street Name',
    town: 'Town',
    postcode: 'AB1 2CD',
  },
  services: [
    'Service 1',
    'Service 2',
    'Service 3',
    'Service 4',
    'Service 5',
  ],
  customerPortalLink: 'guvnor.app/yourbusiness',
  websiteAddress: 'www.yourbusiness.co.uk',
  facebookHandle: 'yourbusiness',
};

// Configuration Modal Component
const ConfigurationModal = ({ 
  visible, 
  onClose, 
  config, 
  onSave 
}: { 
  visible: boolean; 
  onClose: () => void; 
  config: MaterialsConfig;
  onSave: (config: MaterialsConfig) => void;
}) => {
  const [formData, setFormData] = useState<MaterialsConfig>(config);
  const [servicesText, setServicesText] = useState(config.services.join('\n'));

  useEffect(() => {
    setFormData(config);
    setServicesText(config.services.filter(s => s).join('\n'));
  }, [config, visible]);

  const handleSave = () => {
    const updatedConfig = {
      ...formData,
      services: servicesText.split('\n').map(s => s.trim()).filter(s => s),
    };
    onSave(updatedConfig);
    onClose();
  };

  const updateField = (field: keyof MaterialsConfig, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const updateAddressField = (field: keyof MaterialsConfig['businessAddress'], value: string) => {
    setFormData(prev => ({
      ...prev,
      businessAddress: { ...prev.businessAddress, [field]: value },
    }));
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={modalStyles.overlay}>
        <View style={modalStyles.container}>
          <View style={modalStyles.header}>
            <Text style={modalStyles.title}>Configure Materials</Text>
            <Pressable onPress={onClose} style={modalStyles.closeButton}>
              <Ionicons name="close" size={24} color="#333" />
            </Pressable>
          </View>

          <ScrollView style={modalStyles.content} showsVerticalScrollIndicator={false}>
            {/* Business Identity */}
            <Text style={modalStyles.sectionTitle}>Business Identity</Text>
            
            <Text style={modalStyles.label}>Business Name</Text>
            <TextInput
              style={modalStyles.input}
              value={formData.businessName}
              onChangeText={(v) => updateField('businessName', v)}
              placeholder="e.g. TGM Window Cleaning"
            />

            <Text style={modalStyles.label}>Tagline</Text>
            <TextInput
              style={modalStyles.input}
              value={formData.tagline}
              onChangeText={(v) => updateField('tagline', v)}
              placeholder="e.g. Local. Reliable. Professional."
            />

            <Text style={modalStyles.label}>Mobile Number</Text>
            <TextInput
              style={modalStyles.input}
              value={formData.mobileNumber}
              onChangeText={(v) => updateField('mobileNumber', v)}
              placeholder="e.g. 07814 804 759"
              keyboardType="phone-pad"
            />

            <Text style={modalStyles.label}>Logo URL (optional)</Text>
            <TextInput
              style={modalStyles.input}
              value={formData.logoUrl}
              onChangeText={(v) => updateField('logoUrl', v)}
              placeholder="https://example.com/logo.png"
            />

            {/* Online Presence */}
            <Text style={modalStyles.sectionTitle}>Online Presence</Text>

            <Text style={modalStyles.label}>Website Address</Text>
            <TextInput
              style={modalStyles.input}
              value={formData.websiteAddress}
              onChangeText={(v) => updateField('websiteAddress', v)}
              placeholder="e.g. www.example.co.uk"
            />

            <Text style={modalStyles.label}>Facebook Handle</Text>
            <TextInput
              style={modalStyles.input}
              value={formData.facebookHandle}
              onChangeText={(v) => updateField('facebookHandle', v)}
              placeholder="e.g. mybusinessUK"
            />

            <Text style={modalStyles.label}>Customer Portal Link</Text>
            <TextInput
              style={modalStyles.input}
              value={formData.customerPortalLink}
              onChangeText={(v) => updateField('customerPortalLink', v)}
              placeholder="e.g. guvnor.app/yourbusiness"
            />

            {/* Banking Details */}
            <Text style={modalStyles.sectionTitle}>Banking Details</Text>

            <Text style={modalStyles.label}>Bank Account Name</Text>
            <TextInput
              style={modalStyles.input}
              value={formData.bankAccountName}
              onChangeText={(v) => updateField('bankAccountName', v)}
              placeholder="e.g. My Business Ltd"
            />

            <View style={modalStyles.row}>
              <View style={modalStyles.halfField}>
                <Text style={modalStyles.label}>Sort Code</Text>
                <TextInput
                  style={modalStyles.input}
                  value={formData.sortCode}
                  onChangeText={(v) => updateField('sortCode', v)}
                  placeholder="e.g. 30-98-97"
                />
              </View>
              <View style={modalStyles.halfField}>
                <Text style={modalStyles.label}>Account Number</Text>
                <TextInput
                  style={modalStyles.input}
                  value={formData.accountNumber}
                  onChangeText={(v) => updateField('accountNumber', v)}
                  placeholder="e.g. 12345678"
                />
              </View>
            </View>

            <Text style={modalStyles.label}>Direct Debit Sign-up Link</Text>
            <TextInput
              style={modalStyles.input}
              value={formData.directDebitLink}
              onChangeText={(v) => updateField('directDebitLink', v)}
              placeholder="e.g. www.example.co.uk/gocardless"
            />

            {/* Business Address */}
            <Text style={modalStyles.sectionTitle}>Business Address</Text>

            <Text style={modalStyles.label}>Address Line 1</Text>
            <TextInput
              style={modalStyles.input}
              value={formData.businessAddress.line1}
              onChangeText={(v) => updateAddressField('line1', v)}
              placeholder="e.g. Business Name"
            />

            <Text style={modalStyles.label}>Address Line 2</Text>
            <TextInput
              style={modalStyles.input}
              value={formData.businessAddress.line2}
              onChangeText={(v) => updateAddressField('line2', v)}
              placeholder="e.g. 123 High Street"
            />

            <View style={modalStyles.row}>
              <View style={modalStyles.halfField}>
                <Text style={modalStyles.label}>Town</Text>
                <TextInput
                  style={modalStyles.input}
                  value={formData.businessAddress.town}
                  onChangeText={(v) => updateAddressField('town', v)}
                  placeholder="e.g. Lincoln"
                />
              </View>
              <View style={modalStyles.halfField}>
                <Text style={modalStyles.label}>Postcode</Text>
                <TextInput
                  style={modalStyles.input}
                  value={formData.businessAddress.postcode}
                  onChangeText={(v) => updateAddressField('postcode', v)}
                  placeholder="e.g. LN4 4HN"
                />
              </View>
            </View>

            {/* Services */}
            <Text style={modalStyles.sectionTitle}>Work Completed / Services</Text>
            <Text style={modalStyles.hint}>Enter each service on a new line</Text>
            <TextInput
              style={[modalStyles.input, modalStyles.multilineInput]}
              value={servicesText}
              onChangeText={setServicesText}
              placeholder="Exterior window cleaning&#10;Gutter cleaning&#10;..."
              multiline
              numberOfLines={8}
            />

            <View style={{ height: 40 }} />
          </ScrollView>

          <View style={modalStyles.footer}>
            <Pressable style={modalStyles.cancelButton} onPress={onClose}>
              <Text style={modalStyles.cancelButtonText}>Cancel</Text>
            </Pressable>
            <Pressable style={modalStyles.saveButton} onPress={handleSave}>
              <Ionicons name="checkmark" size={20} color="#fff" />
              <Text style={modalStyles.saveButtonText}>Save Configuration</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
};

// Invoice Front Component
const InvoiceFront = ({ config }: { config: MaterialsConfig }) => {
  // Pad services to 9 rows
  const services = [...config.services];
  while (services.length < 9) services.push('');

  return (
    <View style={invoiceStyles.invoiceContainer}>
      {/* TOP SECTION: Header + Branding (left) | Bank Transfer + Notes (right) */}
      <View style={invoiceStyles.topSection}>
        {/* Left: Header + Branding */}
        <View style={invoiceStyles.topLeftColumn}>
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
            
            <Text style={invoiceStyles.businessName}>{config.businessName}</Text>
            <Text style={invoiceStyles.tagline}>{config.tagline}</Text>
            <Text style={invoiceStyles.phoneNumber}>{config.mobileNumber}</Text>
            
            <View style={invoiceStyles.socialRow}>
              <Text style={invoiceStyles.socialText}>f/{config.facebookHandle}</Text>
            </View>
            <Text style={invoiceStyles.websiteText}>{config.websiteAddress}</Text>
          </View>
        </View>

        {/* Right: Bank Transfer + Notes */}
        <View style={invoiceStyles.topRightColumn}>
          {/* Bank Transfer Box */}
          <View style={invoiceStyles.blueBox}>
            <Text style={invoiceStyles.boxTitle}>Bank Transfer</Text>
            <Text style={invoiceStyles.bankLabel}>Business Account Name:</Text>
            <Text style={invoiceStyles.bankValueBlue}>{config.bankAccountName}</Text>
            
            <View style={invoiceStyles.bankRow}>
              <Text style={invoiceStyles.bankLabel}>Sort Code:</Text>
              <Text style={invoiceStyles.bankValue}>{config.sortCode}</Text>
            </View>
            <View style={invoiceStyles.bankRow}>
              <Text style={invoiceStyles.bankLabel}>Account No:</Text>
              <Text style={invoiceStyles.bankValue}>{config.accountNumber}</Text>
            </View>
            
            <Text style={invoiceStyles.bankLabel}>Payment reference:</Text>
            <Text style={invoiceStyles.paymentRef}>RWC</Text>
          </View>

          {/* Notes Box */}
          <View style={invoiceStyles.blueBox}>
            <Text style={invoiceStyles.boxTitle}>Notes</Text>
            <View style={invoiceStyles.notesArea} />
          </View>
        </View>
      </View>

      {/* BOTTOM SECTION: Direct Debit + Cash + Post (left) | Work Completed (right) - ALIGNED */}
      <View style={invoiceStyles.bottomSection}>
        {/* Left: Payment method boxes */}
        <View style={invoiceStyles.bottomLeftColumn}>
          {/* Direct Debit Box */}
          <View style={invoiceStyles.blueBox}>
            <Text style={invoiceStyles.boxTitle}>Direct Debit</Text>
            <Text style={invoiceStyles.boxText}>With your card details at hand go to:</Text>
            <Text style={invoiceStyles.linkText}>{config.directDebitLink}</Text>
          </View>

          {/* Cash Box */}
          <View style={invoiceStyles.blueBox}>
            <Text style={invoiceStyles.boxTitle}>Cash</Text>
            <Text style={invoiceStyles.boxText}>
              Let us know to knock on your door or look somewhere for an envelope.
            </Text>
          </View>

          {/* Post Box - Business Address (flex to align bottom with Work Completed) */}
          <View style={[invoiceStyles.blueBox, { flex: 1, marginBottom: 0 }]}>
            <Text style={invoiceStyles.boxTitle}>Post</Text>
            <Text style={invoiceStyles.addressText}>{config.businessAddress.line1}</Text>
            <Text style={invoiceStyles.addressText}>{config.businessAddress.line2}</Text>
            <Text style={invoiceStyles.addressText}>{config.businessAddress.postcode}</Text>
          </View>
        </View>

        {/* Right: Work Completed */}
        <View style={invoiceStyles.bottomRightColumn}>
          {/* Work Completed Box */}
          <View style={[invoiceStyles.blueBox, { flex: 1, marginBottom: 0 }]}>
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
const InvoiceBack = ({ config }: { config: MaterialsConfig }) => {
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
            <Text style={invoiceStyles.portalUrl}>{config.customerPortalLink}</Text>
            
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
        <Text style={invoiceStyles.businessNameFooter}>{config.businessName}</Text>
      </View>
    </View>
  );
};

// Flyer Components
const FlyerFront = ({ config }: { config: MaterialsConfig }) => {
  const services = [
    'Routine service every 4 or 8 weeks',
    'Full property, including doors, sills and frames',
    'Simple payment system',
    'A text when we\'re due,\nbut no need to be home',
  ];

  return (
    <View style={[flyerStyles.container]}>
      {/* Gradient Header Background */}
      <View style={flyerStyles.headerGradient}>
        {/* Logo and Branding */}
        <View style={flyerStyles.brandingRow}>
          <View style={flyerStyles.logoCircle}>
            <Ionicons name="home" size={32} color="#fff" />
          </View>
          <View style={flyerStyles.brandingText}>
            <Text style={flyerStyles.brandName}>{config.businessName}</Text>
            <Text style={flyerStyles.tagline}>{config.tagline}</Text>
          </View>
        </View>
      </View>

      {/* Main Content */}
      <View style={flyerStyles.mainContent}>
        <Text style={flyerStyles.sectionTitle}>Window Cleaning Services</Text>
        
        {services.map((service, index) => (
          <View key={index} style={flyerStyles.bulletRow}>
            <View style={flyerStyles.checkCircle}>
              <Ionicons name="checkmark" size={14} color="#4A90A4" />
            </View>
            <Text style={flyerStyles.bulletText}>{service}</Text>
          </View>
        ))}

        {/* FREE Quote Badge */}
        <View style={flyerStyles.quoteContainer}>
          <View style={flyerStyles.quoteBadge}>
            <Text style={flyerStyles.quoteFree}>FREE</Text>
            <Text style={flyerStyles.quoteText}>quote!</Text>
          </View>
        </View>
      </View>

      {/* Blue Footer */}
      <View style={flyerStyles.footer}>
        <View style={flyerStyles.footerCurve} />
        <View style={flyerStyles.footerContent}>
          <Text style={flyerStyles.footerCta}>Get in touch to arrange a FREE quote</Text>
          <View style={flyerStyles.contactRow}>
            <Ionicons name="call-outline" size={16} color="#fff" />
            <Text style={flyerStyles.phoneNumber}>{config.mobileNumber}</Text>
          </View>
          <View style={flyerStyles.contactRow}>
            <Ionicons name="logo-facebook" size={14} color="#fff" />
            <Text style={flyerStyles.contactText}>{config.facebookHandle}</Text>
          </View>
          <View style={flyerStyles.contactRow}>
            <Ionicons name="globe-outline" size={14} color="#fff" />
            <Text style={flyerStyles.contactText}>{config.websiteAddress}</Text>
          </View>
        </View>
        {/* Water droplets decoration */}
        <View style={flyerStyles.dropletsLeft}>
          <Ionicons name="water" size={16} color="rgba(255,255,255,0.4)" />
          <Ionicons name="water" size={12} color="rgba(255,255,255,0.3)" />
        </View>
        <View style={flyerStyles.dropletsRight}>
          <Ionicons name="water" size={14} color="rgba(255,255,255,0.3)" />
          <Ionicons name="water" size={10} color="rgba(255,255,255,0.2)" />
        </View>
      </View>
    </View>
  );
};

const FlyerBack = ({ config }: { config: MaterialsConfig }) => {
  const additionalServices = [
    { left: 'UPVC Restoration', right: 'Solar panel cleaning' },
    { left: 'Gutter cleaning', right: 'Caravan cleaning' },
    { left: 'Conservatory roof\ncleaning', right: '' },
  ];

  return (
    <View style={[flyerStyles.container]}>
      {/* Background image placeholder - gradient */}
      <View style={flyerStyles.backBackground}>
        {/* Before/After labels */}
        <View style={flyerStyles.beforeAfterRow}>
          <Text style={flyerStyles.beforeLabel}>Before</Text>
          <Text style={flyerStyles.afterLabel}>After</Text>
        </View>
        
        {/* Decorative roof lines */}
        <View style={flyerStyles.roofDecoration}>
          <View style={flyerStyles.roofLine} />
          <View style={flyerStyles.roofLine} />
          <View style={flyerStyles.roofLine} />
          <View style={flyerStyles.roofSpire} />
        </View>
      </View>

      {/* Additional Services Section */}
      <View style={flyerStyles.servicesSection}>
        <Text style={flyerStyles.additionalTitle}>Additional Services</Text>
        
        {additionalServices.map((row, index) => (
          <View key={index} style={flyerStyles.serviceRow}>
            <View style={flyerStyles.serviceItem}>
              <View style={flyerStyles.checkCircleSmall}>
                <Ionicons name="checkmark" size={12} color="#4A90A4" />
              </View>
              <Text style={flyerStyles.serviceText}>{row.left}</Text>
            </View>
            {row.right ? (
              <View style={flyerStyles.serviceItem}>
                <View style={flyerStyles.checkCircleSmall}>
                  <Ionicons name="checkmark" size={12} color="#4A90A4" />
                </View>
                <Text style={flyerStyles.serviceText}>{row.right}</Text>
              </View>
            ) : <View style={flyerStyles.serviceItem} />}
          </View>
        ))}

        {/* FREE Quote Badge */}
        <View style={flyerStyles.quoteContainerBack}>
          <View style={flyerStyles.quoteBadge}>
            <Text style={flyerStyles.quoteFree}>FREE</Text>
            <Text style={flyerStyles.quoteText}>quote!</Text>
          </View>
        </View>
      </View>

      {/* Blue Footer */}
      <View style={flyerStyles.footer}>
        <View style={flyerStyles.footerCurve} />
        <View style={flyerStyles.footerContent}>
          <Text style={flyerStyles.footerCta}>Get in touch to arrange a FREE quote</Text>
          <View style={flyerStyles.contactRow}>
            <Ionicons name="call-outline" size={16} color="#fff" />
            <Text style={flyerStyles.phoneNumber}>{config.mobileNumber}</Text>
          </View>
          <View style={flyerStyles.contactRow}>
            <Ionicons name="logo-facebook" size={14} color="#fff" />
            <Text style={flyerStyles.contactText}>{config.facebookHandle}</Text>
          </View>
          <View style={flyerStyles.contactRow}>
            <Ionicons name="globe-outline" size={14} color="#fff" />
            <Text style={flyerStyles.contactText}>{config.websiteAddress}</Text>
          </View>
        </View>
        {/* Water droplets decoration */}
        <View style={flyerStyles.dropletsLeft}>
          <Ionicons name="water" size={16} color="rgba(255,255,255,0.4)" />
          <Ionicons name="water" size={12} color="rgba(255,255,255,0.3)" />
        </View>
        <View style={flyerStyles.dropletsRight}>
          <Ionicons name="water" size={14} color="rgba(255,255,255,0.3)" />
          <Ionicons name="water" size={10} color="rgba(255,255,255,0.2)" />
        </View>
      </View>
    </View>
  );
};

// Canvassing Flyer Components
const CanvassingFlyerFront = ({ config }: { config: MaterialsConfig }) => {
  const services = [
    'Routine service every 4 or 8 weeks',
    'Full property including\ndoors sills and frames',
    'Receive a text notification the day\nbefore any visit with an ETA',
  ];

  return (
    <View style={canvassingStyles.container}>
      {/* Header with gradient background */}
      <View style={canvassingStyles.headerArea}>
        {/* Logo and Branding */}
        <View style={canvassingStyles.brandingRow}>
          <View style={canvassingStyles.logoCircle}>
            <Ionicons name="home" size={28} color="#fff" />
          </View>
          <View style={canvassingStyles.brandingText}>
            <Text style={canvassingStyles.brandName}>{config.businessName}</Text>
            <Text style={canvassingStyles.tagline}>{config.tagline}</Text>
          </View>
        </View>

        {/* Service bullet points */}
        <View style={canvassingStyles.servicesSection}>
          {services.map((service, index) => (
            <View key={index} style={canvassingStyles.bulletRow}>
              <View style={canvassingStyles.checkCircle}>
                <Ionicons name="checkmark" size={14} color="#4A90A4" />
              </View>
              <Text style={canvassingStyles.bulletText}>{service}</Text>
            </View>
          ))}
        </View>

        {/* Water droplets decoration */}
        <View style={canvassingStyles.dropletsDecoration}>
          <Ionicons name="water" size={20} color="rgba(74,144,164,0.3)" />
          <Ionicons name="water" size={14} color="rgba(74,144,164,0.2)" />
          <Ionicons name="water" size={16} color="rgba(74,144,164,0.25)" />
        </View>
      </View>

      {/* Quote Section */}
      <View style={canvassingStyles.quoteSection}>
        <Text style={canvassingStyles.quoteExplanation}>
          Below is a quote based on what we can see of your property from the curb.
        </Text>
        <Text style={canvassingStyles.quoteNote}>
          The 8 weekly option is 1.5 of the 4 weekly cost.
        </Text>

        {/* Price boxes */}
        <View style={canvassingStyles.priceBoxRow}>
          <View style={canvassingStyles.priceBox}>
            <Text style={canvassingStyles.priceLabel}>4 Weekly</Text>
            <View style={canvassingStyles.priceField} />
          </View>
          <View style={canvassingStyles.priceBox}>
            <Text style={canvassingStyles.priceLabel}>8 Weekly</Text>
            <View style={canvassingStyles.priceFieldWithBadge}>
              <View style={canvassingStyles.priceField} />
              <View style={canvassingStyles.percentBadge}>
                <Text style={canvassingStyles.percentText}>+50%</Text>
              </View>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
};

const CanvassingFlyerBack = ({ config }: { config: MaterialsConfig }) => {
  const additionalServices = [
    { left: 'Gutter cleaning', right: 'Solar panel cleaning' },
    { left: 'Gutter clearing', right: 'Fascias and Soffits' },
    { left: 'Conservatory Roof', right: 'uPVC restoration' },
  ];

  return (
    <View style={canvassingStyles.container}>
      {/* Background representing conservatory image */}
      <View style={canvassingStyles.backBackground}>
        {/* Decorative roof lines */}
        <View style={canvassingStyles.roofPattern}>
          <View style={canvassingStyles.roofSpireCenter} />
          {[...Array(8)].map((_, i) => (
            <View 
              key={i} 
              style={[
                canvassingStyles.roofBeam,
                { transform: [{ rotate: `${(i - 4) * 12}deg` }] }
              ]} 
            />
          ))}
        </View>

        {/* Additional Services Box */}
        <View style={canvassingStyles.servicesOverlay}>
          <Text style={canvassingStyles.additionalTitle}>Additional Services</Text>
          
          {additionalServices.map((row, index) => (
            <View key={index} style={canvassingStyles.serviceRow}>
              <View style={canvassingStyles.serviceItem}>
                <View style={canvassingStyles.checkCircleBack}>
                  <Ionicons name="checkmark" size={12} color="#4A90A4" />
                </View>
                <Text style={canvassingStyles.serviceText}>{row.left}</Text>
              </View>
              <View style={canvassingStyles.serviceItem}>
                <View style={canvassingStyles.checkCircleBack}>
                  <Ionicons name="checkmark" size={12} color="#4A90A4" />
                </View>
                <Text style={canvassingStyles.serviceText}>{row.right}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Water droplets */}
        <View style={canvassingStyles.waterDroplets}>
          <Ionicons name="water" size={18} color="rgba(255,255,255,0.6)" />
          <Ionicons name="water" size={12} color="rgba(255,255,255,0.5)" />
          <Ionicons name="water" size={14} color="rgba(255,255,255,0.4)" />
          <Ionicons name="water" size={10} color="rgba(255,255,255,0.5)" />
          <Ionicons name="water" size={16} color="rgba(255,255,255,0.3)" />
        </View>
      </View>

      {/* Blue Footer */}
      <View style={canvassingStyles.footer}>
        <View style={canvassingStyles.footerCurve} />
        <View style={canvassingStyles.footerContent}>
          <Text style={canvassingStyles.footerCta}>Get in touch</Text>
          <View style={canvassingStyles.contactRow}>
            <Ionicons name="call-outline" size={16} color="#fff" />
            <Text style={canvassingStyles.phoneNumber}>{config.mobileNumber}</Text>
          </View>
          <View style={canvassingStyles.contactRow}>
            <Ionicons name="globe-outline" size={14} color="#fff" />
            <Text style={canvassingStyles.contactText}>{config.websiteAddress}</Text>
          </View>
        </View>
      </View>
    </View>
  );
};

// New Business Leaflet Components (double width)
const NewBusinessLeafletFront = ({ config }: { config: MaterialsConfig }) => {
  const adhocServices = [
    'Conservatory Roof',
    'Gutter Clearance',
    'Soffits and Fascias',
    'Solar Panels',
    '', '', '', '',
  ];

  const expectations = [
    "You'll receive a text message the day before any visit with an estimated time of arrival.",
    "After we complete a service, we will leave an invoice through your letterbox.",
    "We'll leave any gates closed when we leave.",
    "If we arrive and a gate is locked, we will consider using ladders to gain access if we're confident it is safe and reasonable to do so without risk to health or property.",
  ];

  return (
    <View style={leafletStyles.container}>
      {/* Left Panel - Quote Form */}
      <View style={leafletStyles.leftPanel}>
        {/* Quoted Header */}
        <View style={leafletStyles.quotedHeader}>
          <Text style={leafletStyles.quotedText}>Quoted on</Text>
          <Text style={leafletStyles.quotedSlash}>/</Text>
          <Text style={leafletStyles.quotedSlash}>/</Text>
          <Text style={leafletStyles.quotedText}>By</Text>
        </View>

        {/* Pricing Box */}
        <View style={leafletStyles.pricingBox}>
          <View style={leafletStyles.pricingHeader}>
            <View style={{ flex: 2 }} />
            <Text style={leafletStyles.pricingHeaderText}>1st Service</Text>
            <Text style={leafletStyles.pricingHeaderText}>Maintenance</Text>
          </View>
          <View style={leafletStyles.pricingRow}>
            <Text style={leafletStyles.pricingLabel}>4 Weekly Window Cleaning</Text>
            <Text style={leafletStyles.pricingValue}>£</Text>
            <Text style={leafletStyles.pricingValue}>£</Text>
          </View>
          <View style={leafletStyles.pricingRow}>
            <Text style={leafletStyles.pricingLabel}>8 Weekly Window Cleaning</Text>
            <Text style={leafletStyles.pricingValue}>£</Text>
            <Text style={leafletStyles.pricingValue}>£</Text>
          </View>
          <View style={leafletStyles.pricingRow}>
            <Text style={leafletStyles.pricingLabel}>One-off Service</Text>
            <Text style={leafletStyles.pricingValue}>£</Text>
            <View style={{ flex: 1 }} />
          </View>

          {/* Adhoc Work */}
          <Text style={leafletStyles.adhocTitle}>Adhoc Work</Text>
          {adhocServices.map((service, idx) => (
            <View key={idx} style={leafletStyles.adhocRow}>
              <Text style={leafletStyles.adhocLabel}>{service}</Text>
              <Text style={leafletStyles.adhocValue}>£</Text>
            </View>
          ))}

          {/* Notes */}
          <Text style={leafletStyles.notesTitle}>Notes</Text>
          <View style={leafletStyles.notesArea} />
        </View>

        {/* Service Summary */}
        <View style={leafletStyles.summarySection}>
          <View style={leafletStyles.summaryRow}>
            <View style={leafletStyles.bulletDot} />
            <Text style={leafletStyles.summaryText}>Your windows will be cleaned every         weeks.</Text>
          </View>
          <View style={leafletStyles.summaryRow}>
            <View style={leafletStyles.bulletDot} />
            <Text style={leafletStyles.summaryText}>The cost per service is £</Text>
          </View>
          <View style={leafletStyles.summaryRow}>
            <View style={leafletStyles.bulletDot} />
            <Text style={leafletStyles.summaryText}>Your first service will be on</Text>
          </View>
        </View>
      </View>

      {/* Right Panel - Info */}
      <View style={leafletStyles.rightPanel}>
        {/* What to expect */}
        <Text style={leafletStyles.sectionTitle}>What to expect next</Text>
        {expectations.map((text, idx) => (
          <View key={idx} style={leafletStyles.expectRow}>
            <View style={leafletStyles.bulletDotSmall} />
            <Text style={leafletStyles.expectText}>{text}</Text>
          </View>
        ))}

        {/* Payment */}
        <Text style={leafletStyles.sectionTitle}>Payment</Text>
        
        <Text style={leafletStyles.paymentMethod}>Bank Transfer</Text>
        <Text style={leafletStyles.paymentDetail}>The invoice will have our banking information as follows</Text>
        <Text style={leafletStyles.paymentDetail}>Sort Code: {config.sortCode}</Text>
        <Text style={leafletStyles.paymentDetail}>Account number: {config.accountNumber}</Text>
        <View style={leafletStyles.referenceRow}>
          <Text style={leafletStyles.paymentDetail}>Reference:</Text>
          <View style={leafletStyles.referenceLine} />
        </View>

        <Text style={leafletStyles.paymentMethod}>Direct Debit</Text>
        <Text style={leafletStyles.paymentDetail}>You can see details and set up via our website</Text>
        <Text style={leafletStyles.paymentLink}>{config.websiteAddress}</Text>

        <Text style={leafletStyles.paymentMethod}>Cash and Cheque</Text>
        <Text style={leafletStyles.paymentDetail}>We can take cash or cheque while we're at your Property</Text>
        <Text style={leafletStyles.paymentDetail}>or you can post to:</Text>
        <Text style={leafletStyles.paymentDetail}>{config.businessName}</Text>
        <Text style={leafletStyles.paymentDetail}>{config.businessAddress.line2}, {config.businessAddress.town} {config.businessAddress.postcode}</Text>

        {/* Weather Guarantee */}
        <Text style={leafletStyles.sectionTitle}>Weather & Service Guarantee</Text>
        <Text style={leafletStyles.guaranteeText}>
          We work all year round and into less pleasant weather. The commercial method we use is rain proof. Because of this we offer all our customers a service guarantee as follows:
        </Text>
        <Text style={leafletStyles.guaranteeBold}>
          If you are unsatisfied with the service and get in touch within 24 hours, we will either return to do the service again or write off the cost of the service.
        </Text>
      </View>
    </View>
  );
};

const NewBusinessLeafletBack = ({ config }: { config: MaterialsConfig }) => {
  return (
    <View style={leafletStyles.container}>
      {/* Left Panel - Map */}
      <View style={leafletStyles.mapPanel}>
        {/* Map representation */}
        <View style={leafletStyles.mapBackground}>
          {/* Grid pattern to represent map */}
          <View style={leafletStyles.mapGrid}>
            {[...Array(6)].map((_, i) => (
              <View key={`h${i}`} style={[leafletStyles.mapGridLineH, { top: `${i * 20}%` }]} />
            ))}
            {[...Array(6)].map((_, i) => (
              <View key={`v${i}`} style={[leafletStyles.mapGridLineV, { left: `${i * 20}%` }]} />
            ))}
          </View>
          {/* Service area outline */}
          <View style={leafletStyles.serviceAreaOutline}>
            <Text style={leafletStyles.mapLabel}>Service Area</Text>
          </View>
          {/* Some town markers */}
          <View style={[leafletStyles.townMarker, { top: '30%', left: '40%' }]}>
            <Text style={leafletStyles.townName}>Sleaford</Text>
          </View>
          <View style={[leafletStyles.townMarker, { top: '60%', left: '35%' }]}>
            <Text style={leafletStyles.townName}>Boston</Text>
          </View>
          <View style={[leafletStyles.townMarker, { top: '45%', left: '55%' }]}>
            <Text style={leafletStyles.townName}>Billinghay</Text>
          </View>
        </View>
      </View>

      {/* Right Panel - Branding */}
      <View style={leafletStyles.brandPanel}>
        {/* Logo and Title */}
        <View style={leafletStyles.brandHeader}>
          <View style={leafletStyles.logoCircle}>
            <Ionicons name="home" size={36} color="#fff" />
          </View>
          <View style={leafletStyles.brandText}>
            <Text style={leafletStyles.brandName}>{config.businessName}</Text>
            <Text style={leafletStyles.brandTagline}>{config.tagline}</Text>
          </View>
        </View>

        {/* Team Photo Placeholder */}
        <View style={leafletStyles.photoPlaceholder}>
          <View style={leafletStyles.photoInner}>
            <Ionicons name="people" size={40} color="#888" />
            <Text style={leafletStyles.photoText}>Team Photo</Text>
            <View style={leafletStyles.vanIcon}>
              <Ionicons name="car" size={24} color="#666" />
            </View>
          </View>
        </View>

        {/* Contact Info */}
        <View style={leafletStyles.contactSection}>
          <Text style={leafletStyles.phoneNumber}>{config.mobileNumber}</Text>
          <Text style={leafletStyles.website}>{config.websiteAddress}</Text>
        </View>
      </View>
    </View>
  );
};

export default function MaterialsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const printRef = useRef<View>(null);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [config, setConfig] = useState<MaterialsConfig>(defaultConfig);
  const [loading, setLoading] = useState(true);

  // Load configuration from Firestore
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const ownerId = await getDataOwnerId();
        if (!ownerId) {
          setLoading(false);
          return;
        }
        const docRef = doc(db, 'materialsConfig', ownerId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setConfig({ ...defaultConfig, ...docSnap.data() as MaterialsConfig });
        }
      } catch (error) {
        console.error('Error loading materials config:', error);
      } finally {
        setLoading(false);
      }
    };
    loadConfig();
  }, []);

  // Save configuration to Firestore
  const handleSaveConfig = async (newConfig: MaterialsConfig) => {
    try {
      const ownerId = await getDataOwnerId();
      if (!ownerId) return;
      const docRef = doc(db, 'materialsConfig', ownerId);
      await setDoc(docRef, newConfig);
      setConfig(newConfig);
      alert('Configuration saved successfully!');
    } catch (error) {
      console.error('Error saving materials config:', error);
      alert('Failed to save configuration. Please try again.');
    }
  };

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

        {/* Prominent Configuration Button */}
        <Pressable 
          style={styles.configBanner} 
          onPress={() => setShowConfigModal(true)}
          accessibilityLabel="Configure your business details"
        >
          <View style={styles.configBannerContent}>
            <View style={styles.configBannerIcon}>
              <Ionicons name="settings" size={24} color="#fff" />
            </View>
            <View style={styles.configBannerText}>
              <Text style={styles.configBannerTitle}>Configure Your Business Details</Text>
              <Text style={styles.configBannerSubtitle}>Set up your business name, contact info, banking details & services</Text>
            </View>
            <Ionicons name="chevron-forward" size={24} color="#fff" />
          </View>
        </Pressable>

        {/* Configuration Modal */}
        <ConfigurationModal
          visible={showConfigModal}
          onClose={() => setShowConfigModal(false)}
          config={config}
          onSave={handleSaveConfig}
        />

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
                <InvoiceFront config={config} />
              </View>
              <View style={styles.invoiceWrapper}>
                <Text style={styles.invoiceLabel}>Back</Text>
                <InvoiceBack config={config} />
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
              {Platform.OS === 'web' && (
                <Pressable style={styles.downloadButton} onPress={() => alert('Flyer PDF download coming soon')}>
                  <Ionicons name="download-outline" size={18} color="#fff" />
                  <Text style={styles.downloadButtonText}>Download PDF</Text>
                </Pressable>
              )}
            </View>
            
            <View style={styles.invoiceRow}>
              <View style={styles.invoiceWrapper}>
                <Text style={styles.invoiceLabel}>Front</Text>
                <FlyerFront config={config} />
              </View>
              <View style={styles.invoiceWrapper}>
                <Text style={styles.invoiceLabel}>Back</Text>
                <FlyerBack config={config} />
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
              {Platform.OS === 'web' && (
                <Pressable style={styles.downloadButton} onPress={() => alert('Canvassing Flyer PDF download coming soon')}>
                  <Ionicons name="download-outline" size={18} color="#fff" />
                  <Text style={styles.downloadButtonText}>Download PDF</Text>
                </Pressable>
              )}
            </View>
            
            <View style={styles.invoiceRow}>
              <View style={styles.invoiceWrapper}>
                <Text style={styles.invoiceLabel}>Front</Text>
                <CanvassingFlyerFront config={config} />
              </View>
              <View style={styles.invoiceWrapper}>
                <Text style={styles.invoiceLabel}>Back</Text>
                <CanvassingFlyerBack config={config} />
              </View>
            </View>
          </View>

          {/* New Business Leaflet Section */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View>
                <Text style={styles.sectionTitle}>New Business Leaflet</Text>
                <Text style={styles.sectionSubtitle}>Tri-fold leaflet for new customer quotes</Text>
              </View>
              {Platform.OS === 'web' && (
                <Pressable style={styles.downloadButton} onPress={() => alert('New Business Leaflet PDF download coming soon')}>
                  <Ionicons name="download-outline" size={18} color="#fff" />
                  <Text style={styles.downloadButtonText}>Download PDF</Text>
                </Pressable>
              )}
            </View>
            
            <ScrollView horizontal showsHorizontalScrollIndicator={true} style={styles.leafletScroll}>
              <View style={styles.invoiceRow}>
                <View style={styles.invoiceWrapper}>
                  <Text style={styles.invoiceLabel}>Front</Text>
                  <NewBusinessLeafletFront config={config} />
                </View>
                <View style={styles.invoiceWrapper}>
                  <Text style={styles.invoiceLabel}>Back</Text>
                  <NewBusinessLeafletBack config={config} />
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
  configBanner: {
    backgroundColor: '#007AFF',
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
    borderRadius: 12,
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  configBannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  configBannerIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  configBannerText: {
    flex: 1,
  },
  configBannerTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  configBannerSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.9)',
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

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  container: {
    backgroundColor: '#fff',
    borderRadius: 12,
    width: '100%',
    maxWidth: 500,
    maxHeight: '90%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  closeButton: {
    padding: 4,
  },
  content: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#007AFF',
    marginTop: 16,
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  hint: {
    fontSize: 11,
    color: '#666',
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    marginBottom: 12,
    backgroundColor: '#fafafa',
  },
  multilineInput: {
    height: 150,
    textAlignVertical: 'top',
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  halfField: {
    flex: 1,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    gap: 12,
  },
  cancelButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#007AFF',
    gap: 8,
  },
  saveButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
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
  topSection: {
    flexDirection: 'row',
    gap: 12,
  },
  bottomSection: {
    flexDirection: 'row',
    gap: 12,
    flex: 1,
    alignItems: 'stretch',
  },
  topLeftColumn: {
    flex: 1,
  },
  topRightColumn: {
    flex: 1,
  },
  bottomLeftColumn: {
    flex: 1,
  },
  bottomRightColumn: {
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
  brandingSectionFlex: {
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 12,
    flex: 1,
    justifyContent: 'center',
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

const flyerStyles = StyleSheet.create({
  container: {
    width: INVOICE_WIDTH,
    height: INVOICE_HEIGHT,
    backgroundColor: '#fff',
    borderRadius: 8,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  headerGradient: {
    backgroundColor: '#e8f4f8',
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  brandingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#555',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  brandingText: {
    flex: 1,
  },
  brandName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  brandNameBlue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4A90A4',
  },
  tagline: {
    fontSize: 10,
    color: '#333',
    marginTop: 2,
  },
  mainContent: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  checkCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#4A90A4',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
    marginTop: 2,
  },
  bulletText: {
    flex: 1,
    fontSize: 11,
    color: '#333',
    lineHeight: 16,
  },
  quoteContainer: {
    alignItems: 'flex-end',
    marginTop: 8,
  },
  quoteContainerBack: {
    position: 'absolute',
    bottom: 10,
    right: 10,
  },
  quoteBadge: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  quoteFree: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
  },
  quoteText: {
    fontSize: 14,
    color: '#fff',
  },
  footer: {
    backgroundColor: '#4A90A4',
    paddingTop: 24,
    paddingBottom: 12,
    paddingHorizontal: 16,
    position: 'relative',
  },
  footerCurve: {
    position: 'absolute',
    top: -20,
    left: 0,
    right: 0,
    height: 40,
    backgroundColor: '#4A90A4',
    borderTopLeftRadius: 100,
    borderTopRightRadius: 200,
  },
  footerContent: {
    position: 'relative',
    zIndex: 1,
  },
  footerCta: {
    fontSize: 10,
    color: '#fff',
    marginBottom: 4,
  },
  phoneNumber: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  contactText: {
    fontSize: 10,
    color: '#fff',
  },
  dropletsLeft: {
    position: 'absolute',
    bottom: 8,
    left: 16,
    flexDirection: 'row',
    gap: 4,
  },
  dropletsRight: {
    position: 'absolute',
    bottom: 12,
    right: 16,
    flexDirection: 'row',
    gap: 4,
  },
  // Back styles
  backBackground: {
    flex: 1,
    backgroundColor: '#8B4513',
    position: 'relative',
  },
  beforeAfterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 8,
  },
  beforeLabel: {
    fontSize: 12,
    color: '#fff',
    fontWeight: 'bold',
  },
  afterLabel: {
    fontSize: 12,
    color: '#fff',
    fontWeight: 'bold',
  },
  roofDecoration: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  roofLine: {
    width: '80%',
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.3)',
    marginVertical: 4,
    transform: [{ skewY: '-5deg' }],
  },
  roofSpire: {
    position: 'absolute',
    top: '20%',
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderBottomWidth: 30,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: 'rgba(255,255,255,0.5)',
  },
  servicesSection: {
    backgroundColor: 'rgba(255,255,255,0.95)',
    padding: 12,
    position: 'relative',
  },
  additionalTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
  },
  serviceRow: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  serviceItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  checkCircleSmall: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#4A90A4',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 6,
    marginTop: 1,
  },
  serviceText: {
    flex: 1,
    fontSize: 9,
    color: '#333',
    lineHeight: 13,
  },
});

const canvassingStyles = StyleSheet.create({
  container: {
    width: INVOICE_WIDTH,
    height: INVOICE_HEIGHT,
    backgroundColor: '#fff',
    borderRadius: 8,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  headerArea: {
    flex: 1,
    backgroundColor: '#f0f7fa',
    paddingTop: 20,
    paddingHorizontal: 20,
    position: 'relative',
  },
  brandingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  logoCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#555',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  brandingText: {
    flex: 1,
  },
  brandName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  brandNameBlue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4A90A4',
  },
  tagline: {
    fontSize: 9,
    color: '#333',
    marginTop: 2,
  },
  servicesSection: {
    marginBottom: 16,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  checkCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: '#4A90A4',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
    marginTop: 2,
  },
  bulletText: {
    flex: 1,
    fontSize: 11,
    color: '#333',
    lineHeight: 15,
  },
  dropletsDecoration: {
    position: 'absolute',
    bottom: 10,
    right: 20,
    flexDirection: 'row',
    gap: 4,
  },
  quoteSection: {
    backgroundColor: '#e8f0f5',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#d0dde5',
  },
  quoteExplanation: {
    fontSize: 10,
    color: '#333',
    textAlign: 'center',
    marginBottom: 4,
    fontWeight: '600',
  },
  quoteNote: {
    fontSize: 9,
    color: '#666',
    textAlign: 'center',
    marginBottom: 12,
  },
  priceBoxRow: {
    flexDirection: 'row',
    gap: 12,
  },
  priceBox: {
    flex: 1,
  },
  priceLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  priceField: {
    height: 28,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 4,
  },
  priceFieldWithBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  percentBadge: {
    backgroundColor: '#4A90A4',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  percentText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#fff',
  },
  // Back styles
  backBackground: {
    flex: 1,
    backgroundColor: '#a0a080',
    position: 'relative',
    overflow: 'hidden',
  },
  roofPattern: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 20,
  },
  roofSpireCenter: {
    width: 8,
    height: 40,
    backgroundColor: 'rgba(255,255,255,0.6)',
    marginBottom: 10,
  },
  roofBeam: {
    position: 'absolute',
    top: 60,
    width: 200,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  servicesOverlay: {
    position: 'absolute',
    top: '20%',
    left: 16,
    right: 16,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 8,
    padding: 14,
  },
  additionalTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
    marginBottom: 12,
  },
  serviceRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  serviceItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  checkCircleBack: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#4A90A4',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 6,
    marginTop: 1,
  },
  serviceText: {
    flex: 1,
    fontSize: 10,
    color: '#333',
    lineHeight: 14,
  },
  waterDroplets: {
    position: 'absolute',
    bottom: 80,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  footer: {
    backgroundColor: '#4A90A4',
    paddingTop: 24,
    paddingBottom: 16,
    paddingHorizontal: 16,
    position: 'relative',
  },
  footerCurve: {
    position: 'absolute',
    top: -20,
    left: 0,
    right: 0,
    height: 40,
    backgroundColor: '#4A90A4',
    borderTopLeftRadius: 100,
    borderTopRightRadius: 200,
  },
  footerContent: {
    position: 'relative',
    zIndex: 1,
    alignItems: 'center',
  },
  footerCta: {
    fontSize: 12,
    color: '#fff',
    marginBottom: 4,
    fontStyle: 'italic',
  },
  phoneNumber: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  contactText: {
    fontSize: 11,
    color: '#fff',
  },
});

const leafletStyles = StyleSheet.create({
  container: {
    width: LEAFLET_WIDTH,
    height: INVOICE_HEIGHT,
    backgroundColor: '#e8f0f5',
    borderRadius: 8,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    flexDirection: 'row',
  },
  // Front - Left Panel
  leftPanel: {
    flex: 1,
    padding: 12,
    borderRightWidth: 1,
    borderRightColor: '#ccc',
  },
  quotedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333',
    padding: 6,
    marginBottom: 8,
    backgroundColor: '#fff',
    gap: 12,
  },
  quotedText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#333',
  },
  quotedSlash: {
    fontSize: 12,
    color: '#333',
  },
  pricingBox: {
    borderWidth: 2,
    borderColor: '#333',
    padding: 8,
    backgroundColor: '#fff',
    flex: 1,
  },
  pricingHeader: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  pricingHeaderText: {
    flex: 1,
    fontSize: 8,
    textAlign: 'center',
    color: '#333',
  },
  pricingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  pricingLabel: {
    flex: 2,
    fontSize: 10,
    color: '#333',
  },
  pricingValue: {
    flex: 1,
    fontSize: 10,
    textAlign: 'center',
    color: '#333',
  },
  adhocTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 8,
    marginBottom: 4,
  },
  adhocRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 1,
  },
  adhocLabel: {
    flex: 1,
    fontSize: 9,
    color: '#333',
  },
  adhocValue: {
    fontSize: 9,
    color: '#333',
    width: 20,
    textAlign: 'right',
  },
  notesTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 8,
    marginBottom: 4,
  },
  notesArea: {
    flex: 1,
    minHeight: 40,
  },
  summarySection: {
    borderTopWidth: 2,
    borderTopColor: '#333',
    paddingTop: 8,
    marginTop: 8,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  bulletDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#333',
    marginRight: 8,
    marginTop: 2,
  },
  summaryText: {
    flex: 1,
    fontSize: 10,
    color: '#333',
  },
  // Front - Right Panel
  rightPanel: {
    flex: 1,
    padding: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 6,
    marginTop: 8,
  },
  expectRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  bulletDotSmall: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#333',
    marginRight: 6,
    marginTop: 4,
  },
  expectText: {
    flex: 1,
    fontSize: 8,
    color: '#333',
    lineHeight: 11,
  },
  paymentMethod: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 6,
  },
  paymentDetail: {
    fontSize: 8,
    color: '#333',
    marginLeft: 8,
    lineHeight: 11,
  },
  paymentLink: {
    fontSize: 8,
    color: '#333',
    marginLeft: 8,
  },
  referenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
  },
  referenceLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#333',
    marginLeft: 4,
  },
  guaranteeText: {
    fontSize: 8,
    color: '#333',
    lineHeight: 11,
    marginBottom: 4,
  },
  guaranteeBold: {
    fontSize: 8,
    fontWeight: 'bold',
    color: '#333',
    lineHeight: 11,
  },
  // Back - Map Panel
  mapPanel: {
    flex: 1,
    backgroundColor: '#8B9A6B',
  },
  mapBackground: {
    flex: 1,
    position: 'relative',
  },
  mapGrid: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  mapGridLineH: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  mapGridLineV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  serviceAreaOutline: {
    position: 'absolute',
    top: '15%',
    left: '15%',
    right: '15%',
    bottom: '15%',
    borderWidth: 3,
    borderColor: 'rgba(100,150,255,0.6)',
    backgroundColor: 'rgba(100,150,255,0.15)',
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mapLabel: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    fontWeight: 'bold',
  },
  townMarker: {
    position: 'absolute',
    backgroundColor: 'rgba(255,255,255,0.9)',
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
  },
  townName: {
    fontSize: 8,
    color: '#333',
  },
  // Back - Brand Panel
  brandPanel: {
    flex: 1,
    backgroundColor: '#e8f0f5',
    padding: 16,
  },
  brandHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  logoCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#555',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  brandText: {
    flex: 1,
  },
  brandName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  brandNameLight: {
    fontWeight: '400',
    color: '#555',
  },
  brandTagline: {
    fontSize: 11,
    color: '#666',
    fontStyle: 'italic',
  },
  photoPlaceholder: {
    flex: 1,
    backgroundColor: '#ddd',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#333',
    marginBottom: 16,
    overflow: 'hidden',
  },
  photoInner: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ccc',
  },
  photoText: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  vanIcon: {
    position: 'absolute',
    bottom: 10,
    right: 10,
  },
  contactSection: {
    alignItems: 'center',
  },
  phoneNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  website: {
    fontSize: 12,
    color: '#333',
  },
});
