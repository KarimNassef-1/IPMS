import {
	addDoc,
	collection,
	deleteDoc,
	doc,
	getFirestore,
	getDocs,
	onSnapshot,
	setDoc,
	updateDoc,
} from "firebase/firestore";
import { initializeApp, deleteApp } from "firebase/app";
import {
	createUserWithEmailAndPassword,
	getAuth,
	signOut,
} from "firebase/auth";
import {
	app,
	ensureFirebaseReady,
	firebaseConfig,
	firebaseError,
	firebaseReady,
} from "./firebase";
import { normalizeServiceCategory } from "../utils/serviceAccess";

const USERS = "users";
const TEAMS = "teams";
const ROLE_PERMISSIONS = "role_permissions";

function normalizeArray(values) {
	return Array.from(
		new Set(
			(Array.isArray(values) ? values : [])
				.map((item) => String(item).trim())
				.filter(Boolean),
		),
	);
}

function normalizeServiceCategories(values) {
	return Array.from(
		new Set(
			(Array.isArray(values) ? values : [])
				.map((value) => normalizeServiceCategory(value))
				.filter(Boolean),
		),
	);
}

function normalizeTeamMembers(values) {
	if (!Array.isArray(values)) return [];

	return values
		.map((item, index) => ({
			id: String(item?.id || `member_${index + 1}`).trim(),
			name: String(item?.name || "").trim(),
			technicalRole: String(item?.technicalRole || "").trim(),
			websiteTracks: normalizeArray(item?.websiteTracks),
			pictureUrl: String(item?.pictureUrl || "").trim(),
			userId: String(item?.userId || "").trim(),
			isUser: Boolean(item?.isUser || item?.userId),
		}))
		.filter((member) => member.name);
}

function buildManagedUserId(email) {
	const normalizedEmail = String(email || "")
		.trim()
		.toLowerCase();
	if (!normalizedEmail) return "";
	return `managed_${normalizedEmail.replace(/[^a-z0-9]/g, "_")}`;
}

function normalizeEmail(email) {
	return String(email || "")
		.trim()
		.toLowerCase();
}

function mapAuthCreationError(error) {
	const code = error?.code || "";
	if (code === "auth/email-already-in-use")
		return "This email already has an account.";
	if (code === "auth/invalid-email") return "Invalid email format.";
	if (code === "auth/weak-password")
		return "Password is too weak. Use at least 6 characters.";
	if (code === "auth/operation-not-allowed")
		return "Email/password sign-in is disabled in Firebase Authentication.";
	return error?.message || "Failed to create login account.";
}

function mapManagedUserCreationError(error) {
	if (error?.code === "permission-denied") {
		return "Could not create user profile document due to Firestore permission rules.";
	}
	return mapAuthCreationError(error);
}

