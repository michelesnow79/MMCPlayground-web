
import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import telemetry from './telemetry';

export const registerNotifications = async () => {
    // Only run on native platforms
    if (!Capacitor.isNativePlatform()) {
        console.log("🔔 Notifications: Skip (Web platform)");
        return false;
    }

    try {
        // 1. Check permissions
        let permStatus = await PushNotifications.checkPermissions();

        if (permStatus.receive === 'prompt') {
            permStatus = await PushNotifications.requestPermissions();
        }

        if (permStatus.receive !== 'granted') {
            console.warn("🔔 Notifications: Permission denied");
            return false;
        }

        // 2. Register for push
        await PushNotifications.register();
        console.log("🔔 Notifications: Registered for push");

        // 3. Add Listeners
        addListeners();
        return true;

    } catch (error) {
        console.error("🔔 Notifications: Registration failed", error);
        telemetry.trackError(error, { source: 'push_registration' });
        return false;
    }
};

const addListeners = async () => {
    // Clear old listeners first to avoid duplicates
    await PushNotifications.removeAllListeners();

    // Registration success
    PushNotifications.addListener('registration', token => {
        console.log('🔔 Push Token:', token.value);
        // Here you would send token.value to your backend or save to Firestore user profile
        // e.g. updateUserPushToken(token.value);
    });

    // Registration error
    PushNotifications.addListener('registrationError', error => {
        console.error('🔔 Push Registration Error:', error);
    });

    // Received Notification (Foreground)
    PushNotifications.addListener('pushNotificationReceived', notification => {
        console.log('🔔 Push Received:', notification);
        // Show local toast or alert if needed
    });

    // Action Performed (Tapped notification)
    PushNotifications.addListener('pushNotificationActionPerformed', notification => {
        console.log('🔔 Push Action:', notification.actionId, notification.notification);
        // Navigate logic can go here
        // e.g. if (notification.data.pinId) navigate(`/browse/${notification.data.pinId}`)
    });
};
