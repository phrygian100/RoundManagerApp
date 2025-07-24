import React, { useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Modal,
    Platform,
    Pressable,
    StyleSheet,
    View,
} from 'react-native';
import { ThemedText } from './ThemedText';
import { ThemedView } from './ThemedView';

interface UpgradeModalProps {
  visible: boolean;
  onClose: () => void;
  onUpgradeSuccess?: () => void;
}

export default function UpgradeModal({
  visible,
  onClose,
  onUpgradeSuccess,
}: UpgradeModalProps) {
  const [loading, setLoading] = useState(false);

  const handleUpgrade = async () => {
    setLoading(true);
    
    try {
      // For web platform, we'll use Stripe Checkout
      if (Platform.OS === 'web') {
        await handleWebUpgrade();
      } else {
        // For mobile, we'll implement native Stripe integration later
        Alert.alert(
          'Upgrade Available',
          'Premium upgrade is currently available on the web version. Please visit the web app to complete your upgrade.',
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      console.error('Upgrade error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to process upgrade';
      
      if (Platform.OS === 'web') {
        window.alert(`Upgrade Failed: ${errorMessage}`);
      } else {
        Alert.alert('Upgrade Failed', errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleWebUpgrade = async () => {
    try {
      // Create Stripe Checkout session using REST API (now proxied through Firebase Hosting)
      const response = await fetch('/api/createCheckoutSession', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          priceId: process.env.EXPO_PUBLIC_STRIPE_PREMIUM_PRICE_ID || 'price_1RoOifF7C2Zg8asU9qRfxMSA',
          successUrl: `${window.location.origin}/upgrade-success`,
          cancelUrl: `${window.location.origin}/upgrade-cancelled`,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create checkout session');
      }

      const { url } = await response.json();
      
      if (!url) {
        throw new Error('No checkout URL returned from server');
      }
      
      // Redirect to Stripe Checkout
      window.location.href = url;
    } catch (error) {
      console.error('Web upgrade error:', error);
      throw error;
    }
  };

  const handleCancel = () => {
    if (!loading) {
      onClose();
    }
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={handleCancel}
    >
      <View style={styles.overlay}>
        <ThemedView style={styles.modal}>
          <View style={styles.header}>
            <ThemedText style={styles.title}>Upgrade to Premium</ThemedText>
            <Pressable
              onPress={handleCancel}
              style={styles.closeButton}
              disabled={loading}
            >
              <ThemedText style={styles.closeButtonText}>×</ThemedText>
            </Pressable>
          </View>

          <View style={styles.content}>
            <View style={styles.planCard}>
              <View style={styles.planHeader}>
                <ThemedText style={styles.planName}>Premium Plan</ThemedText>
                <View style={styles.priceContainer}>
                  <ThemedText style={styles.currency}>£</ThemedText>
                  <ThemedText style={styles.price}>18</ThemedText>
                  <ThemedText style={styles.period}>/month</ThemedText>
                </View>
              </View>

              <View style={styles.featuresList}>
                <View style={styles.feature}>
                  <ThemedText style={styles.checkmark}>✓</ThemedText>
                  <ThemedText style={styles.featureText}>Unlimited clients</ThemedText>
                </View>
                <View style={styles.feature}>
                  <ThemedText style={styles.checkmark}>✓</ThemedText>
                  <ThemedText style={styles.featureText}>Team member creation</ThemedText>
                </View>
                <View style={styles.feature}>
                  <ThemedText style={styles.checkmark}>✓</ThemedText>
                  <ThemedText style={styles.featureText}>Priority support</ThemedText>
                </View>
                <View style={styles.feature}>
                  <ThemedText style={styles.checkmark}>✓</ThemedText>
                  <ThemedText style={styles.featureText}>Advanced reporting</ThemedText>
                </View>
                <View style={styles.feature}>
                  <ThemedText style={styles.checkmark}>✓</ThemedText>
                  <ThemedText style={styles.featureText}>Everything in Free plan</ThemedText>
                </View>
              </View>
            </View>

            <View style={styles.benefits}>
              <ThemedText style={styles.benefitsTitle}>Why upgrade?</ThemedText>
              <ThemedText style={styles.benefitsText}>
                • Scale your business without client limits{'\n'}
                • Collaborate with team members{'\n'}
                • Get help when you need it most{'\n'}
                • Access powerful business insights
              </ThemedText>
            </View>

            <View style={styles.guarantee}>
              <ThemedText style={styles.guaranteeText}>
                💡 <ThemedText style={styles.bold}>30-day money-back guarantee</ThemedText>
              </ThemedText>
              <ThemedText style={styles.guaranteeSubtext}>
                Not satisfied? Get a full refund within 30 days.
              </ThemedText>
            </View>
          </View>

          <View style={styles.footer}>
            <Pressable
              style={[styles.upgradeButton, loading && styles.upgradeButtonDisabled]}
              onPress={handleUpgrade}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <ThemedText style={styles.upgradeButtonText}>
                  Upgrade to Premium - £18/month
                </ThemedText>
              )}
            </Pressable>

            <Pressable
              style={styles.cancelButton}
              onPress={handleCancel}
              disabled={loading}
            >
              <ThemedText style={styles.cancelButtonText}>Maybe later</ThemedText>
            </Pressable>

            <ThemedText style={styles.disclaimer}>
              Secure payment processed by Stripe. Cancel anytime.
            </ThemedText>
          </View>
        </ThemedView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modal: {
    width: '100%',
    maxWidth: 500,
    maxHeight: '90%',
    borderRadius: 12,
    padding: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 24,
    color: '#666',
    fontWeight: 'bold',
  },
  content: {
    padding: 20,
  },
  planCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    padding: 20,
    marginBottom: 20,
    borderWidth: 2,
    borderColor: '#4f46e5',
  },
  planHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  planName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#4f46e5',
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  currency: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  price: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  period: {
    fontSize: 16,
    color: '#666',
    marginLeft: 2,
  },
  featuresList: {
    gap: 8,
  },
  feature: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkmark: {
    fontSize: 16,
    color: '#059669',
    fontWeight: 'bold',
    marginRight: 8,
  },
  featureText: {
    fontSize: 16,
    color: '#374151',
  },
  benefits: {
    marginBottom: 20,
  },
  benefitsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#1a1a1a',
  },
  benefitsText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  guarantee: {
    backgroundColor: '#f0f9ff',
    padding: 16,
    borderRadius: 8,
    marginBottom: 20,
  },
  guaranteeText: {
    fontSize: 14,
    color: '#0369a1',
    marginBottom: 4,
  },
  bold: {
    fontWeight: 'bold',
  },
  guaranteeSubtext: {
    fontSize: 12,
    color: '#0369a1',
  },
  footer: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  upgradeButton: {
    backgroundColor: '#4f46e5',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  upgradeButtonDisabled: {
    backgroundColor: '#9ca3af',
  },
  upgradeButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  cancelButton: {
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  cancelButtonText: {
    color: '#666',
    fontSize: 14,
  },
  disclaimer: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
    lineHeight: 16,
  },
}); 