import { auth, firestore } from "./firebase";
import {
	EmailAuthProvider,
	reauthenticateWithCredential,
	updateEmail,
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
	await updateEmail(user, nextEmail);

	if (firestore && user.uid) {
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
}
