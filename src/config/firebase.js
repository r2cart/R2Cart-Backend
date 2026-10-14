import 'dotenv/config';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';

let firebaseApp = null;
let messaging = null;

try {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  const fallbackPrivateKey = `-----BEGIN PRIVATE KEY-----\nMIIEvwIBADANBgkqhkiG9w0BAQEFAASCBKkwggSlAgEAAoIBAQDyxnpuLCBRVTmf\nm+AEWoNoXVXzRFZYnm7tRTP5/h7wv+m7Jrr5TcaDMUdrYauoVfAQM3rc/UudAUoD\nUmwrxiqYusBA8UF7Y/oozau03RTkaG3C9MHj3qr9EmRKLzzbQZuj1Y2VguxH+259\nC6PEqdKqOtczxt5vkWgPLINZcDIMEXZRs82g7kbb/+z6PeaxgBgXy8Bh1HL5T6fh\n+tb3dfv26zC4fHEhAuWb8qhDULOeAO8yE3giu3xWDEZ3xWKF0y8LNFh64zZXbk1l\niauRmDXbbnl5GuufXHNn1I2ngkfR7CcHs0nCe/KOpskekL4VZswRWHeQ1kdYuCpv\n+c6oGiwZAgMBAAECggEAAIwdgQuU7BIE3f0AOYpJsw3I0JJWHn+G8P5/sj/WKoVI\nPd2FvOOlv6x4BIA1Hp1I/ARdsctZZQp4c/720vdwp6T+I3dXxjMwwHBMQ41fC2/H\n1ZFvMXgSSx1EQB2Qpc7lTq5/0fc4WKYyttH0pdAbMzqMOyfm3voFMcmQJz63Qisz\nyPy/HdbG3NvX2VkyDzGcjJlrKhlVkc1eDTetmzo6dtoxbAIVX8tZZRo/0earxyjL\nrkIacAie6M8SYI/J0/nrfyjJ3qwSBPV8DPNectGqri2LqWaurNPVyP/TqS3n72KG\nU/a5cyBMFGzSQjYCxJL6n+AjxIkhMds4tveVP9p4IQKBgQD/UjUrX/I0qeHQxS2d\nIij/pFoR4fRzGcYil9YZ49DZavRCH2F8XScXuZPmQSbvQ93d5hZ7kiLv2zFBrbZ1\nN6UgALSdaEruexFVXOsVOBNvpcXCgu2fYSH5npJZdRcvcKA3Mfp6/FRd4+I2DjBG\nXOxtoi0vxInGPCnYd0u2qEcfsQKBgQDza7sYyuplIN4TNkkxD7GjkIWVWHWVFA8w\nPgzJXm+GCOBdkpk1842BuyKusE+TQ+sIik4VBJUumvE4ianB9q8wQeICLfzgSKW5\nVkuYMJoAFvIygX4q31kJBGh6W+LiKevWuzVGlhQqKB+nXeEncCUf4KInAcF+Goj/\nxsiTIMyU6QKBgQDXqlsbHlp6vZzvOf8Dod07w1oJjPFtYDIK+nJxQAwj+sIEMHmq\nEQ16btlNP29h39PDIh2Pl6tHK8F5lwBuFui2FaJ666OPugi0MF6qd8mDH2XinbGW\nVPfb4GQCiHNjMSFEPkU0KXwiKuHjgyyn4soa+Uht9vfhqOQ34tzjl1UsoQKBgQCY\nXL0+VnyCkiEOy3Lip50b8TD7+uOWTXj4TE56mIab0eCGEWWe1HSlWDnsN+WHGwL5\nVIBtPXIXOtpz9g7wnnSncwWBMcHPrQk2SeKFPx6Vocc1f8I2GZjEQSMYO3127KB2\nxrUhGn1CqdyuSN/ObK6AFn3IhpvTT86iso0HMod7SQKBgQDj9G9wQ9LgzA7qO6D9\nEpQwQbdlHt3GXwTAhXYpHlrPpwzLc/1b3iJYL48aB78vufvcDaDh+4cM3b7EoLhy\nbjokK11eO5MsZOQ6q/DFFp/djRchf3AGR7kPs5C7fpjQoHyaUDIBXEnMC5W1LscO\nvqB4cJ9wpA/WsOnOzzhKUkE+Ww==\n-----END PRIVATE KEY-----\n`;

  const finalProjectId = projectId || 'r2cart';
  const finalClientEmail = clientEmail || 'firebase-adminsdk-fbsvc@r2cart.iam.gserviceaccount.com';
  const finalPrivateKey = (privateKey || fallbackPrivateKey).replace(/\\n/g, '\n');

  if (serviceAccountJson) {
    const serviceAccount = JSON.parse(serviceAccountJson);
    firebaseApp = !getApps().length
      ? initializeApp({ credential: cert(serviceAccount) })
      : getApps()[0];
    messaging = getMessaging(firebaseApp);
    console.log('[Firebase Admin] Successfully initialized with FIREBASE_SERVICE_ACCOUNT.');
  } else if (finalProjectId && finalClientEmail && finalPrivateKey) {
    firebaseApp = !getApps().length
      ? initializeApp({
          credential: cert({
            projectId: finalProjectId,
            clientEmail: finalClientEmail,
            privateKey: finalPrivateKey,
          }),
        })
      : getApps()[0];
    messaging = getMessaging(firebaseApp);
    console.log('[Firebase Admin] Successfully initialized with environment credentials.');
  } else {
    console.warn('[Firebase Admin] Notice: Firebase credentials not set in .env.');
  }
} catch (err) {
  console.error('[Firebase Admin] Initialization warning:', err.message);
}

export function getFirebaseMessaging() {
  return messaging;
}

export { firebaseApp };
