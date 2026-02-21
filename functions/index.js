const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");

initializeApp();

/**
 * Trigger: Fires every time a new message is added to a thread.
 * Path:    threads/{threadId}/messages/{messageId}
 *
 * Logic:
 *  1. Get sender and thread info.
 *  2. Determine recipient (the OTHER participant).
 *  3. Look up recipient's FCM token from their user document.
 *  4. Send a push notification.
 */
exports.onNotificationCreate = onDocumentCreated(
    "threads/{threadId}/messages/{messageId}",
    async (event) => {
        const db = getFirestore();
        const messageData = event.data.data();
        const { threadId } = event.params;

        if (!messageData) return;

        const { senderUid, content, participants } = messageData;

        if (!senderUid || !participants || participants.length < 2) {
            console.log("Missing required fields on message. Skipping.");
            return;
        }

        // 1. Find the RECIPIENT (the participant who is NOT the sender)
        const recipientUid = participants.find((uid) => uid !== senderUid);
        if (!recipientUid) {
            console.log("Could not determine recipient. Skipping.");
            return;
        }

        // 2. Get sender's display name
        let senderName = "Someone";
        try {
            const senderDoc = await db.collection("users").doc(senderUid).get();
            if (senderDoc.exists) {
                senderName = senderDoc.data().name || "Someone";
            }
        } catch (e) {
            console.warn("Could not fetch sender name:", e.message);
        }

        // 3. Get recipient's FCM token
        const recipientDoc = await db.collection("users").doc(recipientUid).get();
        if (!recipientDoc.exists) {
            console.log("Recipient user not found. Skipping.");
            return;
        }

        const fcmToken = recipientDoc.data().fcmToken;
        if (!fcmToken) {
            console.log(`Recipient ${recipientUid} has no FCM token. Skipping.`);
            return;
        }

        // 4. Build and send the notification
        const preview = content ? content.substring(0, 100) : "New message";

        const message = {
            token: fcmToken,
            notification: {
                title: `💌 Message from ${senderName}`,
                body: preview,
            },
            data: {
                threadId: threadId,
                type: "new_message",
            },
            android: {
                priority: "high",
                notification: {
                    channelId: "messages",
                    sound: "default",
                    clickAction: "FLUTTER_NOTIFICATION_CLICK",
                },
            },
        };

        try {
            const response = await getMessaging().send(message);
            console.log(`✅ Push sent to ${recipientUid}: ${response}`);
        } catch (err) {
            if (err.code === "messaging/registration-token-not-registered") {
                // Token is stale — remove it
                console.warn(`Stale FCM token for ${recipientUid}. Clearing.`);
                await db.collection("users").doc(recipientUid).update({ fcmToken: null });
            } else {
                console.error("Failed to send push:", err.message);
            }
        }
    }
);
