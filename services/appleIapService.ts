import { getFunctions, httpsCallable } from 'firebase/functions';

interface AppleAccountTokenResponse {
  appAccountToken: string;
}

export interface ApplePurchaseVerificationResponse {
  success: true;
  productId: string;
  transactionId: string;
  originalTransactionId: string;
  renewalDate: string | null;
}

export async function getAppleAppAccountToken(): Promise<string> {
  const fn = httpsCallable<void, AppleAccountTokenResponse>(
    getFunctions(),
    'getAppleAppAccountToken'
  );
  const result = await fn();
  return result.data.appAccountToken;
}

export async function verifyApplePurchase(
  signedTransaction: string
): Promise<ApplePurchaseVerificationResponse> {
  const fn = httpsCallable<
    { signedTransaction: string },
    ApplePurchaseVerificationResponse
  >(getFunctions(), 'verifyApplePurchase');
  const result = await fn({ signedTransaction });
  return result.data;
}
