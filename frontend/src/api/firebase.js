/**
 * Firebase Cloud Messaging — Unified module.
 *
 * Combines configuration + backend API helpers so all Firebase logic
 * lives in one place under api/.
 *
 * Re-exported from services/firebaseConfig.js and services/firebaseService.js
 * for backward compatibility.
 */

import { api } from './api';

// ─── Configuration ────────────────────────────────────────────────────
const firebaseEnv = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
  vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY || '',
};

export const firebaseConfig = {
  apiKey: firebaseEnv.apiKey,
  authDomain: firebaseEnv.authDomain,
  projectId: firebaseEnv.projectId,
  storageBucket: firebaseEnv.storageBucket,
  messagingSenderId: firebaseEnv.messagingSenderId,
  appId: firebaseEnv.appId,
};

export const isFirebaseMessagingConfigured = Object.values(firebaseEnv).every(Boolean);

let firebaseInitPromise = null;
let foregroundHandlerAttached = false;
const defaultNotificationIcon = '/favicon.svg';

const resolveNotificationActionUrl = (data = {}) => {
  if (data.url) return data.url;
  if (data.click_action) return data.click_action;
  if (data.action === 'view_ticket' && data.ticket_id) return '/admin/service-tickets';
  if (data.action === 'view_inventory' && data.inventory_item_id) return '/admin/inventory';
  if (data.action === 'view_job' && data.job_id) return '/technician/my-jobs';
  return '/';
};

const buildFirebaseServiceWorkerUrl = () => {
  const serviceWorkerUrl = new URL('/firebase-messaging-sw.js', window.location.origin);
  Object.entries(firebaseEnv).forEach(([key, value]) => {
    if (value) serviceWorkerUrl.searchParams.set(key, value);
  });
  return serviceWorkerUrl.toString();
};

async function registerFirebaseServiceWorker() {
  if (!('serviceWorker' in navigator)) return null;
  const registration = await navigator.serviceWorker.register(
    buildFirebaseServiceWorkerUrl(),
    { scope: '/' }
  );
  await navigator.serviceWorker.ready;
  return registration;
}

async function initializeFirebaseInternal() {
  if (!isFirebaseMessagingConfigured) return { success: false, reason: 'not_configured' };
  if (typeof window === 'undefined' || typeof Notification === 'undefined') return { success: false, reason: 'unsupported' };

  try {
    const { initializeApp, getApp, getApps } = await import('firebase/app');
    const { getMessaging, getToken, isSupported } = await import('firebase/messaging');

    if (!(await isSupported())) return { success: false, reason: 'unsupported' };

    const serviceWorkerRegistration = await registerFirebaseServiceWorker();
    const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    const messaging = getMessaging(app);

    try {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        const token = await getToken(messaging, {
          vapidKey: firebaseEnv.vapidKey,
          serviceWorkerRegistration: serviceWorkerRegistration || undefined,
        });
        if (token) {
          return { success: true, token, messaging };
        }
        return { success: false, reason: 'token_unavailable' };
      }
      if (permission === 'denied') {
        console.warn('Notification permission denied by user');
        return { success: false, reason: 'permission_denied' };
      }
      return { success: false, reason: 'permission_dismissed' };
    } catch (error) {
      console.error('Error getting Firebase token:', error);
      return { success: false, error };
    }
  } catch (error) {
    console.error('Firebase initialization failed:', error);
    return { success: false, error };
  }
}

export async function initializeFirebase() {
  if (!firebaseInitPromise) firebaseInitPromise = initializeFirebaseInternal();
  return firebaseInitPromise;
}

export async function setupMessageHandler(messaging) {
  if (!isFirebaseMessagingConfigured || foregroundHandlerAttached) return;
  if (typeof window === 'undefined' || typeof Notification === 'undefined') return;

  try {
    const { onMessage } = await import('firebase/messaging');
    foregroundHandlerAttached = true;
    onMessage(messaging, (payload) => {
      const payloadData = payload.data || {};
      const notificationTitle = payload.notification?.title || 'Notification';
      const notificationOptions = {
        body: payload.notification?.body || '',
        icon: payload.notification?.icon || payloadData.icon || defaultNotificationIcon,
        badge: payloadData.badge || payloadData.icon || defaultNotificationIcon,
        tag: payloadData.type || 'default',
        data: { ...payloadData, url: resolveNotificationActionUrl(payloadData) },
      };

      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready.then((registration) => {
          registration.showNotification(notificationTitle, notificationOptions);
        });
      } else {
        new Notification(notificationTitle, notificationOptions);
      }

      window.dispatchEvent(new CustomEvent('firebase-notification', { detail: payload }));
    });
  } catch (error) {
    foregroundHandlerAttached = false;
    console.error('Error setting up message handler:', error);
  }
}

// ─── Backend API helpers ──────────────────────────────────────────────
export const registerFCMToken = async (fcmToken, deviceName = '', deviceType = 'web') => {
  try {
    const response = await api.post('/notifications/firebase-tokens/register/', {
      fcm_token: fcmToken,
      device_name: deviceName,
      device_type: deviceType,
    });
    return { success: true, data: response.data };
  } catch (error) {
    console.error('Failed to register FCM token:', error);
    return { success: false, error };
  }
};

export const deregisterFCMToken = async (fcmToken, authToken = null) => {
  try {
    const response = await api.post(
      '/notifications/firebase-tokens/deregister/',
      { fcm_token: fcmToken },
      authToken ? { headers: { Authorization: `Token ${authToken}` } } : undefined
    );
    return { success: true };
  } catch (error) {
    console.error('Failed to deregister FCM token:', error);
    return { success: false, error };
  }
};

export const getUserFCMTokens = async () => {
  try {
    const response = await api.get('/notifications/firebase-tokens/');
    return { success: true, data: response.data };
  } catch (error) {
    console.error('Failed to get FCM tokens:', error);
    return { success: false, error };
  }
};

export const saveFCMTokenLocally = (token) => {
  localStorage.setItem('afn_fcm_token', token);
};

export const getSavedFCMToken = () => {
  return localStorage.getItem('afn_fcm_token');
};

export const removeSavedFCMToken = () => {
  localStorage.removeItem('afn_fcm_token');
};
