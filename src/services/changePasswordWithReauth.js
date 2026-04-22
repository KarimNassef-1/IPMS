import { auth } from "./firebase";
import {
	EmailAuthProvider,
	reauthenticateWithCredential,
	updatePassword,
} from "firebase/auth";

export async function changeUserPasswordWithReauth(
	currentPassword,
	newPassword,
) {
	if (!auth?.currentUser) {
		throw new Error("No authenticated user.");
	}
	const user = auth.currentUser;
	const credential = EmailAuthProvider.credential(user.email, currentPassword);
	await reauthenticateWithCredential(user, credential);
	return updatePassword(user, newPassword);
}
