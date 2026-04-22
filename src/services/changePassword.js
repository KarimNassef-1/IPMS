import { auth } from "./firebase";
import { updatePassword } from "firebase/auth";

export async function changeUserPassword(newPassword) {
	if (!auth?.currentUser) {
		throw new Error("No authenticated user.");
	}
	return updatePassword(auth.currentUser, newPassword);
}
