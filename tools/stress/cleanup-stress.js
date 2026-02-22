import { initializeApp } from "firebase/app";
import {
    getFirestore,
    collection,
    getDocs,
    query,
    where,
    deleteDoc,
    doc,
    writeBatch
} from "firebase/firestore";
import dotenv from "dotenv";
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const config = {
    apiKey: process.env.VITE_FIREBASE_API_KEY,
    authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.VITE_FIREBASE_APP_ID,
};

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');

async function cleanup() {
    console.log(`\n🧹 STARTING CLEANUP [Project: ${config.projectId}]${isDryRun ? ' [DRY RUN]' : ''}`);
    const app = initializeApp(config);
    const db = getFirestore(app);

    const collections = ['pins', 'threads'];
    let totalDeleted = 0;

    for (const collName of collections) {
        console.log(`Checking ${collName}...`);
        const q = query(collection(db, collName));
        const snap = await getDocs(q);

        const stressDocs = snap.docs.filter(d => d.id.startsWith("STRESS_TEST_"));

        if (stressDocs.length === 0) {
            console.log(`No stress docs found in ${collName}.`);
            continue;
        }

        let collDeleted = 0;
        let collPermissions = 0;

        for (const d of stressDocs) {
            try {
                // If it's a thread, also cleanup messages subcollection
                if (collName === 'threads') {
                    const msgSnap = await getDocs(collection(db, 'threads', d.id, 'messages'));
                    if (!msgSnap.empty) {
                        console.log(`  ${isDryRun ? '[DRY]' : '-'} Would delete ${msgSnap.size} child messages for thread ${d.id}`);
                        if (!isDryRun) {
                            const batch = writeBatch(db);
                            msgSnap.docs.forEach(m => batch.delete(m.ref));
                            await batch.commit();
                        }
                    }
                }

                console.log(`  ${isDryRun ? '[DRY]' : '-'} Removing ${collName}/${d.id}`);
                if (!isDryRun) {
                    await deleteDoc(d.ref);
                }
                collDeleted++;
                totalDeleted++;
            } catch (err) {
                if (err.code === 'permission-denied') {
                    collPermissions++;
                } else {
                    console.error(`  ❌ Failed to delete ${d.id}:`, err.message);
                }
            }
        }
        if (collPermissions > 0) {
            console.log(`  ⚠️  Skipped ${collPermissions} items due to PERMISSION_DENIED (Owner mismatch).`);
        }
        if (collDeleted > 0) {
            console.log(`  ✅ Removed ${collDeleted} items from ${collName}.`);
        }
    }

    console.log(`\n🏁 Cleanup finished. Total documents removed: ${totalDeleted}\n`);
    process.exit(0);
}

cleanup().catch(err => {
    console.error("Cleanup failed:", err);
    process.exit(1);
});
