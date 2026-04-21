import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { auth, firebaseError, firebaseReady, firestore } from '../services/firebase'
import { AuthContext } from './auth-context'
import { DEFAULT_ROLE_PERMISSIONS } from '../utils/constants'
import { subscribeRolePermissions, subscribeTeams } from '../services/teamUsersService'
import { createNotification } from '../services/notificationService'
import {
  canAccessServiceCategory,
  createAllowedServiceCategorySet,
  resolveTeamServiceCategories,
} from '../utils/serviceAccess'

function resolveDefaultRole(email) {
  const normalized = String(email || '').trim().toLowerCase()

  if (normalized === 'thefightholic111@gmail.com' || normalized === 'karim@infinitepixels.com') {
    return 'admin'
  }

  return 'partner'
}

function normalizeRole(roleValue) {
  const normalized = String(roleValue || '').trim().toLowerCase()
  if (normalized === 'admin') return 'admin'
  if (normalized === 'partner') return 'partner'
  if (normalized === 'manager') return 'manager'
  if (normalized === 'finance') return 'finance'
  if (normalized === 'delivery') return 'delivery'
  if (normalized === 'viewer') return 'viewer'
  return null
}

function isAdminIdentityLogin(email, name) {
  const normalizedEmail = String(email || '').trim().toLowerCase()
  const normalizedName = String(name || '').trim().toLowerCase()

  return (
    normalizedEmail === 'thefightholic111@gmail.com' ||
    normalizedName === 'karim nassef'
  )
}

function buildLoginNotificationSessionKey(userId, lastSignInTime) {
  return `ipms-login-notified:${String(userId || '').trim()}:${String(lastSignInTime || '').trim()}`
}

function hasNotifiedLoginInSession(userId, lastSignInTime) {
  if (typeof window === 'undefined') return false
  return window.sessionStorage.getItem(buildLoginNotificationSessionKey(userId, lastSignInTime)) === '1'
}

