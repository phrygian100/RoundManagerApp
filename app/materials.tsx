import { Ionicons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import { useRouter } from 'expo-router';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import html2canvas from 'html2canvas';
import React, { useEffect, useRef, useState } from 'react';
import { Image as RNImage, Modal, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import PermissionGate from '../components/PermissionGate';
import { db } from '../core/firebase';
import { getDataOwnerId } from '../core/session';
import { getUserProfile } from '../services/userService';

const INVOICE_HEIGHT = 580;
const INVOICE_WIDTH = 400;

// Preset images for flyer back
const FLYER_BACK_PRESETS = {
  conservatory: require('../assets/presets/flyer-back/ConservatoryroofBeforeandAfter.jpg'),
};
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

// Item-specific configuration types
type ReferralReward = '£5' | '£10' | '£15' | '£20' | 'One free service' | 'Other...';

interface InvoiceItemConfig {
  showServicesProvidedOn: boolean;
  showDirectDebit: boolean;
  showCash: boolean;
  showBusinessAddress: boolean;
  showManageAccountOnline: boolean;
  showReferralScheme: boolean;
  referralReward: ReferralReward;
  customRewardText: string;
  showNotesWhitespace: boolean;
  showCustomText: boolean;
  customText: string;
  workCompletedServices: string;
}

interface FlyerItemConfig {
  showServices: boolean;
  showQuoteBadge: boolean;
  promoPhotoUrl: string;
  promoPhotoPreset: string; // 'conservatory' | 'custom'
  showBeforeAfter: boolean;
  servicesText: string;
  additionalServicesText: string;
}

interface CanvassingFlyerItemConfig {
  showPriceBoxes: boolean;
  showAdditionalServices: boolean;
  showContactInfo: boolean;
}

interface LeafletItemConfig {
  showPricingTable: boolean;
  showPaymentMethods: boolean;
  showServiceArea: boolean;
}

const defaultInvoiceItemConfig: InvoiceItemConfig = {
  showServicesProvidedOn: true,
  showDirectDebit: true,
  showCash: true,
  showBusinessAddress: true,
  showManageAccountOnline: true,
  showReferralScheme: false,
  referralReward: '£5',
  customRewardText: '',
  showNotesWhitespace: false,
  showCustomText: false,
  customText: '',
  workCompletedServices: 'Exterior window cleaning\nGutter Clearing\nSoffits, Fascias\nConservatory Roof\nSolar Panels\nUPVc Restoration',
};

const defaultFlyerItemConfig: FlyerItemConfig = {
  showServices: true,
  showQuoteBadge: true,
  promoPhotoUrl: '',
  promoPhotoPreset: 'conservatory', // Default to preset image
  showBeforeAfter: true,
  servicesText: 'Routine service every 4 or 8 weeks\nFull property, including doors, sills and frames\nSimple payment system\nETA text message a day before any visit',
  additionalServicesText: 'Gutter Cleaning\nConservatory Roof Cleaning\nSolar Panel Cleaning\nSoffit And Fascia Cleaning',
};

const defaultCanvassingFlyerItemConfig: CanvassingFlyerItemConfig = {
  showPriceBoxes: true,
  showAdditionalServices: true,
  showContactInfo: true,
};

const defaultLeafletItemConfig: LeafletItemConfig = {
  showPricingTable: true,
  showPaymentMethods: true,
  showServiceArea: true,
};

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
  const [uploadingLogo, setUploadingLogo] = useState(false);

  useEffect(() => {
    setFormData(config);
  }, [config, visible]);

  const handleSave = () => {
    onSave(formData);
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

  const handleLogoUpload = () => {
    if (Platform.OS !== 'web') {
      alert('Logo upload is only available on web');
      return;
    }
    
    // Create a file input and trigger it
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;
      
      // Check file size (max 2MB for base64 storage to support high-res logos)
      if (file.size > 2 * 1024 * 1024) {
        alert('Image too large. Please choose an image under 2MB.');
        return;
      }
      
      setUploadingLogo(true);
      try {
        // Load image (use DOM img element; avoid shadowing RN `Image` component)
        const img = document.createElement('img');
        img.onload = () => {
          try {
            // Determine optimal dimensions
            // Max 1024px for high quality while keeping file size reasonable
            const maxDimension = 1024;
            let targetWidth = img.width;
            let targetHeight = img.height;
            
            if (img.width > maxDimension || img.height > maxDimension) {
              const scale = maxDimension / Math.max(img.width, img.height);
              targetWidth = Math.round(img.width * scale);
              targetHeight = Math.round(img.height * scale);
            }
            
            // Create canvas at target dimensions
            const canvas = document.createElement('canvas');
            canvas.width = targetWidth;
            canvas.height = targetHeight;
            
            const ctx = canvas.getContext('2d');
            if (!ctx) {
              alert('Failed to process image');
              setUploadingLogo(false);
              return;
            }
            
            // Draw image (resized if needed)
            ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
            
            // Try JPEG first with high quality (better compression for photos)
            let base64 = canvas.toDataURL('image/jpeg', 0.92);
            
            // If still too large (very rare), try lower quality
            if (base64.length > 1.5 * 1024 * 1024) {
              base64 = canvas.toDataURL('image/jpeg', 0.85);
            }
            
            setFormData(prev => ({ ...prev, logoUrl: base64 }));
            setUploadingLogo(false);
          } catch (error) {
            console.error('Error processing image:', error);
            alert('Failed to process image');
            setUploadingLogo(false);
          }
        };
        img.onerror = () => {
          alert('Failed to load image file');
          setUploadingLogo(false);
        };
        
        // Read file and set as image source
        const reader = new FileReader();
        reader.onloadend = () => {
          img.src = reader.result as string;
        };
        reader.onerror = () => {
          alert('Failed to read image file');
          setUploadingLogo(false);
        };
        reader.readAsDataURL(file);
      } catch (error) {
        console.error('Error uploading logo:', error);
        alert('Failed to upload logo');
        setUploadingLogo(false);
      }
    };
    input.click();
  };

  const handleRemoveLogo = () => {
    setFormData(prev => ({ ...prev, logoUrl: '' }));
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

            <Text style={modalStyles.label}>Logo (optional)</Text>
            <View style={modalStyles.logoUploadContainer}>
              {formData.logoUrl ? (
                <View style={modalStyles.logoPreviewContainer}>
                  <RNImage 
                    source={{ uri: formData.logoUrl }} 
                    style={modalStyles.logoPreview}
                    resizeMode="contain"
                  />
                  <Pressable style={modalStyles.removeLogoButton} onPress={handleRemoveLogo}>
                    <Ionicons name="close-circle" size={24} color="#ff4444" />
                  </Pressable>
                </View>
              ) : (
                <Pressable 
                  style={modalStyles.uploadLogoButton} 
                  onPress={handleLogoUpload}
                  disabled={uploadingLogo}
                >
                  {uploadingLogo ? (
                    <Text style={modalStyles.uploadLogoText}>Uploading...</Text>
                  ) : (
                    <>
                      <Ionicons name="cloud-upload-outline" size={24} color="#007AFF" />
                      <Text style={modalStyles.uploadLogoText}>Upload Logo</Text>
                    </>
                  )}
                </Pressable>
              )}
              <Text style={modalStyles.logoHint}>Max 2MB. Square images work best.</Text>
            </View>

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

            {/* Banking Details */}
            <Text style={modalStyles.sectionTitle}>Banking Details</Text>

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

// Item Configuration Modal Component
type ItemConfigType = 'invoice' | 'flyer' | 'canvassing' | 'leaflet';

const ItemConfigurationModal = ({ 
  visible, 
  onClose, 
  itemType,
  invoiceConfig,
  flyerConfig,
  canvassingConfig,
  leafletConfig,
  onSaveInvoice,
  onSaveFlyer,
  onSaveCanvassing,
  onSaveLeaflet,
}: { 
  visible: boolean; 
  onClose: () => void; 
  itemType: ItemConfigType;
  invoiceConfig: InvoiceItemConfig;
  flyerConfig: FlyerItemConfig;
  canvassingConfig: CanvassingFlyerItemConfig;
  leafletConfig: LeafletItemConfig;
  onSaveInvoice: (config: InvoiceItemConfig) => void;
  onSaveFlyer: (config: FlyerItemConfig) => void;
  onSaveCanvassing: (config: CanvassingFlyerItemConfig) => void;
  onSaveLeaflet: (config: LeafletItemConfig) => void;
}) => {
  const [invoiceForm, setInvoiceForm] = useState<InvoiceItemConfig>(invoiceConfig);
  const [flyerForm, setFlyerForm] = useState<FlyerItemConfig>(flyerConfig);
  const [canvassingForm, setCanvassingForm] = useState<CanvassingFlyerItemConfig>(canvassingConfig);
  const [leafletForm, setLeafletForm] = useState<LeafletItemConfig>(leafletConfig);
  const [uploadingPromoPhoto, setUploadingPromoPhoto] = useState(false);

  useEffect(() => {
    setInvoiceForm(invoiceConfig);
    setFlyerForm(flyerConfig);
    setCanvassingForm(canvassingConfig);
    setLeafletForm(leafletConfig);
  }, [invoiceConfig, flyerConfig, canvassingConfig, leafletConfig, visible]);

  const handlePromoPhotoUpload = () => {
    if (Platform.OS !== 'web') {
      alert('Photo upload is only available on web.');
      return;
    }
    
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;
      
      if (file.size > 5 * 1024 * 1024) {
        alert('Image too large. Please choose an image under 5MB.');
        return;
      }
      
      setUploadingPromoPhoto(true);
      try {
        const img = document.createElement('img');
        img.onload = () => {
          try {
            const maxDimension = 1024;
            let targetWidth = img.width;
            let targetHeight = img.height;
            
            if (img.width > maxDimension || img.height > maxDimension) {
              const scale = maxDimension / Math.max(img.width, img.height);
              targetWidth = Math.round(img.width * scale);
              targetHeight = Math.round(img.height * scale);
            }
            
            const canvas = document.createElement('canvas');
            canvas.width = targetWidth;
            canvas.height = targetHeight;
            
            const ctx = canvas.getContext('2d');
            if (!ctx) {
              alert('Failed to process image');
              setUploadingPromoPhoto(false);
              return;
            }
            
            ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
            
            let base64 = canvas.toDataURL('image/jpeg', 0.92);
            if (base64.length > 1.5 * 1024 * 1024) {
              base64 = canvas.toDataURL('image/jpeg', 0.85);
            }
            
            setFlyerForm(prev => ({ ...prev, promoPhotoUrl: base64 }));
            setUploadingPromoPhoto(false);
          } catch (error) {
            console.error('Error processing image:', error);
            alert('Failed to process image');
            setUploadingPromoPhoto(false);
          }
        };
        img.onerror = () => {
          alert('Failed to load image file');
          setUploadingPromoPhoto(false);
        };
        
        const reader = new FileReader();
        reader.onloadend = () => {
          img.src = reader.result as string;
        };
        reader.onerror = () => {
          alert('Failed to read image file');
          setUploadingPromoPhoto(false);
        };
        reader.readAsDataURL(file);
      } catch (error) {
        console.error('Error uploading promo photo:', error);
        alert('Failed to upload photo');
        setUploadingPromoPhoto(false);
      }
    };
    input.click();
  };

  const handleRemovePromoPhoto = () => {
    setFlyerForm(prev => ({ ...prev, promoPhotoUrl: '' }));
  };

  const handleSave = () => {
    switch (itemType) {
      case 'invoice':
        onSaveInvoice(invoiceForm);
        break;
      case 'flyer':
        onSaveFlyer(flyerForm);
        break;
      case 'canvassing':
        onSaveCanvassing(canvassingForm);
        break;
      case 'leaflet':
        onSaveLeaflet(leafletForm);
        break;
    }
    onClose();
  };

  const getTitle = () => {
    switch (itemType) {
      case 'invoice': return 'Invoice Options';
      case 'flyer': return 'Flyer Options';
      case 'canvassing': return 'Canvassing Flyer Options';
      case 'leaflet': return 'New Business Leaflet Options';
    }
  };

  const CheckboxRow = ({ label, checked, onToggle }: { label: string; checked: boolean; onToggle: () => void }) => (
    <Pressable style={itemConfigStyles.checkboxRow} onPress={onToggle}>
      <View style={[itemConfigStyles.checkbox, checked && itemConfigStyles.checkboxChecked]}>
        {checked && <Ionicons name="checkmark" size={16} color="#fff" />}
      </View>
      <Text style={itemConfigStyles.checkboxLabel}>{label}</Text>
    </Pressable>
  );

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={itemConfigStyles.overlay}>
        <View style={itemConfigStyles.container}>
          <View style={itemConfigStyles.header}>
            <Text style={itemConfigStyles.title}>{getTitle()}</Text>
            <Pressable onPress={onClose} style={itemConfigStyles.closeButton}>
              <Ionicons name="close" size={24} color="#333" />
            </Pressable>
          </View>

          <ScrollView style={itemConfigStyles.content} showsVerticalScrollIndicator={false}>
            {itemType === 'invoice' && (
              <>
                <Text style={itemConfigStyles.sectionTitle}>Include Sections</Text>
                <CheckboxRow 
                  label="Services provided on" 
                  checked={invoiceForm.showServicesProvidedOn} 
                  onToggle={() => setInvoiceForm(prev => ({ ...prev, showServicesProvidedOn: !prev.showServicesProvidedOn }))} 
                />
                <CheckboxRow 
                  label="Direct Debit" 
                  checked={invoiceForm.showDirectDebit} 
                  onToggle={() => setInvoiceForm(prev => ({ ...prev, showDirectDebit: !prev.showDirectDebit }))} 
                />
                <CheckboxRow 
                  label="Cash" 
                  checked={invoiceForm.showCash} 
                  onToggle={() => setInvoiceForm(prev => ({ ...prev, showCash: !prev.showCash }))} 
                />
                <CheckboxRow 
                  label="Include Business Address" 
                  checked={invoiceForm.showBusinessAddress} 
                  onToggle={() => setInvoiceForm(prev => ({ ...prev, showBusinessAddress: !prev.showBusinessAddress }))} 
                />
                
                {/* Work Completed / Services */}
                <Text style={[itemConfigStyles.pickerLabel, { marginTop: 12 }]}>Work Completed / Services</Text>
                <Text style={{ fontSize: 11, color: '#888', marginBottom: 6 }}>Enter each service on a new line</Text>
                <TextInput
                  style={itemConfigStyles.customTextInput}
                  value={invoiceForm.workCompletedServices}
                  onChangeText={(text) => setInvoiceForm(prev => ({ ...prev, workCompletedServices: text }))}
                  placeholder="Exterior window cleaning&#10;Gutter cleaning&#10;..."
                  multiline
                  numberOfLines={6}
                />
                
                <View style={itemConfigStyles.divider} />
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={itemConfigStyles.sectionTitle}>ON THE BACK</Text>
                  <Text style={{ fontSize: 11, color: '#666', fontStyle: 'italic' }}>(choose up to 3)</Text>
                </View>
                <CheckboxRow 
                  label="Manage Your Account Online" 
                  checked={invoiceForm.showManageAccountOnline} 
                  onToggle={() => {
                    const currentCount = [
                      invoiceForm.showManageAccountOnline,
                      invoiceForm.showReferralScheme,
                      invoiceForm.showNotesWhitespace,
                      invoiceForm.showCustomText,
                    ].filter(Boolean).length;
                    
                    if (!invoiceForm.showManageAccountOnline && currentCount >= 3) return;
                    setInvoiceForm(prev => ({ ...prev, showManageAccountOnline: !prev.showManageAccountOnline }));
                  }} 
                />
                <CheckboxRow 
                  label="Enable Referral Scheme" 
                  checked={invoiceForm.showReferralScheme} 
                  onToggle={() => {
                    const currentCount = [
                      invoiceForm.showManageAccountOnline,
                      invoiceForm.showReferralScheme,
                      invoiceForm.showNotesWhitespace,
                      invoiceForm.showCustomText,
                    ].filter(Boolean).length;
                    
                    if (!invoiceForm.showReferralScheme && currentCount >= 3) return;
                    setInvoiceForm(prev => ({ ...prev, showReferralScheme: !prev.showReferralScheme }));
                  }} 
                />
                {invoiceForm.showReferralScheme && (
                  <>
                    <View style={itemConfigStyles.pickerRow}>
                      <Text style={itemConfigStyles.pickerLabel}>Reward</Text>
                      <View style={itemConfigStyles.pickerContainer}>
                        <Picker
                          selectedValue={invoiceForm.referralReward}
                          onValueChange={(value) => setInvoiceForm(prev => ({ ...prev, referralReward: value as any }))}
                        >
                          <Picker.Item label="£5" value="£5" />
                          <Picker.Item label="£10" value="£10" />
                          <Picker.Item label="£15" value="£15" />
                          <Picker.Item label="£20" value="£20" />
                          <Picker.Item label="One free service" value="One free service" />
                          <Picker.Item label="Other..." value="Other..." />
                        </Picker>
                      </View>
                    </View>
                    {invoiceForm.referralReward === 'Other...' && (
                      <View style={itemConfigStyles.pickerRow}>
                        <Text style={itemConfigStyles.pickerLabel}>Custom reward text</Text>
                        <TextInput
                          style={itemConfigStyles.textInput}
                          value={invoiceForm.customRewardText}
                          onChangeText={(text) => setInvoiceForm(prev => ({ ...prev, customRewardText: text }))}
                          placeholder="e.g., £25, Two free services, etc."
                        />
                      </View>
                    )}
                  </>
                )}

                <CheckboxRow
                  label="White space for notes"
                  checked={invoiceForm.showNotesWhitespace}
                  onToggle={() => {
                    const currentCount = [
                      invoiceForm.showManageAccountOnline,
                      invoiceForm.showReferralScheme,
                      invoiceForm.showNotesWhitespace,
                      invoiceForm.showCustomText,
                    ].filter(Boolean).length;
                    
                    if (!invoiceForm.showNotesWhitespace && currentCount >= 3) return;
                    setInvoiceForm(prev => ({ ...prev, showNotesWhitespace: !prev.showNotesWhitespace }));
                  }}
                />
                <CheckboxRow
                  label="Custom Text"
                  checked={invoiceForm.showCustomText}
                  onToggle={() => {
                    const currentCount = [
                      invoiceForm.showManageAccountOnline,
                      invoiceForm.showReferralScheme,
                      invoiceForm.showNotesWhitespace,
                      invoiceForm.showCustomText,
                    ].filter(Boolean).length;
                    
                    if (!invoiceForm.showCustomText && currentCount >= 3) return;
                    setInvoiceForm(prev => ({ ...prev, showCustomText: !prev.showCustomText }));
                  }}
                />
                {invoiceForm.showCustomText && (() => {
                  // Calculate dynamic limits based on number of selected ON THE BACK items
                  const backItemCount = [
                    invoiceForm.showManageAccountOnline,
                    invoiceForm.showReferralScheme,
                    invoiceForm.showNotesWhitespace,
                    invoiceForm.showCustomText,
                  ].filter(Boolean).length;
                  
                  let maxChars = 250;
                  let maxLines = 7;
                  if (backItemCount === 1) {
                    maxChars = 750;
                    maxLines = 21;
                  } else if (backItemCount === 2) {
                    maxChars = 500;
                    maxLines = 14;
                  }
                  
                  const currentNewlines = (invoiceForm.customText.match(/\n/g) || []).length;
                  
                  return (
                    <View style={itemConfigStyles.pickerRow}>
                      <Text style={itemConfigStyles.pickerLabel}>
                        Custom text (max {maxChars} characters, {maxLines} lines)
                      </Text>
                      <TextInput
                        style={[itemConfigStyles.customTextInput]}
                        value={invoiceForm.customText}
                        onChangeText={(t) => {
                          // Limit to max characters
                          let text = t.slice(0, maxChars);
                          // Limit to max newlines
                          const newlineCount = (text.match(/\n/g) || []).length;
                          if (newlineCount > maxLines) {
                            // Remove excess newlines from the end
                            const lines = text.split('\n');
                            text = lines.slice(0, maxLines + 1).join('\n');
                          }
                          setInvoiceForm(prev => ({ ...prev, customText: text }));
                        }}
                        placeholder="Enter custom message..."
                        multiline
                        numberOfLines={5}
                      />
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', width: '100%' }}>
                        <Text style={itemConfigStyles.charCount}>
                          {invoiceForm.customText.length}/{maxChars} chars
                        </Text>
                        <Text style={itemConfigStyles.charCount}>
                          {currentNewlines}/{maxLines} lines
                        </Text>
                      </View>
                    </View>
                  );
                })()}
              </>
            )}

            {itemType === 'flyer' && (
              <>
                <Text style={itemConfigStyles.sectionTitle}>Front</Text>
                <CheckboxRow 
                  label="FREE Quote Badge" 
                  checked={flyerForm.showQuoteBadge} 
                  onToggle={() => setFlyerForm(prev => ({ ...prev, showQuoteBadge: !prev.showQuoteBadge }))} 
                />
                <CheckboxRow 
                  label="Services List" 
                  checked={flyerForm.showServices} 
                  onToggle={() => setFlyerForm(prev => ({ ...prev, showServices: !prev.showServices }))} 
                />
                
                {/* Services text input - only show when services is enabled */}
                {flyerForm.showServices && (
                  <View style={{ marginTop: 8, marginBottom: 8 }}>
                    <TextInput
                      style={itemConfigStyles.customTextInput}
                      value={flyerForm.servicesText}
                      onChangeText={(text) => setFlyerForm(prev => ({ ...prev, servicesText: text }))}
                      placeholder="Enter services (one per line)"
                      multiline
                      numberOfLines={6}
                    />
                  </View>
                )}
                
                <Text style={[itemConfigStyles.sectionTitle, { marginTop: 16 }]}>Back</Text>
                
                <CheckboxRow 
                  label="Show Before/After Labels" 
                  checked={flyerForm.showBeforeAfter} 
                  onToggle={() => setFlyerForm(prev => ({ ...prev, showBeforeAfter: !prev.showBeforeAfter }))} 
                />
                
                {/* Preset selection */}
                <View style={[itemConfigStyles.pickerRow, { marginTop: 8 }]}>
                  <Text style={itemConfigStyles.pickerLabel}>Promo Photo</Text>
                  <View style={itemConfigStyles.pickerContainer}>
                    <Picker
                      selectedValue={flyerForm.promoPhotoPreset}
                      onValueChange={(value) => setFlyerForm(prev => ({ ...prev, promoPhotoPreset: value }))}
                      style={{ height: 50 }}
                    >
                      <Picker.Item label="Conservatory Roof (Before/After)" value="conservatory" />
                      <Picker.Item label="Upload Custom Photo" value="custom" />
                    </Picker>
                  </View>
                </View>
                
                {/* Custom upload section - only show when custom is selected */}
                {flyerForm.promoPhotoPreset === 'custom' && (
                  <View style={[itemConfigStyles.photoUploadContainer, { marginTop: 12 }]}>
                    {flyerForm.promoPhotoUrl ? (
                      <View style={itemConfigStyles.photoPreviewContainer}>
                        <RNImage 
                          source={{ uri: flyerForm.promoPhotoUrl }} 
                          style={itemConfigStyles.photoPreview}
                          resizeMode="cover"
                        />
                        <Pressable style={itemConfigStyles.removePhotoButton} onPress={handleRemovePromoPhoto}>
                          <Ionicons name="close-circle" size={24} color="#ff4444" />
                        </Pressable>
                      </View>
                    ) : (
                      <Pressable 
                        style={itemConfigStyles.uploadPhotoButton} 
                        onPress={handlePromoPhotoUpload}
                        disabled={uploadingPromoPhoto}
                      >
                        {uploadingPromoPhoto ? (
                          <Text style={itemConfigStyles.uploadPhotoText}>Uploading...</Text>
                        ) : (
                          <>
                            <Ionicons name="camera-outline" size={24} color="#007AFF" />
                            <Text style={itemConfigStyles.uploadPhotoText}>Upload Promo Photo</Text>
                          </>
                        )}
                      </Pressable>
                    )}
                    <Text style={itemConfigStyles.photoHint}>Max 5MB. Landscape photo works best (e.g. team photo, van, work in progress)</Text>
                  </View>
                )}
                
                {/* Preview of preset */}
                {flyerForm.promoPhotoPreset && flyerForm.promoPhotoPreset !== 'custom' && (
                  <View style={[itemConfigStyles.photoPreviewContainer, { marginTop: 12 }]}>
                    <RNImage 
                      source={FLYER_BACK_PRESETS[flyerForm.promoPhotoPreset as keyof typeof FLYER_BACK_PRESETS]} 
                      style={itemConfigStyles.photoPreview}
                      resizeMode="cover"
                    />
                  </View>
                )}
                
                {/* Additional Services */}
                <Text style={[itemConfigStyles.pickerLabel, { marginTop: 16 }]}>Additional Services</Text>
                <TextInput
                  style={itemConfigStyles.customTextInput}
                  value={flyerForm.additionalServicesText}
                  onChangeText={(text) => setFlyerForm(prev => ({ ...prev, additionalServicesText: text }))}
                  placeholder="Enter additional services (one per line)"
                  multiline
                  numberOfLines={5}
                />
              </>
            )}

            {itemType === 'canvassing' && (
              <>
                <Text style={itemConfigStyles.sectionTitle}>Include Sections</Text>
                <CheckboxRow 
                  label="Price Boxes" 
                  checked={canvassingForm.showPriceBoxes} 
                  onToggle={() => setCanvassingForm(prev => ({ ...prev, showPriceBoxes: !prev.showPriceBoxes }))} 
                />
                <CheckboxRow 
                  label="Additional Services" 
                  checked={canvassingForm.showAdditionalServices} 
                  onToggle={() => setCanvassingForm(prev => ({ ...prev, showAdditionalServices: !prev.showAdditionalServices }))} 
                />
                <CheckboxRow 
                  label="Contact Information" 
                  checked={canvassingForm.showContactInfo} 
                  onToggle={() => setCanvassingForm(prev => ({ ...prev, showContactInfo: !prev.showContactInfo }))} 
                />
              </>
            )}

            {itemType === 'leaflet' && (
              <>
                <Text style={itemConfigStyles.sectionTitle}>Include Sections</Text>
                <CheckboxRow 
                  label="Pricing Table" 
                  checked={leafletForm.showPricingTable} 
                  onToggle={() => setLeafletForm(prev => ({ ...prev, showPricingTable: !prev.showPricingTable }))} 
                />
                <CheckboxRow 
                  label="Payment Methods" 
                  checked={leafletForm.showPaymentMethods} 
                  onToggle={() => setLeafletForm(prev => ({ ...prev, showPaymentMethods: !prev.showPaymentMethods }))} 
                />
                <CheckboxRow 
                  label="Service Area Map" 
                  checked={leafletForm.showServiceArea} 
                  onToggle={() => setLeafletForm(prev => ({ ...prev, showServiceArea: !prev.showServiceArea }))} 
                />
              </>
            )}
          </ScrollView>

          <View style={itemConfigStyles.footer}>
            <Pressable style={itemConfigStyles.cancelButton} onPress={onClose}>
              <Text style={itemConfigStyles.cancelButtonText}>Cancel</Text>
            </Pressable>
            <Pressable style={itemConfigStyles.saveButton} onPress={handleSave}>
              <Ionicons name="checkmark" size={20} color="#fff" />
              <Text style={itemConfigStyles.saveButtonText}>Save</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
};

// Invoice Front Component
const InvoiceFront = ({ config, itemConfig }: { config: MaterialsConfig; itemConfig?: InvoiceItemConfig }) => {
  // Parse services from itemConfig or use defaults
  const servicesText = itemConfig?.workCompletedServices || defaultInvoiceItemConfig.workCompletedServices;
  const servicesList = servicesText.split('\n').map(s => s.trim()).filter(s => s);
  // Pad services to 9 rows
  const services = [...servicesList];
  while (services.length < 9) services.push('');

  const businessNameIsLong = (config.businessName || '').length > 18;

  // Default to showing all sections if no itemConfig provided
  const showServicesProvidedOn = itemConfig?.showServicesProvidedOn ?? true;
  const showDirectDebit = itemConfig?.showDirectDebit ?? true;
  const showCash = itemConfig?.showCash ?? true;
  const showBusinessAddress = itemConfig?.showBusinessAddress ?? true;

  // Check if any left column content is visible
  const hasLeftColumnContent = showDirectDebit || showCash || showBusinessAddress;

  return (
    <View style={invoiceStyles.invoiceContainer}>
      {/* TOP SECTION: Header + Branding (left) | Bank Transfer + Notes (right) */}
      <View style={invoiceStyles.topSection}>
        {/* Left: Header + Branding */}
        <View style={invoiceStyles.topLeftColumn}>
          {/* Services Provided Header */}
          {showServicesProvidedOn && (
            <View style={invoiceStyles.servicesHeader}>
              <Text style={invoiceStyles.servicesHeaderText}>Services provided on: </Text>
              <Ionicons name="checkmark-circle" size={16} color="#2E86AB" />
              <Text style={invoiceStyles.dateSlash}>    /    /    </Text>
            </View>
          )}

          {/* Logo and Branding */}
          <View style={[invoiceStyles.brandingSection, { marginTop: !showServicesProvidedOn ? 36 : 16 }]}>
            {/* Logo Circle */}
            <View style={[invoiceStyles.logoCircle, config.logoUrl && invoiceStyles.logoCircleWithLogo]}>
              {config.logoUrl ? (
                <RNImage 
                  source={{ uri: config.logoUrl }} 
                  style={[invoiceStyles.logoImage, { backgroundColor: '#fff' }, Platform.OS === 'web' && { imageRendering: 'crisp-edges' as any }]} 
                  resizeMode="cover" 
                />
              ) : (
                <Ionicons name="home" size={44} color="#fff" />
              )}
            </View>
            
            <Text
              style={[
                invoiceStyles.businessName,
                businessNameIsLong && invoiceStyles.businessNameLong,
              ]}
            >
              {config.businessName}
            </Text>
            <Text style={invoiceStyles.tagline}>{config.tagline}</Text>
            <Text style={invoiceStyles.phoneNumber}>{config.mobileNumber}</Text>
            
            <View style={invoiceStyles.socialRow}>
              <Text style={invoiceStyles.socialText}>f/{config.facebookHandle}</Text>
            </View>
            <Text style={invoiceStyles.websiteText}>{config.websiteAddress}</Text>
          </View>
        </View>

        {/* Right: Bank Transfer */}
        <View style={invoiceStyles.topRightColumn}>
          {/* Bank Transfer Box */}
          <View style={[invoiceStyles.blueBox, { flex: 1, marginTop: 32, paddingTop: 12 }]}>
            <Text style={[invoiceStyles.boxTitle, { fontSize: 16 }]}>Bank Transfer</Text>
            
            <View style={{ marginBottom: 10 }}>
              <Text style={[invoiceStyles.bankLabel, { fontSize: 12 }]}>Sort Code:</Text>
              <Text style={[invoiceStyles.bankValue, { fontSize: 14, fontWeight: 'bold' }]}>{config.sortCode}</Text>
            </View>
            <View style={{ marginBottom: 10 }}>
              <Text style={[invoiceStyles.bankLabel, { fontSize: 12 }]}>Account No:</Text>
              <Text style={[invoiceStyles.bankValue, { fontSize: 14, fontWeight: 'bold' }]}>{config.accountNumber}</Text>
            </View>
            
            <View>
              <Text style={[invoiceStyles.bankLabel, { fontSize: 12 }]}>Payment reference:</Text>
              <Text style={[invoiceStyles.paymentRef, { fontSize: 16 }]}>RWC</Text>
            </View>
          </View>
        </View>
      </View>

      {/* BOTTOM SECTION: Direct Debit + Cash + Post (left) | Work Completed (right) - ALIGNED */}
      <View style={invoiceStyles.bottomSection}>
        {/* Left: Payment method boxes - only show if at least one option is enabled */}
        {hasLeftColumnContent && (
          <View style={invoiceStyles.bottomLeftColumn}>
            {/* Direct Debit Box */}
            {showDirectDebit && (
              <View style={invoiceStyles.blueBox}>
                <Text style={invoiceStyles.boxTitle}>Direct Debit</Text>
                <Text style={invoiceStyles.boxText}>With your card details at hand go to:</Text>
                <Text style={invoiceStyles.linkText}>{config.directDebitLink}</Text>
              </View>
            )}

            {/* Cash Box */}
            {showCash && (
              <View style={invoiceStyles.blueBox}>
                <Text style={invoiceStyles.boxTitle}>Cash</Text>
                <Text style={invoiceStyles.boxText}>
                  Let us know to knock on your door or look somewhere for an envelope.
                </Text>
              </View>
            )}

            {/* Post Box - Business Address (flex to align bottom with Work Completed) */}
            {showBusinessAddress && (
              <View style={[invoiceStyles.blueBox, { flex: 1, marginBottom: 0 }]}>
                <Text style={invoiceStyles.addressText}>{config.businessAddress.line1}</Text>
                <Text style={invoiceStyles.addressText}>{config.businessAddress.town}</Text>
                <Text style={invoiceStyles.addressText}>{config.businessAddress.postcode}</Text>
              </View>
            )}
          </View>
        )}

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
const InvoiceBack = ({ config, itemConfig }: { config: MaterialsConfig; itemConfig?: InvoiceItemConfig }) => {
  // Auto-generate customer portal link from business name
  const normalizedBusinessName = config.businessName.toLowerCase().replace(/\s+/g, '');
  const portalLink = `guvnor.app/${normalizedBusinessName}`;

  const showManageAccountOnline = itemConfig?.showManageAccountOnline ?? true;
  const showReferralScheme = itemConfig?.showReferralScheme ?? false;
  const referralReward = itemConfig?.referralReward ?? '£5';
  const customRewardText = itemConfig?.customRewardText ?? '';
  const showNotesWhitespace = itemConfig?.showNotesWhitespace ?? false;
  const showCustomText = itemConfig?.showCustomText ?? false;
  const customText = itemConfig?.customText ?? '';

  // Count all visible items on the back (top + bottom)
  const totalVisibleItems = [
    showManageAccountOnline,
    showCustomText && !!customText.trim(),
    showNotesWhitespace,
    showReferralScheme,
  ].filter(Boolean).length;

  // Count visible items in bottom half only
  const visibleBottomItems = [
    showCustomText && !!customText.trim(),
    showNotesWhitespace,
    showReferralScheme,
  ].filter(Boolean).length;

  const shouldScaleItems = visibleBottomItems >= 2;
  
  // Adjust dotted lines based on total items (more lines if fewer items)
  let dottedLineCount = 7;
  if (totalVisibleItems === 1) {
    dottedLineCount = 21; // Full back, more lines
  } else if (totalVisibleItems === 2) {
    dottedLineCount = 14; // Half back, medium lines
  }

  return (
    <View style={invoiceStyles.invoiceContainer}>
      {/* Top Half - Client Portal Instructions (50% of space) */}
      <View style={[invoiceStyles.backTopHalf, { paddingTop: 32 }]}>
        {showManageAccountOnline && (
          <View style={[invoiceStyles.portalBox, { flex: 1, borderWidth: 0 }]}>
            <Text style={[invoiceStyles.portalTitle, { fontSize: 18 }]}>Manage Your Account Online</Text>
            
            <Text style={[invoiceStyles.portalText, { fontSize: 12, lineHeight: 16 }]}>
              View your statement, check your balance, and manage your account details online through our customer portal.
            </Text>
            
            <View style={invoiceStyles.portalSteps}>
              <Text style={[invoiceStyles.stepTitle, { fontSize: 13 }]}>How to access:</Text>
              
              <View style={invoiceStyles.stepRow}>
                <Text style={[invoiceStyles.stepNumber, { fontSize: 12 }]}>1.</Text>
                <Text style={[invoiceStyles.stepText, { fontSize: 12, lineHeight: 16 }]}>Visit our customer portal at:</Text>
              </View>
              <Text style={[invoiceStyles.portalUrl, { fontSize: 13 }]}>{portalLink}</Text>
              
              <View style={invoiceStyles.stepRow}>
                <Text style={[invoiceStyles.stepNumber, { fontSize: 12 }]}>2.</Text>
                <Text style={[invoiceStyles.stepText, { fontSize: 12, lineHeight: 16 }]}>Enter your account number (Shown on front, starting with RWC)</Text>
              </View>
              
              <View style={invoiceStyles.stepRow}>
                <Text style={[invoiceStyles.stepNumber, { fontSize: 12 }]}>3.</Text>
                <Text style={[invoiceStyles.stepText, { fontSize: 12, lineHeight: 16 }]}>Verify with the last 4 digits of your phone number</Text>
              </View>
            </View>
          </View>
        )}
      </View>
      
      {/* Bottom Half - Reserved for other content */}
      <View style={invoiceStyles.backBottomHalf}>
        {showCustomText && !!customText.trim() && (
          <View style={[
            invoiceStyles.referralBox, 
            shouldScaleItems ? { flex: 1, marginBottom: 10, borderWidth: 0 } : { marginBottom: 10, borderWidth: 0 }
          ]}>
            <Text style={invoiceStyles.referralText}>{customText.trim()}</Text>
          </View>
        )}
        {showNotesWhitespace && (
          <View style={[
            invoiceStyles.referralBox, 
            shouldScaleItems 
              ? { flex: 1, marginBottom: showReferralScheme ? 10 : 0, borderWidth: 0 } 
              : { marginBottom: showReferralScheme ? 10 : 0, borderWidth: 0 }
          ]}>
            <View style={invoiceStyles.dottedLines}>
              {Array.from({ length: dottedLineCount }).map((_, i) => (
                <View 
                  key={i} 
                  style={i % 2 === 0 ? invoiceStyles.dottedLine : invoiceStyles.dottedLineEmpty} 
                />
              ))}
            </View>
          </View>
        )}
        {showReferralScheme && (
          <View style={[
            invoiceStyles.referralBox,
            shouldScaleItems ? { flex: 1, borderWidth: 0 } : { borderWidth: 0 }
          ]}>
            <Text style={invoiceStyles.referralTitle}>Referral Scheme</Text>
            <Text style={invoiceStyles.referralText}>
              Refer a friend and receive{' '}
              <Text style={invoiceStyles.referralReward}>
                {referralReward === 'Other...' 
                  ? customRewardText 
                  : referralReward === 'One free service' 
                    ? 'one free service' 
                    : referralReward}
              </Text>{' '}
              when they become a regular customer. Simply instruct them to reference your address when they go to{' '}
              <Text style={invoiceStyles.referralReward}>{portalLink}</Text>
            </Text>
          </View>
        )}
      </View>
    </View>
  );
};

// Flyer Components
const FlyerFront = ({ config, itemConfig }: { config: MaterialsConfig; itemConfig: FlyerItemConfig }) => {
  // Parse services text into array of bullet points
  const services = itemConfig.servicesText
    .split('\n')
    .map(line => line.replace(/^[•\-\*]\s*/, '').trim())
    .filter(line => line.length > 0);

  return (
    <View style={[flyerStyles.container]}>
      {/* Gradient Header Background */}
      <View style={flyerStyles.headerGradient}>
        {/* Logo and Branding */}
        <View style={flyerStyles.brandingRow}>
          <View style={[flyerStyles.logoCircle, config.logoUrl && flyerStyles.logoCircleWithLogo]}>
            {config.logoUrl ? (
              <RNImage source={{ uri: config.logoUrl }} style={[flyerStyles.logoImage, { backgroundColor: '#fff' }]} resizeMode="cover" />
            ) : (
              <Ionicons name="home" size={35} color="#fff" />
            )}
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
        
        {itemConfig.showServices && services.map((service, index) => (
          <View key={index} style={flyerStyles.bulletRow}>
            <View style={flyerStyles.checkCircle}>
              <Ionicons name="checkmark" size={14} color="#2E86AB" />
            </View>
            <Text style={flyerStyles.bulletText}>{service}</Text>
          </View>
        ))}

        {/* QR Code for Customer Portal */}
        {(() => {
          const normalizedBusinessName = config.businessName.toLowerCase().replace(/\s+/g, '');
          const portalLink = `guvnor.app/${normalizedBusinessName}`;
          return (
            <View style={flyerStyles.qrCodeContainer}>
              <RNImage 
                source={{ uri: `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(`https://${portalLink}`)}` }}
                style={flyerStyles.qrCode}
                resizeMode="contain"
              />
              <Text style={flyerStyles.qrCodeText}>
                Scan the QR code or go to{'\n'}
                <Text style={flyerStyles.qrCodeLink}>{portalLink}</Text>
              </Text>
            </View>
          );
        })()}

        {/* FREE Quote Badge */}
        {itemConfig.showQuoteBadge && (
          <View style={flyerStyles.quoteContainer}>
            <View style={flyerStyles.quoteBadge}>
              <Text style={flyerStyles.quoteFree}>FREE</Text>
              <Text style={flyerStyles.quoteText}>quote!</Text>
            </View>
          </View>
        )}
      </View>

      {/* Blue Footer */}
      <View style={flyerStyles.footer}>
        <View style={flyerStyles.footerCurve} />
        <View style={flyerStyles.footerContent}>
          <View style={flyerStyles.contactRow}>
            <Ionicons name="call-outline" size={24} color="#fff" />
            <Text style={flyerStyles.phoneNumber}>{config.mobileNumber}</Text>
          </View>
          <View style={flyerStyles.contactRow}>
            <Ionicons name="logo-facebook" size={21} color="#fff" />
            <Text style={flyerStyles.contactText}>{config.facebookHandle}</Text>
          </View>
          <View style={flyerStyles.contactRow}>
            <Ionicons name="globe-outline" size={21} color="#fff" />
            <Text style={flyerStyles.contactText}>{config.websiteAddress}</Text>
          </View>
        </View>
      </View>
    </View>
  );
};

const FlyerBack = ({ config, itemConfig }: { config: MaterialsConfig; itemConfig: FlyerItemConfig }) => {
  // Parse additional services from text, creating pairs for two-column layout
  const servicesList = itemConfig.additionalServicesText
    .split('\n')
    .map(s => s.trim())
    .filter(s => s.length > 0);
  
  const additionalServices: { left: string; right: string }[] = [];
  for (let i = 0; i < servicesList.length; i += 2) {
    additionalServices.push({
      left: servicesList[i] || '',
      right: servicesList[i + 1] || '',
    });
  }

  return (
    <View style={[flyerStyles.container]}>
      {/* Background image */}
      <View style={flyerStyles.backBackground}>
        {(itemConfig.promoPhotoPreset === 'custom' && itemConfig.promoPhotoUrl) ? (
          <>
            <RNImage 
              source={{ uri: itemConfig.promoPhotoUrl }} 
              style={flyerStyles.promoPhoto}
              resizeMode="cover"
            />
            {/* Before/After labels overlaid on photo - conditional */}
            {itemConfig.showBeforeAfter && (
              <View style={flyerStyles.beforeAfterRowOverlay}>
                <Text style={flyerStyles.beforeLabelOverlay}>Before</Text>
                <Text style={flyerStyles.afterLabelOverlay}>After</Text>
              </View>
            )}
          </>
        ) : itemConfig.promoPhotoPreset && FLYER_BACK_PRESETS[itemConfig.promoPhotoPreset as keyof typeof FLYER_BACK_PRESETS] ? (
          <>
            <RNImage 
              source={FLYER_BACK_PRESETS[itemConfig.promoPhotoPreset as keyof typeof FLYER_BACK_PRESETS]} 
              style={flyerStyles.promoPhoto}
              resizeMode="cover"
            />
            {/* Before/After labels overlaid on photo - conditional */}
            {itemConfig.showBeforeAfter && (
              <View style={flyerStyles.beforeAfterRowOverlay}>
                <Text style={flyerStyles.beforeLabelOverlay}>Before</Text>
                <Text style={flyerStyles.afterLabelOverlay}>After</Text>
              </View>
            )}
          </>
        ) : null}
      </View>

      {/* Additional Services Section */}
      <View style={flyerStyles.servicesSection}>
        <Text style={flyerStyles.additionalTitle}>Additional Services</Text>
        
        {additionalServices.map((row, index) => (
          <View key={index} style={flyerStyles.serviceRow}>
            <View style={flyerStyles.serviceItem}>
              <View style={flyerStyles.checkCircleSmall}>
                <Ionicons name="checkmark" size={12} color="#2E86AB" />
              </View>
              <Text style={flyerStyles.serviceText}>{row.left}</Text>
            </View>
            {row.right ? (
              <View style={flyerStyles.serviceItem}>
                <View style={flyerStyles.checkCircleSmall}>
                  <Ionicons name="checkmark" size={12} color="#2E86AB" />
                </View>
                <Text style={flyerStyles.serviceText}>{row.right}</Text>
              </View>
            ) : <View style={flyerStyles.serviceItem} />}
          </View>
        ))}

        {/* FREE Quote Badge */}
        {itemConfig.showQuoteBadge && (
          <View style={flyerStyles.quoteContainerBack}>
            <View style={flyerStyles.quoteBadge}>
              <Text style={flyerStyles.quoteFree}>FREE</Text>
              <Text style={flyerStyles.quoteText}>quote!</Text>
            </View>
          </View>
        )}
      </View>

      {/* Blue Footer */}
      <View style={flyerStyles.footer}>
        <View style={flyerStyles.footerCurve} />
        <View style={flyerStyles.footerContent}>
          <View style={flyerStyles.contactRow}>
            <Ionicons name="call-outline" size={24} color="#fff" />
            <Text style={flyerStyles.phoneNumber}>{config.mobileNumber}</Text>
          </View>
          <View style={flyerStyles.contactRow}>
            <Ionicons name="logo-facebook" size={21} color="#fff" />
            <Text style={flyerStyles.contactText}>{config.facebookHandle}</Text>
          </View>
          <View style={flyerStyles.contactRow}>
            <Ionicons name="globe-outline" size={21} color="#fff" />
            <Text style={flyerStyles.contactText}>{config.websiteAddress}</Text>
          </View>
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
          <View style={[canvassingStyles.logoCircle, config.logoUrl && canvassingStyles.logoCircleWithLogo]}>
            {config.logoUrl ? (
              <RNImage source={{ uri: config.logoUrl }} style={[canvassingStyles.logoImage, { backgroundColor: '#fff' }]} resizeMode="cover" />
            ) : (
              <Ionicons name="home" size={31} color="#fff" />
            )}
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
                <Ionicons name="checkmark" size={14} color="#2E86AB" />
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
                  <Ionicons name="checkmark" size={12} color="#2E86AB" />
                </View>
                <Text style={canvassingStyles.serviceText}>{row.left}</Text>
              </View>
              <View style={canvassingStyles.serviceItem}>
                <View style={canvassingStyles.checkCircleBack}>
                  <Ionicons name="checkmark" size={12} color="#2E86AB" />
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
          <View style={[leafletStyles.logoCircle, config.logoUrl && leafletStyles.logoCircleWithLogo]}>
            {config.logoUrl ? (
              <RNImage source={{ uri: config.logoUrl }} style={[leafletStyles.logoImage, { backgroundColor: '#fff' }]} resizeMode="cover" />
            ) : (
              <Ionicons name="home" size={40} color="#fff" />
            )}
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
  const invoiceFrontRef = useRef<View>(null);
  const invoiceBackRef = useRef<View>(null);
  const flyerFrontRef = useRef<View>(null);
  const flyerBackRef = useRef<View>(null);
  const canvassingFrontRef = useRef<View>(null);
  const canvassingBackRef = useRef<View>(null);
  const leafletFrontRef = useRef<View>(null);
  const leafletBackRef = useRef<View>(null);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [config, setConfig] = useState<MaterialsConfig>(defaultConfig);
  const [loading, setLoading] = useState(true);
  
  // Item-specific configuration state
  const [showItemConfigModal, setShowItemConfigModal] = useState(false);
  const [currentItemType, setCurrentItemType] = useState<ItemConfigType>('invoice');
  const [invoiceItemConfig, setInvoiceItemConfig] = useState<InvoiceItemConfig>(defaultInvoiceItemConfig);
  const [flyerItemConfig, setFlyerItemConfig] = useState<FlyerItemConfig>(defaultFlyerItemConfig);
  const [canvassingItemConfig, setCanvassingItemConfig] = useState<CanvassingFlyerItemConfig>(defaultCanvassingFlyerItemConfig);
  const [leafletItemConfig, setLeafletItemConfig] = useState<LeafletItemConfig>(defaultLeafletItemConfig);

  const openItemConfig = (type: ItemConfigType) => {
    setCurrentItemType(type);
    setShowItemConfigModal(true);
  };

  // Load configuration from Firestore and user profile
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const ownerId = await getDataOwnerId();
        if (!ownerId) {
          setLoading(false);
          return;
        }
        
        // Load materials config
        const docRef = doc(db, 'materialsConfig', ownerId);
        const docSnap = await getDoc(docRef);
        let materialsConfig = defaultConfig;
        if (docSnap.exists()) {
          materialsConfig = { ...defaultConfig, ...docSnap.data() as MaterialsConfig };
        }
        
        // Load business name from owner's profile (Bank & Business Info)
        const ownerProfile = await getUserProfile(ownerId);
        if (ownerProfile?.businessName) {
          // Use business name from profile settings
          materialsConfig = { ...materialsConfig, businessName: ownerProfile.businessName };
        }
        
        setConfig(materialsConfig);
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

  const downloadPreviewPng = async (element: HTMLElement, filename: string) => {
    if (Platform.OS !== 'web') {
      alert('PNG download is only available on web.');
      return;
    }

    if (!element) {
      alert('Could not find preview element to capture.');
      return;
    }

    try {
      // Ensure fonts are loaded before capture (prevents text reflow vs preview)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fontsReady = (document as any).fonts?.ready;
      if (fontsReady && typeof fontsReady.then === 'function') {
        await fontsReady;
      }

      // Capture strategy:
      // 1) Read computed styles from the *real* preview DOM (RNW styles applied)
      // 2) In html2canvas onclone(), apply those computed styles onto the cloned nodes
      // This avoids clone-side style loss (which caused black borders / wrong layout).
      const captureId = `capture-${Date.now()}`;

      // Ensure images are loaded/decoded before capture (prevents missing images in output)
      const originalImgs = Array.from(element.querySelectorAll('img')) as HTMLImageElement[];
      await Promise.all(originalImgs.map(async (img) => {
        try {
          if (!img.complete) {
            await new Promise<void>((resolve) => {
              const done = () => resolve();
              img.addEventListener('load', done, { once: true });
              img.addEventListener('error', done, { once: true });
            });
          }
          // decode() helps ensure the bitmap is ready (best effort)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const decodeFn = (img as any).decode;
          if (typeof decodeFn === 'function') {
            await decodeFn.call(img);
          }
        } catch {
          // best-effort only; don't block capture
        }
      }));

      const originalNodes = [element, ...Array.from(element.querySelectorAll('*'))] as HTMLElement[];
      const styleMap = new Map<string, Array<[string, string, string]>>();
      const imgSrcMap = new Map<string, string>();

      for (let idx = 0; idx < originalNodes.length; idx++) {
        const node = originalNodes[idx];
        const nodeId = `${captureId}-${idx}`;
        node.setAttribute('data-capture-node', nodeId);

        if (node instanceof HTMLImageElement) {
          imgSrcMap.set(nodeId, node.currentSrc || node.src);
        }

        const cs = window.getComputedStyle(node);
        const props: Array<[string, string, string]> = [];
        for (let i = 0; i < cs.length; i++) {
          const prop = cs[i];
          props.push([prop, cs.getPropertyValue(prop), cs.getPropertyPriority(prop)]);
        }
        styleMap.set(nodeId, props);
      }
      
      // Capture the element at its natural size, scaled up for print quality
      const canvas = await html2canvas(element, {
        scale: 8, // 8x scale for ultra high resolution (especially for logos)
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        onclone: (clonedDoc) => {
          // Apply computed styles from the real DOM
          const clonedNodes = clonedDoc.querySelectorAll(`[data-capture-node^="${captureId}-"]`);
          clonedNodes.forEach((n) => {
            const el = n as HTMLElement;
            const nodeId = el.getAttribute('data-capture-node');
            if (!nodeId) return;
            const props = styleMap.get(nodeId);
            if (!props) return;
            for (const [prop, val, prio] of props) {
              el.style.setProperty(prop, val, prio);
            }

            // Ensure images in the cloned DOM keep the correct src and load eagerly
            if (el instanceof HTMLImageElement) {
              const src = imgSrcMap.get(nodeId);
              if (src) {
                el.src = src;
              }
              el.loading = 'eager';
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (el as any).decoding = 'sync';
              el.setAttribute('crossorigin', 'anonymous');
            }
          });

          // Fix logo images for reliable html2canvas capture
          // Replace <img> with a HIGH-RES canvas element that has the image pre-drawn
          const clonedImgs = Array.from(clonedDoc.querySelectorAll('img')) as HTMLImageElement[];
          for (const img of clonedImgs) {
            const displayW = img.width || parseInt(img.style.width) || 0;
            const displayH = img.height || parseInt(img.style.height) || 0;
            if (displayW <= 0 || displayH <= 0) continue;
            if (displayW >= 200 || displayH >= 200) continue; // only treat small images as "logos"

            const src = img.currentSrc || img.src;
            if (!src || !src.startsWith('data:')) continue; // only handle data URLs (uploaded logos)

            try {
              // Create a temporary image to get the source dimensions
              const tempImg = new (window as any).Image();
              tempImg.src = src;
              
              // Use high resolution: either the natural image size or 8x display size
              const naturalW = tempImg.naturalWidth || displayW;
              const naturalH = tempImg.naturalHeight || displayH;
              const hiResScale = 8;
              const canvasW = Math.max(naturalW, displayW * hiResScale);
              const canvasH = Math.max(naturalH, displayH * hiResScale);
              
              // Create a HIGH-RES canvas
              const canvas = clonedDoc.createElement('canvas');
              canvas.width = canvasW;
              canvas.height = canvasH;
              // CSS dimensions control DISPLAY size (small), canvas dimensions control RESOLUTION (large)
              canvas.style.width = `${displayW}px`;
              canvas.style.height = `${displayH}px`;
              canvas.style.borderRadius = img.style.borderRadius || '50%';
              canvas.style.display = 'block';
              
              const ctx = canvas.getContext('2d');
              if (ctx) {
                // Fill with white background first (prevents gray placeholder showing through)
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, canvasW, canvasH);
                
                // Draw the image to fill the canvas (cover behavior for same aspect ratio)
                // For a square logo in a square canvas, this fills perfectly
                ctx.drawImage(tempImg, 0, 0, canvasW, canvasH);
              }
              
              // Hide the parent's background (the #555 placeholder circle)
              const parent = img.parentElement as HTMLElement | null;
              if (parent) {
                parent.style.setProperty('background-color', 'transparent', 'important');
                parent.style.setProperty('background', 'none', 'important');
              }
              
              // Replace the img with the high-res canvas
              parent?.replaceChild(canvas, img);
            } catch (e) {
              console.warn('Failed to convert logo img to canvas:', e);
            }
          }
        },
      });

      // Download the PNG
      const link = document.createElement('a');
      link.download = filename;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (error) {
      console.error('Error generating PNG:', error);
      alert('Error generating image. Please try again.');
    } finally {
      // Clean up node tagging (don’t leave attributes around)
      const tagged = [element, ...Array.from(element.querySelectorAll('*'))] as HTMLElement[];
      tagged.forEach((n) => n.removeAttribute('data-capture-node'));
    }
  };

  const handleInvoiceDownloadPNG = async (side: 'front' | 'back') => {
    const ref = side === 'front' ? invoiceFrontRef : invoiceBackRef;
    const element = ref.current as unknown as HTMLElement;
    const businessSlug = config.businessName.replace(/\s+/g, '-').toLowerCase();
    await downloadPreviewPng(element, `invoice-${side}-${businessSlug}.png`);
  };

  const handleFlyerDownloadPNG = async (side: 'front' | 'back') => {
    const ref = side === 'front' ? flyerFrontRef : flyerBackRef;
    const element = ref.current as unknown as HTMLElement;
    const businessSlug = config.businessName.replace(/\s+/g, '-').toLowerCase();
    await downloadPreviewPng(element, `flyer-${side}-${businessSlug}.png`);
  };

  const handleCanvassingDownloadPNG = async (side: 'front' | 'back') => {
    const ref = side === 'front' ? canvassingFrontRef : canvassingBackRef;
    const element = ref.current as unknown as HTMLElement;
    const businessSlug = config.businessName.replace(/\s+/g, '-').toLowerCase();
    await downloadPreviewPng(element, `canvassing-flyer-${side}-${businessSlug}.png`);
  };

  const handleLeafletDownloadPNG = async (side: 'front' | 'back') => {
    const ref = side === 'front' ? leafletFrontRef : leafletBackRef;
    const element = ref.current as unknown as HTMLElement;
    const businessSlug = config.businessName.replace(/\s+/g, '-').toLowerCase();
    await downloadPreviewPng(element, `new-business-leaflet-${side}-${businessSlug}.png`);
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

        {/* Item Configuration Modal */}
        <ItemConfigurationModal
          visible={showItemConfigModal}
          onClose={() => setShowItemConfigModal(false)}
          itemType={currentItemType}
          invoiceConfig={invoiceItemConfig}
          flyerConfig={flyerItemConfig}
          canvassingConfig={canvassingItemConfig}
          leafletConfig={leafletItemConfig}
          onSaveInvoice={setInvoiceItemConfig}
          onSaveFlyer={setFlyerItemConfig}
          onSaveCanvassing={setCanvassingItemConfig}
          onSaveLeaflet={setLeafletItemConfig}
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
              <View style={styles.sectionButtons}>
                <Pressable style={styles.configureButton} onPress={() => openItemConfig('invoice')}>
                  <Ionicons name="options-outline" size={18} color="#007AFF" />
                  <Text style={styles.configureButtonText}>Options</Text>
                </Pressable>
                {Platform.OS === 'web' && (
                  <>
                    <Pressable style={styles.downloadButton} onPress={() => handleInvoiceDownloadPNG('front')}>
                      <Ionicons name="download-outline" size={18} color="#fff" />
                      <Text style={styles.downloadButtonText}>Front PNG</Text>
                    </Pressable>
                    <Pressable style={styles.downloadButton} onPress={() => handleInvoiceDownloadPNG('back')}>
                      <Ionicons name="download-outline" size={18} color="#fff" />
                      <Text style={styles.downloadButtonText}>Back PNG</Text>
                    </Pressable>
                  </>
                )}
              </View>
            </View>
            
            {/* Side by side invoice previews */}
            <View style={styles.invoiceRow} ref={printRef}>
              <View style={styles.invoiceWrapper}>
                <Text style={styles.invoiceLabel}>Front</Text>
                <View ref={invoiceFrontRef}>
                  <InvoiceFront config={config} itemConfig={invoiceItemConfig} />
                </View>
              </View>
              <View style={styles.invoiceWrapper}>
                <Text style={styles.invoiceLabel}>Back</Text>
                <View ref={invoiceBackRef}>
                  <InvoiceBack config={config} itemConfig={invoiceItemConfig} />
                </View>
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
              <View style={styles.sectionButtons}>
                <Pressable style={styles.configureButton} onPress={() => openItemConfig('flyer')}>
                  <Ionicons name="options-outline" size={18} color="#007AFF" />
                  <Text style={styles.configureButtonText}>Options</Text>
                </Pressable>
                {Platform.OS === 'web' && (
                  <>
                    <Pressable style={styles.downloadButton} onPress={() => handleFlyerDownloadPNG('front')}>
                      <Ionicons name="download-outline" size={18} color="#fff" />
                      <Text style={styles.downloadButtonText}>Front PNG</Text>
                    </Pressable>
                    <Pressable style={styles.downloadButton} onPress={() => handleFlyerDownloadPNG('back')}>
                      <Ionicons name="download-outline" size={18} color="#fff" />
                      <Text style={styles.downloadButtonText}>Back PNG</Text>
                    </Pressable>
                  </>
                )}
              </View>
            </View>
            
            <View style={styles.invoiceRow}>
              <View style={styles.invoiceWrapper}>
                <Text style={styles.invoiceLabel}>Front</Text>
                <View ref={flyerFrontRef}>
                  <FlyerFront config={config} itemConfig={flyerItemConfig} />
                </View>
              </View>
              <View style={styles.invoiceWrapper}>
                <Text style={styles.invoiceLabel}>Back</Text>
                <View ref={flyerBackRef}>
                  <FlyerBack config={config} itemConfig={flyerItemConfig} />
                </View>
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
              <View style={styles.sectionButtons}>
                <Pressable style={styles.configureButton} onPress={() => openItemConfig('canvassing')}>
                  <Ionicons name="options-outline" size={18} color="#007AFF" />
                  <Text style={styles.configureButtonText}>Options</Text>
                </Pressable>
                {Platform.OS === 'web' && (
                  <>
                    <Pressable style={styles.downloadButton} onPress={() => handleCanvassingDownloadPNG('front')}>
                      <Ionicons name="download-outline" size={18} color="#fff" />
                      <Text style={styles.downloadButtonText}>Front PNG</Text>
                    </Pressable>
                    <Pressable style={styles.downloadButton} onPress={() => handleCanvassingDownloadPNG('back')}>
                      <Ionicons name="download-outline" size={18} color="#fff" />
                      <Text style={styles.downloadButtonText}>Back PNG</Text>
                    </Pressable>
                  </>
                )}
              </View>
            </View>
            
            <View style={styles.invoiceRow}>
              <View style={styles.invoiceWrapper}>
                <Text style={styles.invoiceLabel}>Front</Text>
                <View ref={canvassingFrontRef}>
                  <CanvassingFlyerFront config={config} />
                </View>
              </View>
              <View style={styles.invoiceWrapper}>
                <Text style={styles.invoiceLabel}>Back</Text>
                <View ref={canvassingBackRef}>
                  <CanvassingFlyerBack config={config} />
                </View>
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
              <View style={styles.sectionButtons}>
                <Pressable style={styles.configureButton} onPress={() => openItemConfig('leaflet')}>
                  <Ionicons name="options-outline" size={18} color="#007AFF" />
                  <Text style={styles.configureButtonText}>Options</Text>
                </Pressable>
                {Platform.OS === 'web' && (
                  <>
                    <Pressable style={styles.downloadButton} onPress={() => handleLeafletDownloadPNG('front')}>
                      <Ionicons name="download-outline" size={18} color="#fff" />
                      <Text style={styles.downloadButtonText}>Front PNG</Text>
                    </Pressable>
                    <Pressable style={styles.downloadButton} onPress={() => handleLeafletDownloadPNG('back')}>
                      <Ionicons name="download-outline" size={18} color="#fff" />
                      <Text style={styles.downloadButtonText}>Back PNG</Text>
                    </Pressable>
                  </>
                )}
              </View>
            </View>
            
            <ScrollView horizontal showsHorizontalScrollIndicator={true} style={styles.leafletScroll}>
              <View style={styles.invoiceRow}>
                <View style={styles.invoiceWrapper}>
                  <Text style={styles.invoiceLabel}>Front</Text>
                  <View ref={leafletFrontRef}>
                    <NewBusinessLeafletFront config={config} />
                  </View>
                </View>
                <View style={styles.invoiceWrapper}>
                  <Text style={styles.invoiceLabel}>Back</Text>
                  <View ref={leafletBackRef}>
                    <NewBusinessLeafletBack config={config} />
                  </View>
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
  sectionButtons: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  configureButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#007AFF',
    gap: 6,
  },
  configureButtonText: {
    color: '#007AFF',
    fontWeight: '600',
    fontSize: 14,
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
  logoUploadContainer: {
    marginBottom: 12,
  },
  logoPreviewContainer: {
    position: 'relative',
    width: 100,
    height: 100,
    marginBottom: 8,
  },
  logoPreview: {
    width: 100,
    height: 100,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
  },
  removeLogoButton: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: '#fff',
    borderRadius: 12,
  },
  uploadLogoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderWidth: 2,
    borderColor: '#007AFF',
    borderStyle: 'dashed',
    borderRadius: 8,
    backgroundColor: '#f8fbff',
    gap: 8,
    marginBottom: 8,
  },
  uploadLogoText: {
    color: '#007AFF',
    fontSize: 14,
    fontWeight: '600',
  },
  logoHint: {
    fontSize: 11,
    color: '#999',
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

const itemConfigStyles = StyleSheet.create({
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
    maxWidth: 400,
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
    maxHeight: 500,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#007AFF',
    marginBottom: 16,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#ddd',
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  checkboxLabel: {
    fontSize: 16,
    color: '#333',
  },
  divider: {
    height: 1,
    backgroundColor: '#e6e6e6',
    marginVertical: 12,
  },
  pickerRow: {
    marginTop: 10,
  },
  pickerLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
    marginBottom: 6,
  },
  pickerContainer: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#fafafa',
  },
  customTextInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    backgroundColor: '#fafafa',
    minHeight: 120,
    textAlignVertical: 'top',
  },
  charCount: {
    marginTop: 6,
    fontSize: 12,
    color: '#666',
    textAlign: 'right',
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
  photoUploadContainer: {
    marginBottom: 16,
  },
  photoPreviewContainer: {
    position: 'relative',
    width: '100%',
    height: 150,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#f0f0f0',
  },
  photoPreview: {
    width: '100%',
    height: '100%',
  },
  removePhotoButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#fff',
    borderRadius: 12,
  },
  uploadPhotoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    borderWidth: 2,
    borderColor: '#ddd',
    borderStyle: 'dashed',
    borderRadius: 8,
    gap: 8,
  },
  uploadPhotoText: {
    fontSize: 14,
    color: '#007AFF',
    fontWeight: '500',
  },
  photoHint: {
    marginTop: 8,
    fontSize: 12,
    color: '#888',
    textAlign: 'center',
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
    justifyContent: 'space-between',
    flex: 1,
    alignItems: 'stretch',
  },
  bottomSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flex: 1,
    alignItems: 'stretch',
  },
  topLeftColumn: {
    flex: 1,
    marginRight: 6,
  },
  topRightColumn: {
    flex: 1,
    marginLeft: 6,
  },
  bottomLeftColumn: {
    flex: 1,
    marginRight: 6,
  },
  bottomRightColumn: {
    flex: 1,
    marginLeft: 6,
  },
  servicesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
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
    marginBottom: 6,
    paddingBottom: 6,
  },
  brandingSectionFlex: {
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 12,
    flex: 1,
    justifyContent: 'center',
  },
  logoCircle: {
    width: 77,
    height: 77,
    borderRadius: 39,
    backgroundColor: '#555',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
    overflow: 'hidden',
  },
  logoCircleWithLogo: {
    backgroundColor: '#fff',
  },
  logoImage: {
    width: 77,
    height: 77,
    borderRadius: 39,
  },
  businessName: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
  },
  businessNameLong: {
    // User rule: if >18 chars, reduce font size by 40%
    fontSize: 13.2,
    lineHeight: 15,
    paddingHorizontal: 6,
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
    // Slightly smaller to increase the whitespace between Notes (top half)
    // and Work completed (bottom half), matching the center gutter visually.
    height: 48,
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
    width: 50,
    textAlign: 'left',
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
    width: 50,
    textAlign: 'left',
  },
  // Back invoice styles
  backTopHalf: {
    flex: 1,
  },
  backBottomHalf: {
    flex: 1,
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
  referralBox: {
    borderWidth: 2,
    borderColor: '#2E86AB',
    borderRadius: 8,
    padding: 16,
    width: '100%',
  },
  referralTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2E86AB',
    textAlign: 'center',
    marginBottom: 10,
  },
  referralText: {
    fontSize: 10,
    color: '#333',
    textAlign: 'center',
    lineHeight: 14,
  },
  referralReward: {
    fontWeight: 'bold',
    color: '#2E86AB',
  },
  dottedLines: {
    width: '100%',
    justifyContent: 'center',
  },
  dottedLine: {
    borderBottomWidth: 1,
    borderBottomColor: '#2E86AB',
    borderStyle: 'dotted',
    marginVertical: 6,
  },
  dottedLineEmpty: {
    marginVertical: 6,
    height: 1,
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
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: '#555',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    overflow: 'hidden',
  },
  logoCircleWithLogo: {
    backgroundColor: '#fff',
  },
  logoImage: {
    width: 62,
    height: 62,
    borderRadius: 31,
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
    color: '#2E86AB',
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
    borderColor: '#2E86AB',
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
  qrCodeContainer: {
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 4,
  },
  qrCode: {
    width: 105,
    height: 105,
    backgroundColor: '#fff',
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
    backgroundColor: '#2E86AB',
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
    backgroundColor: '#2E86AB',
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
    fontSize: 27,
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
    fontSize: 15,
    color: '#fff',
  },
  qrCodeText: {
    fontSize: 10,
    color: '#333',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 14,
  },
  qrCodeLink: {
    color: '#2E86AB',
    fontWeight: '600',
  },
  // Back styles
  backBackground: {
    flex: 1,
    backgroundColor: '#8B4513',
    position: 'relative',
  },
  promoPhoto: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
  },
  beforeAfterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 8,
  },
  beforeAfterRowOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 8,
  },
  beforeLabel: {
    fontSize: 12,
    color: '#fff',
    fontWeight: 'bold',
  },
  beforeLabelOverlay: {
    fontSize: 12,
    color: '#fff',
    fontWeight: 'bold',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  afterLabel: {
    fontSize: 12,
    color: '#fff',
    fontWeight: 'bold',
  },
  afterLabelOverlay: {
    fontSize: 12,
    color: '#fff',
    fontWeight: 'bold',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
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
    backgroundColor: 'rgba(255,255,255,0.4)',
    padding: 12,
    position: 'relative',
    marginTop: -400,
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
    borderColor: '#2E86AB',
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
    width: 53,
    height: 53,
    borderRadius: 27,
    backgroundColor: '#555',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    overflow: 'hidden',
  },
  logoCircleWithLogo: {
    backgroundColor: '#fff',
  },
  logoImage: {
    width: 53,
    height: 53,
    borderRadius: 27,
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
    color: '#2E86AB',
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
    borderColor: '#2E86AB',
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
    backgroundColor: '#2E86AB',
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
    borderColor: '#2E86AB',
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
    backgroundColor: '#2E86AB',
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
    backgroundColor: '#2E86AB',
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
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: '#555',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    overflow: 'hidden',
  },
  logoCircleWithLogo: {
    backgroundColor: '#fff',
  },
  logoImage: {
    width: 62,
    height: 62,
    borderRadius: 31,
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
