const crypto = require('crypto');
const { Buffer } = require('buffer');

const ANDROID_PACKAGE_NAME = 'com.guvnor.roundmanagerapp';
const PREMIUM_PRODUCT_ID = 'premium_monthly';
const PREMIUM_BASE_PLAN_ID = 'monthly';
const RTDN_TOPIC = 'guvnor-play-subscriptions';
const PLAY_BILLING_SERVICE_ACCOUNT =
  'guvnor-play-billing@roundmanagerapp.iam.gserviceaccount.com';
const ANDROID_PUBLISHER_SCOPE =
  'https://www.googleapis.com/auth/androidpublisher';
const CLOUD_PLATFORM_SCOPE =
  'https://www.googleapis.com/auth/cloud-platform';

let googleAuth;

async function getPublisherClient() {
  // Loading Google Auth while Firebase inspects exports can push the CLI past
  // its 10-second function-discovery limit, so initialise it on first use.
  const { GoogleAuth, Impersonated } = require('google-auth-library');
  googleAuth ||= new GoogleAuth({ scopes: [CLOUD_PLATFORM_SCOPE] });
  const sourceClient = await googleAuth.getClient();
  return new Impersonated({
    sourceClient,
    targetPrincipal: PLAY_BILLING_SERVICE_ACCOUNT,
    targetScopes: [ANDROID_PUBLISHER_SCOPE],
    lifetime: 3600,
  });
}

function tokenHash(purchaseToken) {
  return crypto.createHash('sha256').update(purchaseToken).digest('hex');
}

function assertPurchaseToken(purchaseToken, HttpsError) {
  if (
    typeof purchaseToken !== 'string' ||
    purchaseToken.length < 20 ||
    purchaseToken.length > 10000
  ) {
    throw new HttpsError(
      'invalid-argument',
      'A valid Google Play purchase token is required.'
    );
  }
}

async function publisherRequest({ method = 'GET', purchaseToken, data }) {
  const client = await getPublisherClient();
  const encodedToken = encodeURIComponent(purchaseToken);
  const url =
    `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/` +
    `${ANDROID_PACKAGE_NAME}/purchases/subscriptionsv2/tokens/${encodedToken}` +
    (method === 'POST' ? ':cancel' : '');
  const response = await client.request({ url, method, data });
  return response.data || {};
}

function findPremiumLine(subscription) {
  return (subscription.lineItems || []).find(
    (line) =>
      line.productId === PREMIUM_PRODUCT_ID &&
      (!line.offerDetails?.basePlanId ||
        line.offerDetails.basePlanId === PREMIUM_BASE_PLAN_ID)
  );
}

function buildGoogleEntitlement(subscription, purchaseToken) {
  const line = findPremiumLine(subscription);
  const expiresAt = line?.expiryTime || null;
  const expiryMs = expiresAt ? new Date(expiresAt).getTime() : 0;
  const hasPaidTime = Number.isFinite(expiryMs) && expiryMs > Date.now();
  const state = subscription.subscriptionState || 'SUBSCRIPTION_STATE_UNSPECIFIED';

  let status = 'canceled';
  if (state === 'SUBSCRIPTION_STATE_ACTIVE' && hasPaidTime) {
    status = 'active';
  } else if (
    state === 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD' &&
    hasPaidTime
  ) {
    status = 'past_due';
  } else if (
    state === 'SUBSCRIPTION_STATE_CANCELED' &&
    hasPaidTime
  ) {
    // Cancellation stops renewal; access remains until the paid expiry time.
    status = 'active';
  }

  return {
    status,
    productId: line?.productId || null,
    basePlanId: line?.offerDetails?.basePlanId || null,
    purchaseTokenHash: tokenHash(purchaseToken),
    expiresAt,
    autoRenewing: Boolean(line?.autoRenewingPlan?.autoRenewEnabled),
    subscriptionState: state,
    acknowledgementState: subscription.acknowledgementState || null,
  };
}

function entitlementIsUsable(entitlement) {
  return (
    ['active', 'past_due'].includes(entitlement.status) &&
    entitlement.productId === PREMIUM_PRODUCT_ID &&
    entitlement.expiresAt &&
    new Date(entitlement.expiresAt).getTime() > Date.now()
  );
}

