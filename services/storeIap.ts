// expo-iap loads a native module at import time; web resolves storeIap.web.ts instead.
export {
  deepLinkToSubscriptions,
  endConnection,
  fetchProducts,
  finishTransaction,
  getAvailablePurchases,
  initConnection,
  purchaseErrorListener,
  purchaseUpdatedListener,
  requestPurchase,
  restorePurchases,
} from 'expo-iap';
export type { Purchase } from 'expo-iap';
