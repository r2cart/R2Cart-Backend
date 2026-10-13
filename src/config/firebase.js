import admin from 'firebase-admin';

let firebaseApp = null;
let messaging = null;

try {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (serviceAccountJson) {
    const serviceAccount = JSON.parse(serviceAccountJson);
    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    messaging = admin.messaging(firebaseApp);
    console.log('[Firebase Admin] Successfully initialized with FIREBASE_SERVICE_ACCOUNT.');
  } else if (projectId && clientEmail && privateKey) {
    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey: privateKey.replace(/\\n/g, '\n'),
      }),
    });
    messaging = admin.messaging(firebaseApp);
    console.log('[Firebase Admin] Successfully initialized with environment credentials.');
  } else {
    console.warn('[Firebase Admin] Notice: Firebase credentials not set in .env. FCM push will be queued or skipped until credentials are added.');
  }
} catch (err) {
  console.error('[Firebase Admin] Initialization warning:', err.message);
}

export function getFirebaseMessaging() {
  return messaging;
}

export { admin, firebaseApp };