module.exports = function buildGooglePlayIap({
  admin,
  onCall,
  onMessagePublished,
  HttpsError,
  updateProviderEntitlement,
}) {
  const db = admin.firestore();

  async function getGooglePlaySubscription(purchaseToken) {
    try {
      return await publisherRequest({ purchaseToken });
    } catch (error) {
      console.error('[Google Play IAP] Publisher API verification failed', {
        status: error?.response?.status || null,
        message: error?.message || 'Unknown error',
      });
      throw error;
    }
  }

  async function reconcilePurchase({
    userId,
    purchaseToken,
    requireUsable,
    requireAccountMatch,
    notificationType = null,
  }) {
    const subscription = await getGooglePlaySubscription(purchaseToken);
    const line = findPremiumLine(subscription);
    if (!line) {
      throw new HttpsError(
        'failed-precondition',
        'This transaction is not for the Guvnor Premium subscription.'
      );
    }

    const userRef = db.collection('users').doc(userId);
    const userSnapshot = await userRef.get();
    if (!userSnapshot.exists) {
      throw new HttpsError('not-found', 'User account not found.');
    }
    const userData = userSnapshot.data() || {};
    const accountId = userData.accountId || userId;
    if (accountId !== userId) {
      throw new HttpsError(
        'permission-denied',
        'Only the account owner can manage this subscription.'
      );
    }

    if (
      requireAccountMatch &&
      subscription.externalAccountIdentifiers?.obfuscatedExternalAccountId !==
        userData.googlePlayAccountId
    ) {
      throw new HttpsError(
        'permission-denied',
        'This Google Play purchase belongs to a different Guvnor account.'
      );
    }

    const entitlement = buildGoogleEntitlement(subscription, purchaseToken);
    if (requireUsable && !entitlementIsUsable(entitlement)) {
      throw new HttpsError(
        'failed-precondition',
        'This Google Play subscription is not active.'
      );
    }

    const hash = tokenHash(purchaseToken);
    const mappingRef = db.collection('googlePlaySubscriptions').doc(hash);
    const linkedHash = subscription.linkedPurchaseToken
      ? tokenHash(subscription.linkedPurchaseToken)
      : null;

    await db.runTransaction(async (transaction) => {
      const mapping = await transaction.get(mappingRef);
      if (mapping.exists && mapping.data().userId !== userId) {
        throw new HttpsError(
          'already-exists',
          'This Google Play subscription is already linked to another Guvnor account.'
        );
      }

      if (linkedHash) {
        const linkedMapping = await transaction.get(
          db.collection('googlePlaySubscriptions').doc(linkedHash)
        );
        if (linkedMapping.exists && linkedMapping.data().userId !== userId) {
          throw new HttpsError(
            'already-exists',
            'This Google Play subscription is linked to another Guvnor account.'
          );
        }
      }

      transaction.set(
        mappingRef,
        {
          userId,
          packageName: ANDROID_PACKAGE_NAME,
          productId: PREMIUM_PRODUCT_ID,
          basePlanId: entitlement.basePlanId,
          purchaseToken,
          purchaseTokenHash: hash,
          linkedPurchaseTokenHash: linkedHash,
          subscriptionState: entitlement.subscriptionState,
          acknowledgementState: entitlement.acknowledgementState,
          autoRenewing: entitlement.autoRenewing,
          expiresAt: entitlement.expiresAt,
          lastNotificationType: notificationType,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
    });

    await updateProviderEntitlement(db, userId, 'google', entitlement);

    return {
      success: true,
      productId: PREMIUM_PRODUCT_ID,
      basePlanId: entitlement.basePlanId,
      renewalDate: entitlement.expiresAt,
      autoRenewing: entitlement.autoRenewing,
      status: entitlement.status,
    };
  }

  const getGooglePlayAccountId = onCall(async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'You must be signed in.');
    }

    const userRef = db.collection('users').doc(request.auth.uid);
    let googlePlayAccountId;
    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(userRef);
      if (!snapshot.exists) {
        throw new HttpsError('not-found', 'User account not found.');
      }
      const userData = snapshot.data() || {};
      if ((userData.accountId || request.auth.uid) !== request.auth.uid) {
        throw new HttpsError(
          'permission-denied',
          'Only the account owner can manage this subscription.'
        );
      }
      googlePlayAccountId = userData.googlePlayAccountId;
      if (!googlePlayAccountId) {
        googlePlayAccountId = crypto.randomBytes(32).toString('hex');
        transaction.set(userRef, { googlePlayAccountId }, { merge: true });
      }
    });
    return { googlePlayAccountId };
  });

  const verifyGooglePlayPurchase = onCall(async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'You must be signed in.');
    }
    const { purchaseToken, productId } = request.data || {};
    assertPurchaseToken(purchaseToken, HttpsError);
    if (productId !== PREMIUM_PRODUCT_ID) {
      throw new HttpsError(
        'invalid-argument',
        'The Google Play product is not supported.'
      );
    }

    try {
      return await reconcilePurchase({
        userId: request.auth.uid,
        purchaseToken,
        requireUsable: true,
        requireAccountMatch: true,
      });
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      throw new HttpsError(
        'unavailable',
        'Google Play could not verify this purchase. Please try again.'
      );
    }
  });

  const googlePlaySubscriptionNotifications = onMessagePublished(
    RTDN_TOPIC,
    async (event) => {
      const message = event.data?.message;
      let notification;
      try {
        notification =
          message?.json ||
          JSON.parse(Buffer.from(message?.data || '', 'base64').toString('utf8'));
      } catch (error) {
        console.error('[Google Play IAP] Invalid RTDN payload', error);
        return;
      }

      const subscriptionNotification = notification?.subscriptionNotification;
      if (
        notification?.packageName !== ANDROID_PACKAGE_NAME ||
        !subscriptionNotification?.purchaseToken
      ) {
        return;
      }

      const purchaseToken = subscriptionNotification.purchaseToken;
      const mapping = await db
        .collection('googlePlaySubscriptions')
        .doc(tokenHash(purchaseToken))
        .get();
      if (!mapping.exists) {
        console.warn('[Google Play IAP] RTDN token is not linked to a Guvnor user');
        return;
      }

      await reconcilePurchase({
        userId: mapping.data().userId,
        purchaseToken,
        requireUsable: false,
        requireAccountMatch: true,
        notificationType: subscriptionNotification.notificationType || null,
      });
    }
  );

  async function cancelGooglePlaySubscription(purchaseToken) {
    assertPurchaseToken(purchaseToken, HttpsError);
    await publisherRequest({
      method: 'POST',
      purchaseToken,
      data: {
        cancellationContext: {
          cancellationType: 'USER_REQUESTED_STOP_RENEWALS',
        },
      },
    });
  }

  return {
    getGooglePlayAccountId,
    verifyGooglePlayPurchase,
    googlePlaySubscriptionNotifications,
    cancelGooglePlaySubscription,
  };
};
