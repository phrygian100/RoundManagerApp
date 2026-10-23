import { getFunctions, httpsCallable } from 'firebase/functions';

interface GooglePlayAccountIdResponse {
  googlePlayAccountId: string;
}

export interface GooglePlayPurchaseVerificationResponse {
  success: true;
  productId: string;
  basePlanId: string | null;
  renewalDate: string | null;
  autoRenewing: boolean;
  status: 'active' | 'past_due';
}

export async function getGooglePlayAccountId(): Promise<string> {
  const fn = httpsCallable<void, GooglePlayAccountIdResponse>(
    getFunctions(),
    'getGooglePlayAccountId'
  );
  const result = await fn();
  return result.data.googlePlayAccountId;
}

export async function verifyGooglePlayPurchase(
  purchaseToken: string,
  productId: string
): Promise<GooglePlayPurchaseVerificationResponse> {
  const fn = httpsCallable<
    { purchaseToken: string; productId: string },
    GooglePlayPurchaseVerificationResponse
  >(getFunctions(), 'verifyGooglePlayPurchase');
  const result = await fn({ purchaseToken, productId });
  return result.data;
}
