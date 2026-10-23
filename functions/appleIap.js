const crypto = require('crypto');
const { Buffer } = require('buffer');

const APP_BUNDLE_ID = 'com.guvnor.roundmanagerapp';
const APP_APPLE_ID = 6815394049;
const PREMIUM_PRODUCT_ID = 'com.guvnor.roundmanagerapp.premium.monthly';

// Apple Root CA - G3, downloaded from Apple PKI. Apple currently signs App Store
// transaction chains from this root. Keeping it with the function avoids trusting
// a certificate downloaded over the network during a purchase.
const APPLE_ROOT_CA_G3 = Buffer.from(`-----BEGIN CERTIFICATE-----
MIICQzCCAcmgAwIBAgIILcX8iNLFS5UwCgYIKoZIzj0EAwMwZzEbMBkGA1UEAwwS
QXBwbGUgUm9vdCBDQSAtIEczMSYwJAYDVQQLDB1BcHBsZSBDZXJ0aWZpY2F0aW9u
IEF1dGhvcml0eTETMBEGA1UECgwKQXBwbGUgSW5jLjELMAkGA1UEBhMCVVMwHhcN
MTQwNDMwMTgxOTA2WhcNMzkwNDMwMTgxOTA2WjBnMRswGQYDVQQDDBJBcHBsZSBS
b290IENBIC0gRzMxJjAkBgNVBAsMHUFwcGxlIENlcnRpZmljYXRpb24gQXV0aG9y
aXR5MRMwEQYDVQQKDApBcHBsZSBJbmMuMQswCQYDVQQGEwJVUzB2MBAGByqGSM49
AgEGBSuBBAAiA2IABJjpLz1AcqTtkyJygRMc3RCV8cWjTnHcFBbZDuWmBSp3ZHtf
TjjTuxxEtX/1H7YyYl3J6YRbTzBPEVoA/VhYDKX1DyxNB0cTddqXl5dvMVztK517
IDvYuVTZXpmkOlEKMaNCMEAwHQYDVR0OBBYEFLuw3qFYM4iapIqZ3r6966/ayySr
MA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/BAQDAgEGMAoGCCqGSM49BAMDA2gA
MGUCMQCD6cHEFl4aXTQY2e3v9GwOAEZLuN+yRhHFD/3meoyhpmvOwgPUnPWTxnS4
at+qIxUCMG1mihDK1A3UT82NQz60imOlM27jbdoXt2QfyFMm+YhidDkLF1vLUagM
6BgD56KyKA==
-----END CERTIFICATE-----`);

let verifiers;

function getVerifiers() {
  if (verifiers) return verifiers;
  // The Apple library is deliberately loaded on first request. Loading it while
  // Firebase inspects exports can exceed the CLI's 10-second discovery timeout.
  const {
    Environment,
    SignedDataVerifier,
  } = require('@apple/app-store-server-library');
  verifiers = {
    production: new SignedDataVerifier(
      [APPLE_ROOT_CA_G3],
      true,
      Environment.PRODUCTION,
      APP_BUNDLE_ID,
      APP_APPLE_ID
    ),
    sandbox: new SignedDataVerifier(
      [APPLE_ROOT_CA_G3],
      true,
      Environment.SANDBOX,
      APP_BUNDLE_ID
    ),
  };
  return verifiers;
}

async function verifyInEitherEnvironment(signedData, methodName) {
  const appleVerifiers = getVerifiers();
  try {
    const decoded = await appleVerifiers.production[methodName](signedData);
    return { decoded, environment: 'production' };
  } catch (productionError) {
    try {
      const decoded = await appleVerifiers.sandbox[methodName](signedData);
      return { decoded, environment: 'sandbox' };
    } catch (sandboxError) {
      console.error('[Apple IAP] verification failed in both environments', {
        production: productionError && productionError.message,
        sandbox: sandboxError && sandboxError.message,
      });
      throw sandboxError;
    }
  }
}

function entitlementIsUsable(entitlement, now = Date.now()) {
  if (!entitlement || !['active', 'past_due'].includes(entitlement.status)) {
    return false;
  }
  return !entitlement.expiresAt || new Date(entitlement.expiresAt).getTime() > now;
}

function seedLegacyEntitlements(userData, sources) {
  const result = { ...sources };
  if (
    !result.stripe &&
    userData.stripeSubscriptionId &&
    userData.subscriptionTier === 'premium'
  ) {
    result.stripe = {
      status: userData.subscriptionStatus || 'active',
      subscriptionId: userData.stripeSubscriptionId,
      expiresAt: userData.subscriptionRenewalDate || null,
      updatedAt: userData.updatedAt || new Date().toISOString(),
    };
  }
  if (
    !result.apple &&
    userData.appleOriginalTransactionId &&
    userData.subscriptionTier === 'premium'
  ) {
    result.apple = {
      status: userData.subscriptionStatus || 'active',
      originalTransactionId: userData.appleOriginalTransactionId,
      transactionId: userData.appleTransactionId || null,
      expiresAt: userData.subscriptionRenewalDate || null,
      updatedAt: userData.updatedAt || new Date().toISOString(),
    };
  }
  return result;
}

