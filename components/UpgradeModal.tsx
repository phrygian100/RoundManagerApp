import React, { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Linking,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    View,
} from 'react-native';
import {
  endConnection,
  fetchProducts,
  finishTransaction,
  getAvailablePurchases,
  initConnection,
  purchaseErrorListener,
  purchaseUpdatedListener,
  requestPurchase,
  restorePurchases,
  type Purchase,
} from '../services/storeIap';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { config } from '../config';
import { auth } from '../core/firebase';
import {
  APPLE_PREMIUM_MONTHLY_PRODUCT_ID,
  APPLE_STANDARD_EULA_URL,
  GUVNOR_PRIVACY_POLICY_URL,
} from '../shared/constants/appleIap';
import {
  PREMIUM_PRICE_AMOUNT_DISPLAY,
  PREMIUM_PRICE_PER_MONTH_LABEL,
} from '../shared/constants/pricing';
import {
  getAppleAppAccountToken,
  verifyApplePurchase,
} from '../services/appleIapService';
import {
  GOOGLE_PLAY_PREMIUM_BASE_PLAN_ID,
  GOOGLE_PLAY_PREMIUM_PRODUCT_ID,
} from '../shared/constants/googlePlayIap';
import {
  getGooglePlayAccountId,
  verifyGooglePlayPurchase,
} from '../services/googlePlayIapService';
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
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [storeReady, setStoreReady] = useState(Platform.OS === 'web');
  const [storeConnected, setStoreConnected] = useState(Platform.OS === 'web');
  const [storeLoading, setStoreLoading] = useState(false);
  const [storeMessage, setStoreMessage] = useState<string | null>(null);
  const [storeDisplayPrice, setStoreDisplayPrice] = useState<string | null>(null);
  const [androidOfferToken, setAndroidOfferToken] = useState<string | null>(null);
  const onUpgradeSuccessRef = useRef(onUpgradeSuccess);

  useEffect(() => {
    onUpgradeSuccessRef.current = onUpgradeSuccess;
  }, [onUpgradeSuccess]);

  useEffect(() => {
    if (Platform.OS === 'web' || !visible) return;

    let active = true;
    const expectedProductId =
      Platform.OS === 'ios'
        ? APPLE_PREMIUM_MONTHLY_PRODUCT_ID
        : GOOGLE_PLAY_PREMIUM_PRODUCT_ID;
    const storeName = Platform.OS === 'ios' ? 'App Store' : 'Google Play';
    const purchaseSubscription = purchaseUpdatedListener(
      async (purchase: Purchase) => {
        if (!active || purchase.productId !== expectedProductId) {
          return;
        }
        if (
          'purchaseStateAndroid' in purchase &&
          purchase.purchaseStateAndroid === 2
        ) {
          setLoading(false);
          Alert.alert(
            'Purchase Pending',
            'Google Play is still processing this purchase. Premium will activate after payment is confirmed.'
          );
          return;
        }
        try {
          if (!purchase.purchaseToken) {
            throw new Error(`${storeName} did not return a purchase token.`);
          }
          if (Platform.OS === 'ios') {
            await verifyApplePurchase(purchase.purchaseToken);
          } else {
            await verifyGooglePlayPurchase(
              purchase.purchaseToken,
              GOOGLE_PLAY_PREMIUM_PRODUCT_ID
            );
          }
          await finishTransaction({ purchase, isConsumable: false });
          if (!active) return;
          setLoading(false);
          setRestoring(false);
          onUpgradeSuccessRef.current?.();
        } catch (error) {
          console.error(`${storeName} purchase verification failed:`, error);
          if (!active) return;
          setLoading(false);
          setRestoring(false);
          Alert.alert(
            'Purchase Could Not Be Verified',
            'No charge has been lost. Please try Restore Purchases, or contact support@guvnor.app if the problem continues.'
          );
        }
      }
    );
    const errorSubscription = purchaseErrorListener((error) => {
      if (!active) return;
      setLoading(false);
      setRestoring(false);
      if (
        error.code !== 'E_USER_CANCELLED' &&
        String(error.code) !== 'user-cancelled'
      ) {
        Alert.alert(
          'Purchase Failed',
          error.message || 'The App Store could not complete the purchase.'
        );
      }
    });

    void (async () => {
      setStoreLoading(true);
      setStoreReady(false);
      setStoreConnected(false);
      setStoreMessage(null);
      setStoreDisplayPrice(null);
      setAndroidOfferToken(null);
      try {
        await initConnection();
        if (!active) return;
        setStoreConnected(true);
        const productId = expectedProductId;
        const products = await fetchProducts({
          skus: [productId],
          type: 'subs',
        });
        if (!active) return;
        console.info(
          `${storeName} subscription products returned:`,
          products?.map((product) => product.id) ?? []
        );
        const premium = products?.find(
          (product) => product.id === productId
        );
        const offer =
          Platform.OS === 'android' &&
          premium &&
          'subscriptionOfferDetailsAndroid' in premium
            ? premium.subscriptionOfferDetailsAndroid?.find(
                (candidate) =>
                  candidate.basePlanId ===
                    GOOGLE_PLAY_PREMIUM_BASE_PLAN_ID &&
                  Boolean(candidate.offerToken)
              )
            : null;
        const recurringPhase = offer?.pricingPhases?.pricingPhaseList?.at(-1);
        setStoreDisplayPrice(
          recurringPhase?.formattedPrice || premium?.displayPrice || null
        );
        setAndroidOfferToken(offer?.offerToken || null);
        const isReady =
          Platform.OS === 'android'
            ? Boolean(premium && offer?.offerToken)
            : Boolean(premium);
        setStoreReady(isReady);
        if (!isReady) {
          setStoreMessage(
            `Premium is temporarily unavailable from ${storeName}. Please try again later.`
          );
        }
      } catch (error) {
        console.error(`Unable to connect to ${storeName}:`, error);
        if (active) {
          setStoreConnected(false);
          setStoreReady(false);
          setStoreMessage(
            `${storeName} could not be reached. Check your connection and try again.`
          );
        }
      } finally {
        if (active) setStoreLoading(false);
      }
    })();

    return () => {
      active = false;
      purchaseSubscription.remove();
      errorSubscription.remove();
      void endConnection().catch(() => undefined);
    };
  }, [visible]);

  const handleUpgrade = async () => {
    setLoading(true);
    
    try {
      if (Platform.OS === 'web') {
        await handleWebUpgrade();
      } else if (Platform.OS === 'ios') {
        if (!storeReady) {
          throw new Error(
            'The App Store is not available yet. Check your connection and try again.'
          );
        }
        const appAccountToken = await getAppleAppAccountToken();
        await requestPurchase({
          request: {
            ios: {
              sku: APPLE_PREMIUM_MONTHLY_PRODUCT_ID,
              appAccountToken,
            },
          },
          type: 'subs',
        });
        return;
      } else {
        if (!storeReady || !androidOfferToken) {
          throw new Error(
            'Google Play is not available yet. Check your connection and try again.'
          );
        }
        const googlePlayAccountId = await getGooglePlayAccountId();
        await requestPurchase({
          request: {
            android: {
              skus: [GOOGLE_PLAY_PREMIUM_PRODUCT_ID],
              subscriptionOffers: [
                {
                  sku: GOOGLE_PLAY_PREMIUM_PRODUCT_ID,
                  offerToken: androidOfferToken,
                },
              ],
              obfuscatedAccountIdAndroid: googlePlayAccountId,
            },
          },
          type: 'subs',
        });
        return;
      }
    } catch (error) {
      console.error('Upgrade error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to process upgrade';
      if (Platform.OS !== 'web') setLoading(false);
      
      if (Platform.OS === 'web') {
        window.alert(`Upgrade Failed: ${errorMessage}`);
      } else {
        Alert.alert('Upgrade Failed', errorMessage);
      }
    } finally {
      if (Platform.OS === 'web') setLoading(false);
    }
  };

  const handleRestorePurchases = async () => {
    if (Platform.OS === 'web') return;
    setRestoring(true);
    try {
      if (!storeConnected) {
        throw new Error(
          `${Platform.OS === 'ios' ? 'The App Store' : 'Google Play'} is not available yet.`
        );
      }
      await restorePurchases();
      const purchases = await getAvailablePurchases(
        Platform.OS === 'ios'
          ? { onlyIncludeActiveItemsIOS: true }
          : undefined
      );
      const expectedProductId =
        Platform.OS === 'ios'
          ? APPLE_PREMIUM_MONTHLY_PRODUCT_ID
          : GOOGLE_PLAY_PREMIUM_PRODUCT_ID;
      const premiumPurchase = purchases.find(
        (purchase) =>
          purchase.productId === expectedProductId &&
          purchase.purchaseToken
      );
      if (!premiumPurchase?.purchaseToken) {
        Alert.alert(
          'Nothing to Restore',
          `No active Guvnor Premium subscription was found for this ${
            Platform.OS === 'ios' ? 'Apple ID' : 'Google Play account'
          }.`
        );
        return;
      }
      if (Platform.OS === 'ios') {
        await verifyApplePurchase(premiumPurchase.purchaseToken);
      } else {
        await verifyGooglePlayPurchase(
          premiumPurchase.purchaseToken,
          GOOGLE_PLAY_PREMIUM_PRODUCT_ID
        );
      }
      await finishTransaction({
        purchase: premiumPurchase,
        isConsumable: false,
      });
      onUpgradeSuccessRef.current?.();
    } catch (error) {
      console.error('Restore purchases failed:', error);
      const message =
        error instanceof Error
          ? error.message
          : 'The App Store could not restore your purchase.';
      Alert.alert('Restore Failed', message);
    } finally {
      setRestoring(false);
    }
  };

  const handleWebUpgrade = async () => {
    console.log('🚀 [DEBUG] Starting web upgrade process...');
    
    try {
      // Get the current user's auth token
      const user = auth.currentUser;
      
      console.log('🔐 [DEBUG] Auth state:', {
        userExists: !!user,
        uid: user?.uid,
        email: user?.email,
        isAnonymous: user?.isAnonymous,
        emailVerified: user?.emailVerified
      });
      
      if (!user) {
        throw new Error('User not authenticated');
      }
      
      console.log('🎫 [DEBUG] Getting ID token...');
      const idToken = await user.getIdToken();
      console.log('🎫 [DEBUG] ID token obtained:', {
        tokenLength: idToken.length,
        tokenStart: idToken.substring(0, 20) + '...'
      });
      
      const requestBody = {
        priceId: config.stripe.premiumPriceId,
        successUrl: `${window.location.origin}/upgrade-success`,
        cancelUrl: `${window.location.origin}/upgrade-cancelled`,
      };
      
      console.log('📦 [DEBUG] Request details:', {
        url: 'https://roundmanagerapp.web.app/api/createCheckoutSession',
        method: 'POST',
        body: requestBody,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer [REDACTED]'
        },
        currentOrigin: window.location.origin,
        userAgent: navigator.userAgent
      });
      
      // Create Stripe Checkout session using REST API (now proxied through Firebase Hosting)
      console.log('🌐 [DEBUG] Making API request...');
      const response = await fetch('https://roundmanagerapp.web.app/api/createCheckoutSession', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify(requestBody),
      });

      console.log('📡 [DEBUG] Response received:', {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        headers: Object.fromEntries(response.headers.entries()),
        url: response.url
      });

      if (!response.ok) {
        console.error('❌ [DEBUG] Response not OK, attempting to parse error...');
        let errorData;
        const contentType = response.headers.get('content-type');
        console.log('📋 [DEBUG] Response content-type:', contentType);
        
        try {
          const responseText = await response.text();
          console.log('📝 [DEBUG] Raw response text:', responseText);
          
          if (contentType && contentType.includes('application/json')) {
            errorData = JSON.parse(responseText);
          } else {
            errorData = { error: `HTTP ${response.status}: ${responseText || response.statusText}` };
          }
        } catch (parseError) {
          console.error('🔥 [DEBUG] Error parsing response:', parseError);
          errorData = { error: `HTTP ${response.status}: Failed to parse error response` };
        }
        
        console.error('💥 [DEBUG] Final error data:', errorData);
        throw new Error(errorData.error || 'Failed to create checkout session');
      }

      console.log('✅ [DEBUG] Success response, parsing JSON...');
      const responseData = await response.json();
      console.log('🎉 [DEBUG] Success data:', responseData);
      
      const { url } = responseData;
      
      if (!url) {
        console.error('🚫 [DEBUG] No URL in response data');
        throw new Error('No checkout URL returned from server');
      }
      
      console.log('🚀 [DEBUG] Redirecting to Stripe Checkout:', url);
      // Redirect to Stripe Checkout
      window.location.href = url;
    } catch (error) {
      console.error('💀 [DEBUG] Web upgrade error:', error);
      console.error('💀 [DEBUG] Error stack:', error instanceof Error ? error.stack : 'No stack available');
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
      <View
        style={[
          styles.overlay,
          Platform.OS !== 'web' && {
            paddingTop: Math.max(20, insets.top + 8),
            paddingBottom: Math.max(20, insets.bottom + 8),
          },
        ]}
      >
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

          <ScrollView style={styles.content}>
            <View style={styles.planCard}>
              <View style={styles.planHeader}>
                <ThemedText style={styles.planName}>Premium Plan</ThemedText>
                <View style={styles.priceContainer}>
                  {Platform.OS === 'web' && (
                    <ThemedText style={styles.currency}>£</ThemedText>
                  )}
                  <ThemedText style={styles.price}>
                    {Platform.OS !== 'web'
                      ? storeDisplayPrice ||
                        (storeLoading ? 'Checking…' : 'Unavailable')
                      : PREMIUM_PRICE_AMOUNT_DISPLAY}
                  </ThemedText>
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

            {Platform.OS !== 'web' && storeMessage && (
              <ThemedText style={styles.storeNotice}>{storeMessage}</ThemedText>
            )}

            <View style={styles.benefits}>
              <ThemedText style={styles.benefitsTitle}>Why upgrade?</ThemedText>
              <ThemedText style={styles.benefitsText}>
                • Scale your business without client limits{'\n'}
                • Collaborate with team members{'\n'}
                • Get help when you need it most{'\n'}
                • Access powerful business insights
              </ThemedText>
            </View>

          </ScrollView>

          <View style={styles.footer}>
            <Pressable
              style={[
                styles.upgradeButton,
                (loading ||
                  (Platform.OS !== 'web' &&
                    (storeLoading || !storeReady))) &&
                  styles.upgradeButtonDisabled,
              ]}
              onPress={handleUpgrade}
              disabled={
                loading ||
                (Platform.OS !== 'web' && (storeLoading || !storeReady))
              }
            >
              {loading ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <ThemedText style={styles.upgradeButtonText}>
                  {Platform.OS !== 'web' && storeLoading
                    ? `Checking ${
                        Platform.OS === 'ios' ? 'App Store' : 'Google Play'
                      }…`
                    : Platform.OS !== 'web' && !storeReady
                      ? 'Subscription unavailable'
                      : `Upgrade to Premium - ${
                          Platform.OS !== 'web'
                            ? `${storeDisplayPrice}/month`
                            : PREMIUM_PRICE_PER_MONTH_LABEL
                        }`}
                </ThemedText>
              )}
            </Pressable>

            {Platform.OS !== 'web' && (
              <Pressable
                style={styles.restoreButton}
                onPress={handleRestorePurchases}
                disabled={loading || restoring}
              >
                {restoring ? (
                  <ActivityIndicator size="small" color="#4f46e5" />
                ) : (
                  <ThemedText style={styles.restoreButtonText}>
                    Restore Purchases
                  </ThemedText>
                )}
              </Pressable>
            )}

            <Pressable
              style={styles.cancelButton}
              onPress={handleCancel}
              disabled={loading}
            >
              <ThemedText style={styles.cancelButtonText}>Maybe later</ThemedText>
            </Pressable>

            <ThemedText style={styles.disclaimer}>
              {Platform.OS === 'ios'
                ? 'Payment is charged to your Apple ID. The subscription renews monthly unless cancelled at least 24 hours before renewal.'
                : Platform.OS === 'android'
                  ? 'Payment is charged through Google Play. The subscription renews monthly unless cancelled in Google Play.'
                  : 'Secure payment processed by Stripe. Cancel anytime.'}
            </ThemedText>
            {Platform.OS === 'ios' && (
              <View style={styles.legalLinks}>
                <Pressable
                  onPress={() => void Linking.openURL(GUVNOR_PRIVACY_POLICY_URL)}
                >
                  <ThemedText style={styles.legalLink}>Privacy Policy</ThemedText>
                </Pressable>
                <ThemedText style={styles.legalSeparator}>·</ThemedText>
                <Pressable
                  onPress={() => void Linking.openURL(APPLE_STANDARD_EULA_URL)}
                >
                  <ThemedText style={styles.legalLink}>Terms of Use</ThemedText>
                </Pressable>
              </View>
            )}
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
    flexShrink: 1,
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
  storeNotice: {
    color: '#b45309',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 16,
    textAlign: 'center',
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
  restoreButton: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  restoreButtonText: {
    color: '#4f46e5',
    fontSize: 14,
    fontWeight: '600',
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
  legalLinks: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  legalLink: {
    color: '#4f46e5',
    fontSize: 12,
    textDecorationLine: 'underline',
  },
  legalSeparator: {
    color: '#999',
    marginHorizontal: 8,
  },
}); 