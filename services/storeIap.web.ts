// Web uses Stripe; store billing calls are gated to iOS/Android by the callers.
import type * as Native from './storeIap';

export type Purchase = Native.Purchase;

const unavailable = async (): Promise<never> => {
  throw new Error('In-app purchases are not available on web.');
};
const noSubscription = { remove: () => undefined };

export const deepLinkToSubscriptions = unavailable as unknown as typeof Native.deepLinkToSubscriptions;
export const endConnection = (async () => true) as unknown as typeof Native.endConnection;
export const fetchProducts = unavailable as unknown as typeof Native.fetchProducts;
export const finishTransaction = unavailable as unknown as typeof Native.finishTransaction;
export const getAvailablePurchases = unavailable as unknown as typeof Native.getAvailablePurchases;
export const initConnection = unavailable as unknown as typeof Native.initConnection;
export const purchaseErrorListener = (() => noSubscription) as unknown as typeof Native.purchaseErrorListener;
export const purchaseUpdatedListener = (() => noSubscription) as unknown as typeof Native.purchaseUpdatedListener;
export const requestPurchase = unavailable as unknown as typeof Native.requestPurchase;
export const restorePurchases = unavailable as unknown as typeof Native.restorePurchases;
