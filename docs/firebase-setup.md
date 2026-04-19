# Firebase Setup Guide

## 1) Create project
1. Open Firebase Console.
2. Create project: `infinite-pixels-os`.
3. Disable Google Analytics.

## 2) Enable auth
1. Open Authentication.
2. Enable Email/Password provider.

## 3) Enable Firestore and Storage
1. Create Firestore in production mode.
2. Create Storage bucket.
3. Choose a region close to Egypt.

## 4) Register web app
1. Add a web app in Firebase.
2. Copy config values to `.env` based on `.env.example`.

## 5) Seed roles
Create user docs in `users` collection with document IDs equal to Firebase UID:
- Karim -> role: `admin`
- Youssef -> role: `partner`

Example document:
```json
{
  "name": "Karim Nassef",
  "email": "karim@infinitepixels.com",
  "role": "admin",
  "createdAt": "2026-04-19T00:00:00.000Z"
}
```

## 6) Deploy rules
1. Install Firebase CLI.
2. Login using `firebase login`.
3. Run `firebase init` and select Firestore + Hosting.
4. Use `firestore.rules` from project root.
5. Deploy with `firebase deploy`.