function effectiveSubscriptionFields(userData, sources) {
  if (userData.isExempt || userData.subscriptionTier === 'exempt') {
    return {
      subscriptionTier: 'exempt',
      subscriptionStatus: 'exempt',
      subscriptionProvider: null,
      subscriptionRenewalDate: null,
      clientLimit: null,
      isExempt: true,
    };
  }

  const usable = Object.entries(sources).filter(([, value]) =>
    entitlementIsUsable(value)
  );
  if (usable.length === 0) {
    return {
      subscriptionTier: 'free',
      subscriptionStatus: 'active',
      subscriptionProvider: null,
      subscriptionRenewalDate: null,
      clientLimit: 20,
      isExempt: false,
    };
  }

  const providers = usable.map(([provider]) => provider);
  const renewalDates = usable
    .map(([, value]) => value.expiresAt)
    .filter(Boolean)
    .sort();
  return {
    subscriptionTier: 'premium',
    subscriptionStatus: usable.some(([, value]) => value.status === 'active')
      ? 'active'
      : 'past_due',
    subscriptionProvider: providers.length > 1 ? 'multiple' : providers[0],
    subscriptionRenewalDate:
      renewalDates.length > 0 ? renewalDates[renewalDates.length - 1] : null,
    clientLimit: null,
    isExempt: false,
  };
}

async function updateProviderEntitlement(db, userId, provider, entitlement) {
  const userRef = db.collection('users').doc(userId);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(userRef);
    if (!snapshot.exists) {
      throw new Error(`User ${userId} was not found`);
    }
    const userData = snapshot.data() || {};
    const sources = seedLegacyEntitlements(
      userData,
      userData.subscriptionEntitlements || {}
    );
    sources[provider] = {
      ...entitlement,
      updatedAt: new Date().toISOString(),
    };

    transaction.set(
      userRef,
      {
        subscriptionEntitlements: sources,
        ...effectiveSubscriptionFields(userData, sources),
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  });
}

function buildAppleEntitlement(decoded, status = 'active') {
  return {
    status,
    productId: decoded.productId,
    originalTransactionId: decoded.originalTransactionId,
    transactionId: decoded.transactionId,
    expiresAt: decoded.expiresDate
      ? new Date(decoded.expiresDate).toISOString()
      : null,
    environment: String(decoded.environment || '').toLowerCase(),
  };
}

