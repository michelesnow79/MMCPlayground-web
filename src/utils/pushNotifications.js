/**
 * Push Notification Service
 * 
 * Handles:
 * 1. Requesting permission from the user.
 * 2. Getting the FCM device token.
 * 3. Saving the token to Firestore under the user's document.
 * 4. Listening for foreground push notifications.
 */
import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

const isNative = Capacitor.isNativePlatform();

/**
 * Call this once after a user is confirmed logged in.
 * @param {string} uid - The logged-in user's Firebase UID.
 */
export const initPushNotifications = async (uid) => {
    if (!isNative) {
        // Push notifications only work on real devices / simulators
        console.log('[Push] Skipping: Not a native platform.');
        return;
    }

    if (!uid) {
        console.warn('[Push] Skipping: No UID provided.');
        return;
    }

    // 1. Request Permission
    let permStatus = await PushNotifications.checkPermissions();

    if (permStatus.receive === 'prompt') {
        permStatus = await PushNotifications.requestPermissions();
    }

    if (permStatus.receive !== 'granted') {
        console.warn('[Push] Permission denied by user.');
        return;
    }

    // 2. Register with APNs/FCM
    await PushNotifications.register();

    // 3. On Registration: Save token to Firestore
    PushNotifications.addListener('registration', async (token) => {
        console.log('[Push] FCM Token received:', token.value);
        try {
            const userRef = doc(db, 'users', uid);
            await updateDoc(userRef, { fcmToken: token.value });
            console.log('[Push] Token saved to Firestore for user:', uid);
        } catch (err) {
            console.error('[Push] Failed to save FCM token:', err.message);
        }
    });

    // 4. Registration Error Handler
    PushNotifications.addListener('registrationError', (err) => {
        console.error('[Push] Registration error:', err.error);
    });

    // 5. Foreground Notification Handler
    // (When app is open and a notification arrives)
    PushNotifications.addListener('pushNotificationReceived', (notification) => {
        console.log('[Push] Foreground notification received:', notification);
        // The native system won't show a banner when app is in foreground.
        // You can trigger an in-app toast/alert here if needed.
    });

    // 6. Tap Handler (User tapped the notification from tray)
    PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
        const threadId = action.notification?.data?.threadId;
        if (threadId) {
            console.log('[Push] Notification tapped. Navigate to thread:', threadId);
            // Navigation is handled by the component that imports this — 
            // set a global state or use a router ref (see AppContext wiring).
        }
    });
};

/**
 * Clears the FCM token from Firestore on logout.
 * Prevents push notifications from being sent to a logged-out device.
 * @param {string} uid
 */
export const clearPushToken = async (uid) => {
    if (!isNative || !uid) return;
    try {
        const userRef = doc(db, 'users', uid);
        await updateDoc(userRef, { fcmToken: null });
        console.log('[Push] FCM token cleared for user:', uid);
    } catch (err) {
        console.error('[Push] Failed to clear FCM token:', err.message);
    }
};
