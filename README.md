# Infinite Pixels Agency Management System (IPMS)

Internal operating system for Infinite Pixels to manage projects, tasks, finances, budgets, notifications, and role-based operations.

## Stack

- React + Vite
- Tailwind CSS (v4 via `@tailwindcss/vite`)
- React Router
- Firebase Auth + Firestore + Storage
- Framer Motion
- Zustand (ready for state modules)

## Implemented Foundation

- Email/password authentication flow
- Protected routes and role-based route guards
- Admin-only access for custom pages module
- Modular services for projects, tasks, finances, budgets, and notifications
- Calculation utilities for distribution and analytics metrics
- Firestore rules with admin/partner access model
- Dashboard and all requested module screens scaffolded

## Project Structure

```txt
src/
	components/
		auth/
		guards/
		layout/
	contexts/
		AuthContext.jsx
	pages/
	router/
		AppRouter.jsx
	services/
	styles/
		global.css
	utils/
```

## Local Setup

1. Install dependencies:
	 - `npm install`
2. Create env file:
	 - copy `.env.example` to `.env`
	 - add Firebase web app values
3. Run development server:
	 - `npm run dev`

## Login

### Option A: Instant demo login (no Firebase required)

- Admin:
	- Email: karim@infinitepixels.com
	- Password: 12345678
- Partner:
	- Email: youssef@infinitepixels.com
	- Password: 12345678

### Option B: Firebase auth login

1. Configure Firebase env vars in `.env`.
2. Create users in Firebase Authentication.
3. Create matching role documents in `users` collection.
4. Login using the same email/password from Firebase Authentication.

## Firebase Setup

See `docs/firebase-setup.md` for step-by-step Firebase project configuration, role seeding, and deploy flow.

## Maintenance Scripts

- `npm run auth:cleanup:requests`
  - Processes pending `auth_cleanup_requests` and deletes matching Firebase Auth users.
- `npm run auth:cleanup:worker`
  - Polling worker that processes the cleanup queue repeatedly.
  - Optional flags:
    - `--interval-minutes 15`
    - `--max-runs 0` (0 = keep running)
    - `--dry-run`
- `npm run audit:orphans`
  - Audits Auth vs Firestore user mismatches and key collection volumes.

Credential options for these scripts:

1. Set `GOOGLE_APPLICATION_CREDENTIALS` to a Firebase service-account JSON key.
2. Or use Application Default Credentials (ADC), for example on CI runners or GCP-hosted runtimes.

A scheduled GitHub workflow is included at `.github/workflows/auth-cleanup-requests.yml`.
It requires repository secrets:

- `FIREBASE_SERVICE_ACCOUNT_JSON`
- `FIREBASE_PROJECT_ID` (optional but recommended)

## Next Build Phases

1. Implement Firestore-backed CRUD forms per module.
2. Add Cloud Functions for daily task reset and recurring project income generation.
3. Add charts with live analytics datasets.
4. Add robust form validation and optimistic UI updates.
