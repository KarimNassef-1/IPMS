import { auth, firestore } from "./firebase";
import {
	EmailAuthProvider,
	reauthenticateWithCredential,
	updateEmail,
	verifyBeforeUpdateEmail,
} from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";

export async function changeUserEmailWithReauth(currentPassword, newEmail) {
	if (!auth?.currentUser) {
		throw new Error("No authenticated user.");
	}

	const user = auth.currentUser;
	const nextEmail = String(newEmail || "")
		.trim()
		.toLowerCase();
	if (!nextEmail) {
		throw new Error("New email is required.");
	}

	const credential = EmailAuthProvider.credential(user.email, currentPassword);
	await reauthenticateWithCredential(user, credential);

	let verificationRequired = false;

	try {
		await updateEmail(user, nextEmail);
	} catch (error) {
		const code = String(error?.code || "").toLowerCase();
		if (code !== "auth/operation-not-allowed") {
			throw error;
		}

		await verifyBeforeUpdateEmail(user, nextEmail);
		verificationRequired = true;
	}

	if (firestore && user.uid && !verificationRequired) {
		await setDoc(
			doc(firestore, "users", user.uid),
			{
				email: nextEmail,
				passwordResetRequired: false,
				updatedAt: new Date().toISOString(),
			},
			{ merge: true },
		);
	}

	return {
		verificationRequired,
		email: nextEmail,
	};
}
