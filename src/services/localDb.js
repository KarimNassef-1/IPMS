const STORAGE_PREFIX = "ipms:";

function collectionKey(name) {
	return `${STORAGE_PREFIX}${name}`;
}

function safeParse(raw) {
	try {
		return JSON.parse(raw);
	} catch {
		return [];
	}
}

export function getLocalCollection(name) {
	const raw = localStorage.getItem(collectionKey(name));
	return raw ? safeParse(raw) : [];
}

export function setLocalCollection(name, records) {
	localStorage.setItem(collectionKey(name), JSON.stringify(records));
}

export function createLocalRecord(name, payload) {
	const now = new Date().toISOString();
	const record = {
		id: crypto.randomUUID(),
		...payload,
		createdAt: payload.createdAt || now,
		updatedAt: now,
	};

	const all = getLocalCollection(name);
	all.push(record);
	setLocalCollection(name, all);

	return record;
}

export function updateLocalRecord(name, id, payload) {
	const all = getLocalCollection(name);
	const next = all.map((item) =>
		item.id === id
			? { ...item, ...payload, updatedAt: new Date().toISOString() }
			: item,
	);

	setLocalCollection(name, next);
}

export function deleteLocalRecord(name, id) {
	const all = getLocalCollection(name);
	setLocalCollection(
		name,
		all.filter((item) => item.id !== id),
	);
}

export function queryLocalCollection(name, predicate) {
	return getLocalCollection(name).filter(predicate);
}
