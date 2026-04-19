import { initializeApp } from "firebase/app";
import { getAnalytics, isSupported } from "firebase/analytics";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

export const firebaseConfig = {
	apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
	authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
	projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
	storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
	messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
	appId: import.meta.env.VITE_FIREBASE_APP_ID,
	measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

function hasFirebaseConfig(config) {
	const requiredKeys = [
		"apiKey",
		"authDomain",
		"projectId",
		"storageBucket",
		"messagingSenderId",
		"appId",
	];

	return requiredKeys.every(
		(key) => typeof config[key] === "string" && config[key].trim().length > 0,
	);
}

let app = null;
let auth = null;
let firestore = null;
let storage = null;
let analytics = null;
let firebaseError = null;

try {
	if (!hasFirebaseConfig(firebaseConfig)) {
		firebaseError =
			"Firebase config is missing. Add VITE_FIREBASE_* values to your .env file and restart the dev server.";
	} else {
		app = initializeApp(firebaseConfig);
		auth = getAuth(app);
		firestore = getFirestore(app);
		storage = getStorage(app);

		if (typeof window !== "undefined" && firebaseConfig.measurementId) {
			isSupported()
				.then((supported) => {
					if (supported) {
						analytics = getAnalytics(app);
					}
				})
				.catch(() => {
					analytics = null;
				});
		}
	}
} catch (error) {
	firebaseError = error?.message || "Failed to initialize Firebase.";
}

export { app, auth, firestore, storage, analytics, firebaseError };
export const firebaseReady = Boolean(app && auth && firestore && storage);

export function ensureFirebaseReady() {
	if (!firebaseReady || !firestore) {
		throw new Error(
			firebaseError ||
				"Firebase is not initialized. Check .env and restart the app.",
		);
	}

	return firestore;
}