export async function createManagedAuthUser(
	email,
	password,
	profilePayload = {},
) {
	if (!firebaseReady || !app) {
		throw new Error(
			firebaseError ||
				"Firebase is not initialized. Cannot create login accounts.",
		);
	}

	const normalizedEmail = normalizeEmail(email);
	const safePassword = String(password || "");

	if (!normalizedEmail) {
		throw new Error("Email is required to create a login account.");
	}

	if (safePassword.length < 6) {
		throw new Error("Password must be at least 6 characters.");
	}

	const tempAppName = `managed-user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
	const tempApp = initializeApp(firebaseConfig, tempAppName);
	const tempAuth = getAuth(tempApp);
	const tempFirestore = getFirestore(tempApp);
	let createdUser = null;

	try {
		const credential = await createUserWithEmailAndPassword(
			tempAuth,
			normalizedEmail,
			safePassword,
		);
		createdUser = credential.user;

		await setDoc(
			doc(tempFirestore, USERS, createdUser.uid),
			{
				name: String(profilePayload?.name || "").trim() || "User",
				email: normalizedEmail,
				role:
					String(profilePayload?.role || "viewer")
						.trim()
						.toLowerCase() || "viewer",
				photoURL: String(profilePayload?.photoURL || "").trim(),
				title: String(profilePayload?.title || "").trim(),
				teamIds: normalizeArray(profilePayload?.teamIds),
				accountStatus:
					String(profilePayload?.accountStatus || "active")
						.trim()
						.toLowerCase() || "active",
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				source: "managed",
			},
			{ merge: true },
		);

		return createdUser.uid;
	} catch (error) {
		if (createdUser) {
			try {
				await createdUser.delete();
			} catch {
				// If rollback fails, at least surface the original error.
			}
		}
		throw new Error(mapManagedUserCreationError(error));
	} finally {
		try {
			await signOut(tempAuth);
		} catch {
			// no-op
		}
		await deleteApp(tempApp);
	}
}

export async function getAllUsers() {
	const firestore = ensureFirebaseReady();
	const snapshot = await getDocs(collection(firestore, USERS));
	return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export function subscribeUsers(onData, onError) {
	const firestore = ensureFirebaseReady();
	return onSnapshot(
		collection(firestore, USERS),
		(snapshot) => {
			onData(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
		},
		onError,
	);
}

export async function upsertUser(userId, payload) {
	const firestore = ensureFirebaseReady();
	const managedUserId = userId || buildManagedUserId(payload?.email);
	if (!managedUserId) {
		throw new Error("Email is required to create a user record.");
	}

	const data = {
		...payload,
		email: normalizeEmail(payload?.email),
		teamIds: normalizeArray(payload?.teamIds),
		accountStatus:
			String(payload?.accountStatus || "active")
				.trim()
				.toLowerCase() || "active",
		updatedAt: new Date().toISOString(),
	};

	await setDoc(
		doc(firestore, USERS, managedUserId),
		{
			...data,
			createdAt: payload?.createdAt || new Date().toISOString(),
			source: "managed",
		},
		{ merge: true },
	);

	return managedUserId;
}

export async function deleteUser(userId) {
	const firestore = ensureFirebaseReady();
	await deleteDoc(doc(firestore, USERS, userId));
}

export async function setUserAccountStatus(userId, accountStatus) {
	const firestore = ensureFirebaseReady();
	const id = String(userId || "").trim();
	const status = String(accountStatus || "active")
		.trim()
		.toLowerCase();

	if (!id) throw new Error("User id is required.");
	if (!["active", "locked", "removed"].includes(status)) {
		throw new Error("Invalid account status.");
	}

	await setDoc(
		doc(firestore, USERS, id),
		{
			accountStatus: status,
			updatedAt: new Date().toISOString(),
		},
		{ merge: true },
	);
}

export async function restoreUser(payload) {
	const firestore = ensureFirebaseReady();
	const id = String(payload?.id || "").trim();
	if (!id) throw new Error("User id is required to restore user.");
	const { id: _id, ...data } = payload;
	await setDoc(doc(firestore, USERS, id), data, { merge: false });
}

export async function getTeams() {
	const firestore = ensureFirebaseReady();
	const snapshot = await getDocs(collection(firestore, TEAMS));
	return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export function subscribeTeams(onData, onError) {
	const firestore = ensureFirebaseReady();
	return onSnapshot(
		collection(firestore, TEAMS),
		(snapshot) => {
			onData(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
		},
		onError,
	);
}

export async function upsertTeam(teamId, payload) {
	const firestore = ensureFirebaseReady();
	const memberProfiles = normalizeTeamMembers(payload?.memberProfiles);
	const serviceCategories = normalizeServiceCategories(
		payload?.serviceCategories?.length
			? payload.serviceCategories
			: [payload?.serviceCategory || payload?.serviceType],
	);
	const primaryServiceCategory = serviceCategories[0] || "";
	const data = {
		...payload,
		serviceCategories,
		serviceCategory: primaryServiceCategory,
		serviceType: primaryServiceCategory,
		memberProfiles,
		memberIds: normalizeArray(
			payload?.memberIds || memberProfiles.map((member) => member.userId),
		),
		updatedAt: new Date().toISOString(),
	};

	if (teamId) {
		await updateDoc(doc(firestore, TEAMS, teamId), data);
		return teamId;
	}

	const ref = await addDoc(collection(firestore, TEAMS), {
		...data,
		createdAt: new Date().toISOString(),
	});
	return ref.id;
}

export async function deleteTeam(teamId) {
	const firestore = ensureFirebaseReady();
	await deleteDoc(doc(firestore, TEAMS, teamId));
}

export async function restoreTeam(payload) {
	const firestore = ensureFirebaseReady();
	const id = String(payload?.id || "").trim();
	if (!id) throw new Error("Team id is required to restore team.");
	const { id: _id, ...data } = payload;
	await setDoc(doc(firestore, TEAMS, id), data, { merge: false });
}

export async function getRolePermissionsMap() {
	const firestore = ensureFirebaseReady();
	const snapshot = await getDocs(collection(firestore, ROLE_PERMISSIONS));
	return snapshot.docs.reduce((acc, item) => {
		acc[item.id] = normalizeArray(item.data()?.permissions);
		return acc;
	}, {});
}

export function subscribeRolePermissions(onData, onError) {
	const firestore = ensureFirebaseReady();
	return onSnapshot(
		collection(firestore, ROLE_PERMISSIONS),
		(snapshot) => {
			const map = snapshot.docs.reduce((acc, item) => {
				acc[item.id] = normalizeArray(item.data()?.permissions);
				return acc;
			}, {});
			onData(map);
		},
		onError,
	);
}

export async function setRolePermissions(role, permissions) {
	const firestore = ensureFirebaseReady();
	await setDoc(
		doc(firestore, ROLE_PERMISSIONS, role),
		{
			permissions: normalizeArray(permissions),
			updatedAt: new Date().toISOString(),
		},
		{ merge: true },
	);
}