module.exports = function buildAppleIap({
  admin,
  onCall,
  onRequest,
  HttpsError,
}) {
  const getAppleAppAccountToken = onCall(async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'You must be signed in.');
    }

    const userRef = admin.firestore().collection('users').doc(request.auth.uid);
    let appAccountToken;
    await admin.firestore().runTransaction(async (transaction) => {
      const snapshot = await transaction.get(userRef);
      if (!snapshot.exists) {
        throw new HttpsError('not-found', 'User account not found.');
      }
      appAccountToken = snapshot.data().appleAppAccountToken;
      if (!appAccountToken) {
        appAccountToken = crypto.randomUUID();
        transaction.set(
          userRef,
          { appleAppAccountToken: appAccountToken },
          { merge: true }
        );
      }
    });
    return { appAccountToken };
  });

  const verifyApplePurchase = onCall(async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'You must be signed in.');
    }
    const signedTransaction = request.data && request.data.signedTransaction;
    if (
      typeof signedTransaction !== 'string' ||
      signedTransaction.length < 100 ||
      signedTransaction.length > 50000
    ) {
      throw new HttpsError(
        'invalid-argument',
        'A valid signed App Store transaction is required.'
      );
    }

    let decoded;
    try {
      ({ decoded } = await verifyInEitherEnvironment(
        signedTransaction,
        'verifyAndDecodeTransaction'
      ));
    } catch (_) {
      throw new HttpsError(
        'permission-denied',
        'Apple could not verify this purchase.'
      );
    }

    if (
      decoded.productId !== PREMIUM_PRODUCT_ID ||
      !decoded.transactionId ||
      !decoded.originalTransactionId
    ) {
      throw new HttpsError(
        'failed-precondition',
        'This transaction is not for the Guvnor Premium subscription.'
      );
    }
    if (
      decoded.revocationDate ||
      !decoded.expiresDate ||
      decoded.expiresDate <= Date.now()
    ) {
      throw new HttpsError(
        'failed-precondition',
        'This App Store subscription is not active.'
      );
    }

    const db = admin.firestore();
    const userRef = db.collection('users').doc(request.auth.uid);
    const subscriptionRef = db
      .collection('appleSubscriptions')
      .doc(decoded.originalTransactionId);

    await db.runTransaction(async (transaction) => {
      const [userSnapshot, subscriptionSnapshot] = await Promise.all([
        transaction.get(userRef),
        transaction.get(subscriptionRef),
      ]);
      if (!userSnapshot.exists) {
        throw new HttpsError('not-found', 'User account not found.');
      }
      const userData = userSnapshot.data() || {};
      if (
        !decoded.appAccountToken ||
        decoded.appAccountToken !== userData.appleAppAccountToken
      ) {
        throw new HttpsError(
          'permission-denied',
          'This purchase belongs to a different Guvnor account.'
        );
      }
      if (
        subscriptionSnapshot.exists &&
        subscriptionSnapshot.data().userId !== request.auth.uid
      ) {
        throw new HttpsError(
          'already-exists',
          'This App Store subscription is already linked to another Guvnor account.'
        );
      }

      const sources = seedLegacyEntitlements(
        userData,
        userData.subscriptionEntitlements || {}
      );
      sources.apple = {
        ...buildAppleEntitlement(decoded),
        updatedAt: new Date().toISOString(),
      };
      transaction.set(
        subscriptionRef,
        {
          userId: request.auth.uid,
          appAccountToken: decoded.appAccountToken,
          productId: decoded.productId,
          originalTransactionId: decoded.originalTransactionId,
          latestTransactionId: decoded.transactionId,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
      transaction.set(
        userRef,
        {
          subscriptionEntitlements: sources,
          ...effectiveSubscriptionFields(userData, sources),
          appleOriginalTransactionId: decoded.originalTransactionId,
          appleTransactionId: decoded.transactionId,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
    });

    return {
      success: true,
      productId: decoded.productId,
      transactionId: decoded.transactionId,
      originalTransactionId: decoded.originalTransactionId,
      renewalDate: new Date(decoded.expiresDate).toISOString(),
    };
  });

  const appleStoreNotifications = onRequest(async (request, response) => {
    if (request.method !== 'POST') {
      response.status(405).send('Method not allowed');
      return;
    }
    const signedPayload = request.body && request.body.signedPayload;
    if (typeof signedPayload !== 'string') {
      response.status(400).send('Missing signedPayload');
      return;
    }

    try {
      const { decoded: notification } = await verifyInEitherEnvironment(
        signedPayload,
        'verifyAndDecodeNotification'
      );
      const signedTransaction =
        notification.data && notification.data.signedTransactionInfo;
      if (!signedTransaction) {
        response.status(200).send('No transaction');
        return;
      }
      const { decoded: transactionInfo } = await verifyInEitherEnvironment(
        signedTransaction,
        'verifyAndDecodeTransaction'
      );
      if (
        transactionInfo.productId !== PREMIUM_PRODUCT_ID ||
        !transactionInfo.originalTransactionId
      ) {
        response.status(200).send('Ignored product');
        return;
      }

      const db = admin.firestore();
      const subscriptionRef = db
        .collection('appleSubscriptions')
        .doc(transactionInfo.originalTransactionId);
      const mapping = await subscriptionRef.get();
      let userId = mapping.exists ? mapping.data().userId : null;
      if (!userId && transactionInfo.appAccountToken) {
        const users = await db
          .collection('users')
          .where('appleAppAccountToken', '==', transactionInfo.appAccountToken)
          .limit(1)
          .get();
        userId = users.empty ? null : users.docs[0].id;
      }
      if (!userId) {
        console.warn(
          '[Apple IAP] notification has no linked Guvnor user',
          transactionInfo.originalTransactionId
        );
        response.status(200).send('No linked user');
        return;
      }

      const terminalTypes = new Set(['EXPIRED', 'REFUND', 'REVOKE']);
      const failureTypes = new Set(['DID_FAIL_TO_RENEW']);
      let status = 'active';
      if (
        terminalTypes.has(notification.notificationType) ||
        transactionInfo.revocationDate ||
        !transactionInfo.expiresDate ||
        transactionInfo.expiresDate <= Date.now()
      ) {
        status = 'canceled';
      } else if (failureTypes.has(notification.notificationType)) {
        status = 'past_due';
      }

      // A renewal-status change only changes whether the next renewal will occur;
      // access remains active through the paid expiry date.
      await updateProviderEntitlement(
        db,
        userId,
        'apple',
        buildAppleEntitlement(transactionInfo, status)
      );
      await subscriptionRef.set(
        {
          userId,
          latestTransactionId: transactionInfo.transactionId || null,
          lastNotificationType: notification.notificationType || null,
          lastNotificationSubtype: notification.subtype || null,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
      response.status(200).send('OK');
    } catch (error) {
      console.error('[Apple IAP] notification processing failed', error);
      response.status(400).send('Invalid notification');
    }
  });

  return {
    getAppleAppAccountToken,
    verifyApplePurchase,
    appleStoreNotifications,
    updateProviderEntitlement,
  };
};
