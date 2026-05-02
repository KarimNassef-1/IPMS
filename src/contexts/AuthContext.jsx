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
import { publishLoginEvent } from '../services/workflowEvents'
import { getClientLinkDisplayName, setClientLinkDisplayName } from '../services/clientQrAccessService'
import {
  canAccessServiceCategory,
  createAllowedServiceCategorySet,
  resolveTeamServiceCategories,
} from '../utils/serviceAccess'

const INACTIVITY_LOGOUT_MS = 30 * 60 * 1000

function normalizeRole(roleValue) {
  const normalized = String(roleValue || '').trim().toLowerCase()
  if (normalized === 'admin') return 'admin'
  if (normalized === 'partner') return 'partner'
  if (normalized === 'client') return 'client'
  if (normalized === 'outsource') return 'outsource'
  return null
}

function normalizeAccountStatus(value) {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'locked') return 'locked'
  if (normalized === 'removed') return 'removed'
  return 'active'
}

function accountStatusErrorMessage(status) {
  if (status === 'locked') {
    return 'You do not have access currently. Your account is locked. Please contact the system admin.'
  }

  if (status === 'removed') {
    return 'You are unauthorized to access this system. Please contact the system admin.'
  }

  return ''
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [role, setRole] = useState(null)
  const [profile, setProfile] = useState(null)
  const [authIssue, setAuthIssue] = useState(null)
  const [teams, setTeams] = useState([])
  const [rolePermissions, setRolePermissions] = useState(DEFAULT_ROLE_PERMISSIONS)
  const [rolePermissionsReady, setRolePermissionsReady] = useState(false)
  const [loading, setLoading] = useState(firebaseReady)

  useEffect(() => {
    if (!firebaseReady || !firestore) {
      setRolePermissions(DEFAULT_ROLE_PERMISSIONS)
      setRolePermissionsReady(true)
      return undefined
    }

    if (!user || authIssue) {
      setRolePermissions(DEFAULT_ROLE_PERMISSIONS)
      setRolePermissionsReady(true)
      return undefined
    }

    setRolePermissionsReady(false)

    const unsubscribePermissions = subscribeRolePermissions(
      (map) => {
        setRolePermissions({ ...DEFAULT_ROLE_PERMISSIONS, ...map })
        setRolePermissionsReady(true)
      },
      () => {
        setRolePermissions(DEFAULT_ROLE_PERMISSIONS)
        setRolePermissionsReady(true)
      },
    )

    return () => unsubscribePermissions()
  }, [user, authIssue])

  useEffect(() => {
    if (!user || !auth) return undefined

    let timeoutId

    const scheduleAutoLogout = () => {
      window.clearTimeout(timeoutId)
      timeoutId = window.setTimeout(async () => {
        try {
          await signOut(auth)
        } catch (error) {
          console.warn('Auto logout failed:', error)
        }
      }, INACTIVITY_LOGOUT_MS)
    }

    const activityEvents = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click']
    activityEvents.forEach((eventName) => {
      window.addEventListener(eventName, scheduleAutoLogout, { passive: true })
    })

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        scheduleAutoLogout()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    scheduleAutoLogout()

    return () => {
      window.clearTimeout(timeoutId)
      activityEvents.forEach((eventName) => {
        window.removeEventListener(eventName, scheduleAutoLogout)
      })
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [user])

  useEffect(() => {
    if (!firebaseReady || !firestore) {
      setTeams([])
      return undefined
    }

    if (!user || authIssue) {
      setTeams([])
      return undefined
    }

    const unsubscribeTeams = subscribeTeams(
      (items) => {
        setTeams(items)
      },
      () => {
        setTeams([])
      },
    )

    return () => unsubscribeTeams()
  }, [user, authIssue])

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
          setAuthIssue(null)
          setLoading(false)
          return
        }

        if (firebaseUser.isAnonymous) {
          const linkDisplayName = getClientLinkDisplayName()
          setUser(firebaseUser)
          setRole('client')
          setProfile({
            name: linkDisplayName || 'Client Guest',
            photoURL: '',
            teamIds: [],
          })
          setAuthIssue(null)
          setLoading(false)
          return
        }

        // Ensure auth token is available before protected Firestore reads run.
        await firebaseUser.getIdToken()

        setUser(firebaseUser)

        const userDocRef = doc(firestore, 'users', firebaseUser.uid)
        const userSnapshot = await getDoc(userDocRef)
        const fallbackProfile = {
          name: firebaseUser.displayName || firebaseUser.email || 'User',
          photoURL: firebaseUser.photoURL || '',
          teamIds: [],
        }

        if (userSnapshot.exists()) {
          const userData = userSnapshot.data()
          const accountStatus = normalizeAccountStatus(userData?.accountStatus)
          const normalizedRole = normalizeRole(userSnapshot.data().role)

          if (accountStatus !== 'active') {
            setRole(null)
            setProfile({
              name: userData.name || fallbackProfile.name,
              photoURL: userData.photoURL || fallbackProfile.photoURL,
              teamIds: Array.isArray(userData.teamIds) ? userData.teamIds : [],
              passwordResetRequired: Boolean(userData.passwordResetRequired),
            })
            setAuthIssue({
              code: `account-${accountStatus}`,
              message: accountStatusErrorMessage(accountStatus),
            })
            setLoading(false)
            return
          }

          setProfile({
            name: userData.name || firebaseUser.displayName || 'User',
            photoURL: userData.photoURL || firebaseUser.photoURL || '',
            teamIds: Array.isArray(userData.teamIds) ? userData.teamIds : [],
            passwordResetRequired: Boolean(userData.passwordResetRequired),
          })

          if (normalizedRole) {
            setRole(normalizedRole)
            setAuthIssue(null)
          } else {
            setRole(null)
            setProfile({
              name: userData.name || fallbackProfile.name,
              photoURL: userData.photoURL || fallbackProfile.photoURL,
              teamIds: Array.isArray(userData.teamIds) ? userData.teamIds : [],
              passwordResetRequired: Boolean(userData.passwordResetRequired),
            })
            setAuthIssue({
              code: 'invalid-role',
              message: 'Your account profile is not mapped to a valid role. Contact the system admin.',
            })
            setLoading(false)
            return
          }

        } else {
          setRole(null)
          setProfile(fallbackProfile)
          setAuthIssue({
            code: 'missing-profile',
            message: 'Your user account exists, but your workspace profile is missing. Contact the system admin.',
          })
          setLoading(false)
          return

        }
      } catch (error) {
        console.error('Failed to resolve auth state:', error)
        setRole(null)
        setAuthIssue({
          code: 'auth-resolution-failed',
          message: error?.message || 'Failed to resolve your account access state.',
        })
      } finally {
        setLoading(false)
      }
    })

    return () => unsubscribe()
  }, [])

  async function login(email, password) {
    const normalizedEmail = String(email).trim().toLowerCase()
    setLoading(true)

    if (!firebaseReady || !auth) {
      setLoading(false)
      throw new Error(firebaseError || 'Firebase is not initialized. Authentication is unavailable.')
    }

    let credential

    try {
      credential = await signInWithEmailAndPassword(auth, normalizedEmail, password)
      await credential.user.getIdToken(true)
    } catch (error) {
      setLoading(false)
      throw error
    }

    const userDocRef = doc(firestore, 'users', credential?.user?.uid || '')
    const userSnapshot = credential?.user?.uid ? await getDoc(userDocRef) : null
    const userData = userSnapshot?.exists() ? userSnapshot.data() : null
    const normalizedRole = normalizeRole(userData?.role)
    const accountStatus = normalizeAccountStatus(userData?.accountStatus)

    if (userSnapshot?.exists() && normalizedRole && accountStatus === 'active') {
      try {
        await publishLoginEvent({
          user: credential?.user,
          profile: {
            name: userData?.name || credential?.user?.displayName || 'User',
            photoURL: userData?.photoURL || credential?.user?.photoURL || '',
          },
        })
      } catch (error) {
        console.warn('Login notification failed:', error)
      }
    }

    return credential
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

    if (auth.currentUser.isAnonymous) {
      setProfile((current) => ({
        ...(current || {}),
        name: nextProfile.name,
        photoURL: nextProfile.photoURL,
        teamIds: Array.isArray(current?.teamIds) ? current.teamIds : [],
      }))
      setClientLinkDisplayName(nextProfile.name)
      return nextProfile
    }

    try {
      await setDoc(
        doc(firestore, 'users', auth.currentUser.uid),
        {
          name: nextProfile.name,
          photoURL: nextProfile.photoURL,
          passwordResetRequired: false,
          updatedAt: new Date().toISOString(),
        },
        { merge: true },
      )
    } catch (error) {
      const message = String(error?.message || '').toLowerCase()
      if (message.includes('missing or insufficient permissions')) {
        throw new Error('Your account does not have permission to update profile settings.')
      }
      throw error
    }

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
        authIssue,
        sessionBlocked: Boolean(user && authIssue),
        serviceCategories: resolvedServiceCategories,
        rolePermissions,
        loading: loading || (!authIssue && !rolePermissionsReady),
        firebaseReady,
        firebaseError,
        login,
        logout,
        updateProfileSettings,
        canAccessServiceCategory: (category) =>
          canAccessServiceCategory(category, allowedCategorySet, role === 'admin'),
        hasAccess: (permissionKey) => {
          const configuredPermissions = rolePermissions?.[role]
          if (Array.isArray(configuredPermissions)) {
            return configuredPermissions.includes(permissionKey)
          }
          if (role === 'admin') return true
          const permissions = DEFAULT_ROLE_PERMISSIONS?.[role] || []
          return permissions.includes(permissionKey)
        },
        isAdmin: role === 'admin',
        isPartner: role === 'partner',
        isClient: role === 'client',
      }
    },
    [user, role, profile, authIssue, teams, rolePermissions, loading, rolePermissionsReady, updateProfileSettings],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
