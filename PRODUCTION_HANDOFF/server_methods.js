import { Meteor } from 'meteor/meteor';

// IMPORTANT: Import your actual Connections/Pins collection here
// import { Connections } from '../collections/connections'; 

Meteor.methods({
    /**
     * Securely deletes the current user's account and all associated data.
     * Runs on the server only.
     */
    'accounts.deleteCompletely'() {
        const userId = this.userId;

        // 1. Authorization check
        if (!userId) {
            throw new Meteor.Error('not-authorized', 'You must be logged in to delete an account.');
        }

        try {
            // 2. Data Cleanup: Remove the user's pins/posts
            // Replace 'Connections' with your actual collection name
            // Connections.remove({ ownerId: userId });

            // 3. System Cleanup: Delete the actual Meteor User record
            Meteor.users.remove(userId);

            console.log(`[AUTH] Account deleted successfully for ID: ${userId}`);
            return true;
        } catch (error) {
            throw new Meteor.Error('deletion-failed', 'Database error during account removal.');
        }
    }
});