function markLoginNotifiedInSession(userId, lastSignInTime) {
  if (typeof window === 'undefined') return
  window.sessionStorage.setItem(buildLoginNotificationSessionKey(userId, lastSignInTime), '1')
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [role, setRole] = useState(null)
  const [profile, setProfile] = useState(null)
  const [teams, setTeams] = useState([])
  const [rolePermissions, setRolePermissions] = useState(DEFAULT_ROLE_PERMISSIONS)
  const [loading, setLoading] = useState(firebaseReady)

  const emitLoginNotification = useCallback(async (firebaseUser, userData = {}) => {
    const actorId = String(firebaseUser?.uid || '').trim()
    const actorEmail = String(firebaseUser?.email || '').trim().toLowerCase()
    const actorName =
      String(userData?.name || '').trim() ||
      String(firebaseUser?.displayName || '').trim() ||
      'User'
    const actorPhotoURL =
      String(userData?.photoURL || '').trim() ||
      String(firebaseUser?.photoURL || '').trim() ||
      ''
    const lastSignInTime = String(firebaseUser?.metadata?.lastSignInTime || '').trim()

    if (!actorId) return
    if (isAdminIdentityLogin(actorEmail, actorName)) return
    if (hasNotifiedLoginInSession(actorId, lastSignInTime)) return

    const loggedInAt = new Date().toISOString()
    await createNotification({
      type: 'login',
      action: 'login',
      message: `${actorName} logged in`,
      actorId,
      actorName,
      actorEmail,
      actorPhotoURL,
      loggedInAt,
      date: loggedInAt,
      status: 'unread',
      adminFeed: true,
    })

    markLoginNotifiedInSession(actorId, lastSignInTime)
  }, [])

  useEffect(() => {
    if (!firebaseReady || !firestore) return undefined

    const unsubscribePermissions = subscribeRolePermissions(
      (map) => {
        setRolePermissions({ ...DEFAULT_ROLE_PERMISSIONS, ...map })
      },
      () => {
        setRolePermissions(DEFAULT_ROLE_PERMISSIONS)
      },
    )

    return () => unsubscribePermissions()
  }, [])

  useEffect(() => {
    if (!firebaseReady || !firestore) return undefined

    const unsubscribeTeams = subscribeTeams(
      (items) => {
        setTeams(items)
      },
      () => {
        setTeams([])
      },
    )

    return () => unsubscribeTeams()
  }, [])

  useEffect(() => {
    if (!firebaseReady || !auth || !firestore) {
      setLoading(false)

      if (firebaseError) {
        console.error(firebaseError)
      }

      return undefined
    }

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        if (!firebaseUser) {
          setUser(null)
          setRole(null)
          setProfile(null)
          setLoading(false)
          return
        }

        setUser(firebaseUser)

        const userDocRef = doc(firestore, 'users', firebaseUser.uid)
        const userSnapshot = await getDoc(userDocRef)

        if (userSnapshot.exists()) {
          const userData = userSnapshot.data()
          const normalizedRole = normalizeRole(userSnapshot.data().role)

          setProfile({
            name: userData.name || firebaseUser.displayName || 'User',
            photoURL: userData.photoURL || firebaseUser.photoURL || '',
            teamIds: Array.isArray(userData.teamIds) ? userData.teamIds : [],
          })

          if (normalizedRole) {
            setRole(normalizedRole)
          } else {
            const defaultRole = resolveDefaultRole(firebaseUser.email)

            await setDoc(
              userDocRef,
              {
                ...userData,
                name: userData.name || firebaseUser.displayName || 'User',
                email: userData.email || firebaseUser.email || '',
                role: defaultRole,
              },
              { merge: true },
            )

            setRole(defaultRole)
          }

          try {
            await emitLoginNotification(firebaseUser, userData)
          } catch (error) {
            console.warn('Login notification failed:', error)
          }
        } else {
          const defaultRole = resolveDefaultRole(firebaseUser.email)

          await setDoc(userDocRef, {
            name: firebaseUser.displayName || 'User',
            photoURL: firebaseUser.photoURL || '',
            email: firebaseUser.email || '',
            role: defaultRole,
            teamIds: [],
            createdAt: new Date().toISOString(),
          })

          setProfile({
            name: firebaseUser.displayName || 'User',
            photoURL: firebaseUser.photoURL || '',
            teamIds: [],
          })

          setRole(defaultRole)

          try {
            await emitLoginNotification(firebaseUser, {
              name: firebaseUser.displayName || 'User',
              photoURL: firebaseUser.photoURL || '',
            })
          } catch (error) {
            console.warn('Login notification failed:', error)
          }
        }
      } catch (error) {
        console.error('Failed to resolve auth state:', error)
        setRole(null)
      } finally {
        setLoading(false)
      }
    })

    return () => unsubscribe()
  }, [emitLoginNotification])

  async function login(email, password) {
    const normalizedEmail = String(email).trim().toLowerCase()

    if (!firebaseReady || !auth) {
      throw new Error(firebaseError || 'Firebase is not initialized. Authentication is unavailable.')
    }

    return signInWithEmailAndPassword(auth, normalizedEmail, password)
  }

  async function logout() {
    if (!auth) return
    return signOut(auth)
  }

  const updateProfileSettings = useCallback(async (payload) => {
    if (!firebaseReady || !firestore || !auth?.currentUser) {
      throw new Error(firebaseError || 'Firebase is not initialized. Profile update is unavailable.')
    }

    const safeName = String(payload?.name || '').trim().slice(0, 80)
    const safePhotoURL = String(payload?.photoURL || '').trim()

    const nextProfile = {
      name: safeName || profile?.name || user?.displayName || 'User',
      photoURL: safePhotoURL,
    }

    await setDoc(
      doc(firestore, 'users', auth.currentUser.uid),
      {
        name: nextProfile.name,
        photoURL: nextProfile.photoURL,
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    )

    setProfile(nextProfile)
    return nextProfile
  }, [profile?.name, user?.displayName])

  const value = useMemo(
    () => {
      const resolvedServiceCategories =
        role === 'admin' ? [] : resolveTeamServiceCategories(teams, profile?.teamIds)
      const allowedCategorySet = createAllowedServiceCategorySet(resolvedServiceCategories)

      return {
        user,
        role,
        profile,
        serviceCategories: resolvedServiceCategories,
        rolePermissions,
        loading,
        firebaseReady,
        firebaseError,
        login,
        logout,
        updateProfileSettings,
        canAccessServiceCategory: (category) =>
          canAccessServiceCategory(category, allowedCategorySet, role === 'admin'),
        hasAccess: (permissionKey) => {
          if (role === 'admin') return true
          const permissions = rolePermissions?.[role] || []
          return permissions.includes(permissionKey)
        },
        isAdmin: role === 'admin',
        isPartner: role === 'partner',
      }
    },
    [user, role, profile, teams, rolePermissions, loading, updateProfileSettings],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
