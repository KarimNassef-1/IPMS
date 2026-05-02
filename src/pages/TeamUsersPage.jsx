import { useEffect, useMemo, useRef, useState } from 'react'
import ModuleShell from '../components/layout/ModuleShell'
import {
  createManagedAuthUser,
  deleteUser,
  deleteTeam,
  requestAuthUserDeletion,
  restoreTeam,
  setUserAccountStatus,
  setUserTeamMembership,
  setRolePermissions,
  subscribeRolePermissions,
  subscribeTeams,
  subscribeUsers,
  upsertTeam,
  upsertUser,
} from '../services/teamUsersService'
import {
  APP_PERMISSION_KEYS,
  APP_ROLES,
  DEFAULT_ROLE_PERMISSIONS,
  PERMISSION_LABELS,
  SERVICE_CATEGORIES,
  WEBSITE_DEVELOPMENT_TRACKS,
} from '../utils/constants'
import {
  buildManagedLoginEmailFromName,
  buildManagedLoginEmailFromPhone,
  generateManagedTemporaryPassword,
  normalizePhoneNumber,
} from '../utils/helpers'
import { useToast } from '../hooks/useToast'
import { useAuth } from '../hooks/useAuth'
import {
  buildTeamNameById,
  buildUserById,
  buildUserNameById,
  EMPTY_TEAM_FORM,
  EMPTY_TEAM_MEMBER_DRAFT,
  EMPTY_USER_FORM,
  createTeamMemberId,
  filterTeams,
  filterUsers,
  fileToDataUrl,
} from './teamUsers/teamUsersPageModel'

const ROLE_ACCESS_MATRIX_ROLES = APP_ROLES

export default function TeamUsersPage() {
  const toast = useToast()
  const { user: currentUser } = useAuth()
  const [users, setUsers] = useState([])
  const [teams, setTeams] = useState([])
  const [rolePermissionMap, setRolePermissionMap] = useState(DEFAULT_ROLE_PERMISSIONS)
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('')

  const [editingUserId, setEditingUserId] = useState('')
  const [userForm, setUserForm] = useState(EMPTY_USER_FORM)

  const [editingTeamId, setEditingTeamId] = useState('')
  const [teamForm, setTeamForm] = useState(EMPTY_TEAM_FORM)
  const [teamMemberDraft, setTeamMemberDraft] = useState(EMPTY_TEAM_MEMBER_DRAFT)
  const [editingDraftMemberId, setEditingDraftMemberId] = useState('')
  const userFormSectionRef = useRef(null)
  const teamFormSectionRef = useRef(null)
  const [showRoleAccessMatrix, setShowRoleAccessMatrix] = useState(true)
  const [showUsersSection, setShowUsersSection] = useState(true)
  const [showTeamsSection, setShowTeamsSection] = useState(true)
  const [generatedCredentials, setGeneratedCredentials] = useState(null)
  const [copiedField, setCopiedField] = useState('')
  const [userSearchTerm, setUserSearchTerm] = useState('')
  const [teamSearchTerm, setTeamSearchTerm] = useState('')
  const [teamServiceFilter, setTeamServiceFilter] = useState('all')

  useEffect(() => {
    if (!status) return

    const normalized = status.toLowerCase()
    if (
      normalized.includes('failed') ||
      normalized.includes('unable') ||
      normalized.includes('denied') ||
      normalized.includes('required') ||
      normalized.includes('invalid')
    ) {
      toast.error(status)
      return
    }

    if (normalized.includes('editing')) {
      toast.info(status)
      return
    }

    toast.success(status)
  }, [status, toast])

  useEffect(() => {
    setLoading(true)

    const unsubUsers = subscribeUsers((items) => {
      setUsers(items)
      setLoading(false)
    }, () => setStatus('Unable to load users right now.'))

    const unsubTeams = subscribeTeams((items) => {
      setTeams(items)
      setLoading(false)
    }, () => setStatus('Unable to load teams right now.'))

    const unsubPermissions = subscribeRolePermissions((map) => {
      setRolePermissionMap({ ...DEFAULT_ROLE_PERMISSIONS, ...map })
      setLoading(false)
    }, () => setStatus('Unable to load role permissions right now.'))

    return () => {
      unsubUsers()
      unsubTeams()
      unsubPermissions()
    }
  }, [])

  const userNameById = useMemo(
    () => buildUserNameById(users),
    [users],
  )

  const userById = useMemo(
    () => buildUserById(users),
    [users],
  )

  const teamNameById = useMemo(
    () => buildTeamNameById(teams),
    [teams],
  )

  const outsourceCategoryOptions = useMemo(() => {
    return Array.from(new Set([...SERVICE_CATEGORIES]))
      .sort((a, b) => a.localeCompare(b))
  }, [])

  const filteredUsers = useMemo(() => {
    return filterUsers(users, userSearchTerm, teamNameById)
  }, [teamNameById, userSearchTerm, users])

  const filteredTeams = useMemo(() => {
    return filterTeams(teams, teamSearchTerm, teamServiceFilter, userNameById)
  }, [teamSearchTerm, teamServiceFilter, teams, userNameById])

  const existingTeamMemberOptions = useMemo(() => {
    const map = new Map()

    teams.forEach((team) => {
      ;(Array.isArray(team.memberProfiles) ? team.memberProfiles : []).forEach((member) => {
        const name = String(member?.name || '').trim()
        if (!name) return

        const technicalRole = String(member?.technicalRole || '').trim()
        const websiteTracks = Array.from(new Set((Array.isArray(member?.websiteTracks) ? member.websiteTracks : []).map((track) => String(track).trim()).filter(Boolean)))
        const pictureUrl = String(member?.pictureUrl || '').trim()
        const userId = String(member?.userId || '').trim()
        const key = [name.toLowerCase(), technicalRole.toLowerCase(), websiteTracks.join(','), pictureUrl, userId].join('|')

        if (!map.has(key)) {
          map.set(key, {
            key,
            name,
            technicalRole,
            websiteTracks,
            pictureUrl,
            userId,
            teamName: team.name || 'Team',
          })
        }
      })
    })

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name))
  }, [teams])

  const isWebsiteDevelopmentTeam = useMemo(
    () => (teamForm.serviceCategories || []).includes('Website Development'),
    [teamForm.serviceCategories],
  )

  const isUserWebsiteDevelopment = useMemo(
    () => (userForm.outsourceServices || []).includes('Website Development'),
    [userForm.outsourceServices],
  )

  useEffect(() => {
    if (isWebsiteDevelopmentTeam) return

    setTeamMemberDraft((current) => {
      if (!Array.isArray(current.websiteTracks) || current.websiteTracks.length === 0) return current
      return { ...current, websiteTracks: [] }
    })

    setTeamForm((current) => {
      const currentMembers = Array.isArray(current.memberProfiles) ? current.memberProfiles : []
      let hasTrackSelections = false
      const sanitizedMembers = currentMembers.map((member) => {
        if (Array.isArray(member.websiteTracks) && member.websiteTracks.length) {
          hasTrackSelections = true
          return { ...member, websiteTracks: [] }
        }
        return member
      })

      if (!hasTrackSelections) return current
      return { ...current, memberProfiles: sanitizedMembers }
    })
  }, [isWebsiteDevelopmentTeam])

  async function onSaveUser(event) {
    event.preventDefault()
    setStatus('')

    try {
      const normalizedPhone = normalizePhoneNumber(userForm.phoneNumber)

      if (!normalizedPhone) {
        throw new Error('Phone number is required.')
      }

      if (normalizedPhone.length < 8) {
        throw new Error('Phone number must have at least 8 digits.')
      }

      if (!editingUserId) {
        const generatedEmail =
          buildManagedLoginEmailFromPhone(normalizedPhone) ||
          buildManagedLoginEmailFromName(userForm.name)
        const generatedPassword = generateManagedTemporaryPassword({
          fullName: userForm.name,
          phoneNumber: normalizedPhone,
          services: userForm.outsourceServices,
        })

        await createManagedAuthUser(generatedEmail, generatedPassword, {
          name: userForm.name,
          email: generatedEmail,
          phoneNumber: normalizedPhone,
          role: userForm.role,
          photoURL: userForm.photoURL,
          title: userForm.title,
          teamIds: userForm.teamIds,
          websiteTracks: userForm.websiteTracks,
          outsourceServices: userForm.outsourceServices,
          accountStatus: 'active',
        })

        setGeneratedCredentials({
          fullName: userForm.name,
          phoneNumber: normalizedPhone,
          loginEmail: generatedEmail,
          temporaryPassword: generatedPassword,
        })
        setStatus('User created.')
      } else {
        const existingAccountStatus = String(userById[editingUserId]?.accountStatus || 'active').trim().toLowerCase()
        const stableEmail =
          String(userById[editingUserId]?.email || '').trim().toLowerCase() ||
          buildManagedLoginEmailFromPhone(normalizedPhone) ||
          buildManagedLoginEmailFromName(userForm.name)
        await upsertUser(editingUserId, {
          name: userForm.name,
          email: stableEmail,
          phoneNumber: normalizedPhone,
          role: userForm.role,
          photoURL: userForm.photoURL,
          title: userForm.title,
          teamIds: userForm.teamIds,
          websiteTracks: userForm.websiteTracks,
          outsourceServices: userForm.outsourceServices,
          accountStatus: existingAccountStatus,
        })

        setStatus('User updated.')
      }

      setEditingUserId('')
      setUserForm(EMPTY_USER_FORM)
    } catch (error) {
      if (error?.code === 'permission-denied') {
        setStatus('Permission denied while saving user. Deploy updated Firestore rules and try again.')
      } else {
        setStatus(error?.message || 'Failed to save user.')
      }
    }
  }

  async function onSaveTeam(event) {
    event.preventDefault()
    setStatus('')

    try {
      const existingTeam = editingTeamId
        ? teams.find((team) => team.id === editingTeamId)
        : null
      const normalizedServiceCategories = Array.isArray(teamForm.serviceCategories) && teamForm.serviceCategories.length
        ? teamForm.serviceCategories
        : [SERVICE_CATEGORIES[0]]

      const normalizedMembers = (Array.isArray(teamForm.memberProfiles) ? teamForm.memberProfiles : [])
        .map((member) => ({
          id: member.id || createTeamMemberId(),
          name: String(member.name || '').trim(),
          technicalRole: String(member.technicalRole || '').trim(),
          websiteTracks: Array.from(new Set((Array.isArray(member.websiteTracks) ? member.websiteTracks : []).map((track) => String(track).trim()).filter(Boolean))),
          pictureUrl: String(member.pictureUrl || '').trim(),
          userId: member.userId || '',
          isUser: Boolean(member.userId),
        }))
        .filter((member) => member.name)

      const previousLinkedUserIds = editingTeamId
        ? Array.from(
            new Set(
              (Array.isArray(existingTeam?.memberProfiles)
                ? existingTeam.memberProfiles
                : []
              )
                .map((member) => String(member?.userId || '').trim())
                .filter(Boolean),
            ),
          )
        : []

      const teamId = await upsertTeam(editingTeamId, {
        ...teamForm,
        serviceCategories: normalizedServiceCategories,
        memberProfiles: normalizedMembers,
        memberIds: normalizedMembers.map((member) => member.userId).filter(Boolean),
      })

      const nextLinkedUserIds = Array.from(
        new Set(normalizedMembers.map((member) => String(member.userId || '').trim()).filter(Boolean)),
      )
      const impactedUserIds = Array.from(new Set([...previousLinkedUserIds, ...nextLinkedUserIds]))

      await Promise.all(
        impactedUserIds.map(async (userId) => {
          const user = userById[userId]
          if (!user) return
          const currentTeamIds = Array.isArray(user.teamIds) ? user.teamIds : []
          const nextTeamIds = new Set(currentTeamIds)

          if (nextLinkedUserIds.includes(userId)) {
            nextTeamIds.add(teamId)
          } else {
            nextTeamIds.delete(teamId)
          }

          await setUserTeamMembership(userId, Array.from(nextTeamIds))
        }),
      )

      setStatus(editingTeamId ? 'Team updated.' : 'Team created.')
      setEditingTeamId('')
      setTeamForm(EMPTY_TEAM_FORM)
      setTeamMemberDraft(EMPTY_TEAM_MEMBER_DRAFT)
      setEditingDraftMemberId('')
    } catch (error) {
      setStatus(error?.message || 'Failed to save team.')
    }
  }

  function addTeamMemberToDraft() {
    const name = String(teamMemberDraft.name || '').trim()
    if (!name) {
      setStatus('Team member name is required.')
      return
    }

    setStatus('')
    const linkedUser = users.find((item) => item.id === teamMemberDraft.linkedUserId)
    const nextMemberPayload = {
      id: editingDraftMemberId || createTeamMemberId(),
      name,
      technicalRole: String(teamMemberDraft.technicalRole || '').trim(),
      websiteTracks: isWebsiteDevelopmentTeam
        ? Array.from(new Set((Array.isArray(teamMemberDraft.websiteTracks) ? teamMemberDraft.websiteTracks : []).map((track) => String(track).trim()).filter(Boolean)))
        : [],
      pictureUrl: String(teamMemberDraft.pictureUrl || '').trim(),
      userId: linkedUser?.id || '',
      isUser: Boolean(linkedUser?.id),
    }

    setTeamForm((current) => ({
      ...current,
      memberProfiles: editingDraftMemberId
        ? (Array.isArray(current.memberProfiles) ? current.memberProfiles : []).map((member) =>
            member.id === editingDraftMemberId ? nextMemberPayload : member,
          )
        : [
            ...(Array.isArray(current.memberProfiles) ? current.memberProfiles : []),
            nextMemberPayload,
          ],
    }))

    setTeamMemberDraft(EMPTY_TEAM_MEMBER_DRAFT)
    setEditingDraftMemberId('')
  }

  function removeDraftTeamMember(memberId) {
    setTeamForm((current) => ({
      ...current,
      memberProfiles: (Array.isArray(current.memberProfiles) ? current.memberProfiles : []).filter((item) => item.id !== memberId),
    }))

    if (editingDraftMemberId === memberId) {
      setEditingDraftMemberId('')
      setTeamMemberDraft(EMPTY_TEAM_MEMBER_DRAFT)
    }
  }

  function startEditDraftTeamMember(member) {
    setEditingDraftMemberId(member.id)
    setTeamMemberDraft({
      name: member.name || '',
      technicalRole: member.technicalRole || '',
      websiteTracks: Array.isArray(member.websiteTracks) ? member.websiteTracks : [],
      pictureUrl: member.pictureUrl || '',
      linkedUserId: member.userId || '',
    })
    setStatus('Editing selected member. Update fields then click Update Member.')
    requestAnimationFrame(() => {
      teamFormSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  function cancelDraftMemberEdit() {
    setEditingDraftMemberId('')
    setTeamMemberDraft(EMPTY_TEAM_MEMBER_DRAFT)
    setStatus('')
  }

  async function onTeamMemberPhotoFileChange(event) {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      const dataUrl = await fileToDataUrl(file)
      setTeamMemberDraft((current) => ({ ...current, pictureUrl: dataUrl }))
      setStatus('Member image selected.')
    } catch (error) {
      setStatus(error?.message || 'Unable to load selected image.')
    } finally {
      event.target.value = ''
    }
  }

  async function onUserPhotoFileChange(event) {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      const dataUrl = await fileToDataUrl(file)
      setUserForm((current) => ({ ...current, photoURL: dataUrl }))
      setStatus('User profile image selected.')
    } catch (error) {
      setStatus(error?.message || 'Unable to load selected profile image.')
    } finally {
      event.target.value = ''
    }
  }

  async function onDeleteUser(userId) {
    if (!window.confirm('Remove this user from system access?')) return

    const targetUser = users.find((item) => item.id === userId)
    if (!targetUser) return

    try {
      await setUserAccountStatus(userId, 'removed')
      await requestAuthUserDeletion({
        userId,
        email: targetUser?.email,
        name: targetUser?.name,
        reason: 'account_removed',
        requestedByUserId: currentUser?.uid,
        requestedByName: currentUser?.displayName || currentUser?.email || 'Admin',
      })
      toast.success(`Removed user: ${targetUser.name || targetUser.phoneNumber || 'User'}`)
    } catch (error) {
      setStatus(error?.message || 'Failed to delete user.')
    }
  }

  async function onClearUserFromSystem(userId) {
    if (!window.confirm('Permanently clear this user from the system? This cannot be undone.')) return

    const targetUser = users.find((item) => item.id === userId)
    if (!targetUser) return

    try {
      await requestAuthUserDeletion({
        userId,
        email: targetUser?.email,
        name: targetUser?.name,
        reason: 'clear_from_system',
        requestedByUserId: currentUser?.uid,
        requestedByName: currentUser?.displayName || currentUser?.email || 'Admin',
      })

      const impactedTeams = teams.filter((team) => {
        const memberIds = Array.isArray(team.memberIds) ? team.memberIds : []
        const memberProfiles = Array.isArray(team.memberProfiles) ? team.memberProfiles : []
        const linkedInProfiles = memberProfiles.some((member) => String(member?.userId || '').trim() === userId)
        return memberIds.includes(userId) || linkedInProfiles
      })

      await Promise.all(
        impactedTeams.map((team) => {
          const nextMemberProfiles = (Array.isArray(team.memberProfiles) ? team.memberProfiles : []).filter(
            (member) => String(member?.userId || '').trim() !== userId,
          )
          const nextMemberIds = (Array.isArray(team.memberIds) ? team.memberIds : []).filter(
            (memberId) => memberId !== userId,
          )

          return upsertTeam(team.id, {
            ...team,
            memberProfiles: nextMemberProfiles,
            memberIds: nextMemberIds,
          })
        }),
      )

      await deleteUser(userId)

      if (editingUserId === userId) {
        setEditingUserId('')
        setUserForm(EMPTY_USER_FORM)
      }

      toast.success(`Cleared user: ${targetUser.name || targetUser.phoneNumber || 'User'}`)
    } catch (error) {
      setStatus(error?.message || 'Failed to clear user from system.')
    }
  }

  async function onToggleUserLock(userId) {
    const targetUser = users.find((item) => item.id === userId)
    if (!targetUser) return

    const currentStatus = String(targetUser.accountStatus || 'active').trim().toLowerCase()
    if (currentStatus === 'removed') {
      setStatus('Removed users cannot be locked or unlocked. Edit and set status back to active first.')
      return
    }

    const nextStatus = currentStatus === 'locked' ? 'active' : 'locked'

    try {
      await setUserAccountStatus(userId, nextStatus)
      if (nextStatus === 'locked') {
        toast.success(`Locked user: ${targetUser.name || targetUser.phoneNumber || 'User'}`)
      } else {
        toast.success(`Unlocked user: ${targetUser.name || targetUser.phoneNumber || 'User'}`)
      }
    } catch (error) {
      setStatus(error?.message || 'Failed to update user lock status.')
    }
  }

  async function onDeleteTeam(teamId) {
    if (!window.confirm('Delete this team?')) return

    const targetTeam = teams.find((item) => item.id === teamId)
    if (!targetTeam) return

    try {
      await deleteTeam(teamId)
      toast.notify(`Deleted team: ${targetTeam.name || 'Team'}`, {
        duration: 10000,
        actionLabel: 'Undo',
        onAction: async () => {
          await restoreTeam(targetTeam)
          toast.success(`Restored team: ${targetTeam.name || 'Team'}`)
        },
      })
    } catch (error) {
      setStatus(error?.message || 'Failed to delete team.')
    }
  }

  function togglePermission(role, permissionKey) {
    setRolePermissionMap((current) => {
      const currentPermissions = new Set(current[role] || [])
      if (currentPermissions.has(permissionKey)) {
        currentPermissions.delete(permissionKey)
      } else {
        currentPermissions.add(permissionKey)
      }

      return {
        ...current,
        [role]: Array.from(currentPermissions),
      }
    })
  }

  async function saveRoleAccess(role) {
    try {
      await setRolePermissions(role, rolePermissionMap[role] || [])
      setStatus(`Permissions updated for ${role}.`)
    } catch (error) {
      setStatus(error?.message || 'Failed to update role permissions.')
    }
  }

  async function copyToClipboard(value, fieldKey) {
    try {
      await navigator.clipboard.writeText(String(value || ''))
      setCopiedField(fieldKey)
      toast.success('Copied to clipboard.')
      window.setTimeout(() => {
        setCopiedField((current) => (current === fieldKey ? '' : current))
      }, 1400)
    } catch {
      toast.error('Unable to copy. Please copy manually.')
    }
  }

  function closeCredentialsPopup() {
    setGeneratedCredentials(null)
    setCopiedField('')
  }

  return (
    <ModuleShell
      title="Team & Users"
      description="Manage users, assign roles, configure role access, and organize service teams."
      variant="admin"
    >
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="ip-stat-card">
          <p className="text-xs uppercase tracking-wider text-slate-500">System Users</p>
          <p className="mt-1 text-2xl font-black text-slate-900">{users.length}</p>
        </div>
        <div className="ip-stat-card">
          <p className="text-xs uppercase tracking-wider text-slate-500">Teams</p>
          <p className="mt-1 text-2xl font-black text-violet-700">{teams.length}</p>
        </div>
        <div className="ip-stat-card">
          <p className="text-xs uppercase tracking-wider text-slate-500">Roles Configured</p>
          <p className="mt-1 text-2xl font-black text-sky-700">{ROLE_ACCESS_MATRIX_ROLES.length}</p>
        </div>
        <div className="ip-stat-card">
          <p className="text-xs uppercase tracking-wider text-slate-500">Service Categories</p>
          <p className="mt-1 text-2xl font-black text-emerald-700">{SERVICE_CATEGORIES.length}</p>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5">
        <div className="inline-flex items-center gap-2">
          <h4 className="font-bold text-slate-900">Role Access Matrix</h4>
          <button
            type="button"
            onClick={() => setShowRoleAccessMatrix((current) => !current)}
            className="group relative inline-flex h-9 w-9 shrink-0 self-center items-center justify-center rounded-full border border-slate-300/90 bg-gradient-to-b from-white via-slate-50 to-slate-100 text-slate-700 shadow-[0_8px_16px_-14px_rgba(15,23,42,0.8)] transition duration-200 hover:-translate-y-[1px] hover:border-slate-400 hover:shadow-[0_10px_18px_-14px_rgba(15,23,42,0.9)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 sm:h-7 sm:w-7"
            title={showRoleAccessMatrix ? 'Hide role access matrix' : 'Show role access matrix'}
            aria-label={showRoleAccessMatrix ? 'Hide role access matrix' : 'Show role access matrix'}
            aria-pressed={showRoleAccessMatrix}
          >
            <span className="pointer-events-none absolute inset-0 rounded-full bg-[radial-gradient(circle_at_30%_25%,rgba(255,255,255,0.96),rgba(255,255,255,0)_58%)]" />
            <span className="relative block h-3 w-3">
              <span className="absolute left-0 top-1/2 h-[2px] w-3 -translate-y-1/2 rounded-full bg-slate-700 transition-colors duration-200 group-hover:bg-slate-900" />
              <span
                className={`absolute left-1/2 top-0 h-3 w-[2px] -translate-x-1/2 rounded-full bg-slate-700 transition-all duration-200 group-hover:bg-slate-900 ${
                  showRoleAccessMatrix ? 'scale-y-0 opacity-0' : 'scale-y-100 opacity-100'
                }`}
              />
            </span>
          </button>
        </div>
        <p className="mt-1 text-xs text-slate-500">Select the pages/modules each role can access.</p>

        <div
          className={`grid transition-all duration-300 ease-out ${showRoleAccessMatrix ? 'mt-4 grid-rows-[1fr] opacity-100' : 'mt-0 grid-rows-[0fr] opacity-0'}`}
        >
          <div className="space-y-3 overflow-hidden">
            {ROLE_ACCESS_MATRIX_ROLES.map((role) => (
              <div key={role} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold uppercase tracking-wider text-slate-800">{role}</p>
                  <button
                    type="button"
                    onClick={() => saveRoleAccess(role)}
                    className="rounded-lg bg-[#8246f6] px-2.5 py-1 text-xs font-semibold text-white hover:bg-[#6f39e7]"
                  >
                    Save {role}
                  </button>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {APP_PERMISSION_KEYS.map((permissionKey) => {
                    const isChecked = (rolePermissionMap[role] || []).includes(permissionKey)
                    return (
                      <label key={`${role}-${permissionKey}`} className="flex items-center gap-2 rounded-lg bg-white px-2 py-1.5 text-xs text-slate-700">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => togglePermission(role, permissionKey)}
                        />
                        {PERMISSION_LABELS[permissionKey] || permissionKey}
                      </label>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-2">
        <article ref={userFormSectionRef} className="rounded-3xl border border-slate-200 bg-white p-5">
          <div className="inline-flex items-center gap-2">
            <h4 className="font-bold text-slate-900">Users</h4>
            <button
              type="button"
              onClick={() => setShowUsersSection((current) => !current)}
              className="group relative inline-flex h-9 w-9 shrink-0 self-center items-center justify-center rounded-full border border-slate-300/90 bg-gradient-to-b from-white via-slate-50 to-slate-100 text-slate-700 shadow-[0_8px_16px_-14px_rgba(15,23,42,0.8)] transition duration-200 hover:-translate-y-[1px] hover:border-slate-400 hover:shadow-[0_10px_18px_-14px_rgba(15,23,42,0.9)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 sm:h-7 sm:w-7"
              title={showUsersSection ? 'Hide users section' : 'Show users section'}
              aria-label={showUsersSection ? 'Hide users section' : 'Show users section'}
              aria-pressed={showUsersSection}
            >
              <span className="pointer-events-none absolute inset-0 rounded-full bg-[radial-gradient(circle_at_30%_25%,rgba(255,255,255,0.96),rgba(255,255,255,0)_58%)]" />
              <span className="relative block h-3 w-3">
                <span className="absolute left-0 top-1/2 h-[2px] w-3 -translate-y-1/2 rounded-full bg-slate-700 transition-colors duration-200 group-hover:bg-slate-900" />
                <span
                  className={`absolute left-1/2 top-0 h-3 w-[2px] -translate-x-1/2 rounded-full bg-slate-700 transition-all duration-200 group-hover:bg-slate-900 ${
                    showUsersSection ? 'scale-y-0 opacity-0' : 'scale-y-100 opacity-100'
                  }`}
                />
              </span>
            </button>
          </div>
          <p className="mt-1 text-xs text-slate-500">Create user records, assign role, title, team membership, and profile picture.</p>

          <div
            className={`grid transition-all duration-300 ease-out ${showUsersSection ? 'mt-4 grid-rows-[1fr] opacity-100' : 'mt-0 grid-rows-[0fr] opacity-0'}`}
          >
            <div className="overflow-hidden">
          <form onSubmit={onSaveUser} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                value={userForm.name}
                onChange={(event) => setUserForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="Full name"
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                required
              />
              <input
                value={userForm.phoneNumber}
                onChange={(event) => setUserForm((current) => ({ ...current, phoneNumber: event.target.value }))}
                placeholder="Phone number"
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                required
                inputMode="tel"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <select
                value={userForm.role}
                onChange={(event) => setUserForm((current) => ({ ...current, role: event.target.value }))}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
              >
                {APP_ROLES.map((role) => (
                  <option key={role} value={role}>{role}</option>
                ))}
              </select>
              <input
                value={userForm.title}
                onChange={(event) => setUserForm((current) => ({ ...current, title: event.target.value }))}
                placeholder="Job title"
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              Temporary password is auto-generated from name initials, phone, and service initials.
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-2">
              <p className="mb-2 text-xs font-semibold text-slate-600">Services provided</p>
              <div className="grid gap-1 sm:grid-cols-2">
                {outsourceCategoryOptions.map((category) => {
                  const checked = userForm.outsourceServices.includes(category)
                  return (
                    <label key={`user-outsource-service-${category}`} className="flex items-center gap-2 rounded-lg bg-white px-2 py-1.5 text-xs text-slate-700">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          setUserForm((current) => {
                            const next = new Set(current.outsourceServices || [])
                            if (next.has(category)) next.delete(category)
                            else next.add(category)
                            const nextServices = Array.from(next)
                            return {
                              ...current,
                              outsourceServices: nextServices,
                              websiteTracks: nextServices.includes('Website Development')
                                ? current.websiteTracks
                                : [],
                            }
                          })
                        }}
                      />
                      {category}
                    </label>
                  )
                })}
              </div>
            </div>

            {isUserWebsiteDevelopment ? (
              <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-2">
                <p className="text-xs font-semibold text-indigo-700">Website Development Tracks (multi-select)</p>
                <div className="mt-2 grid gap-1 sm:grid-cols-2">
                  {WEBSITE_DEVELOPMENT_TRACKS.map((track) => {
                    const checked = (userForm.websiteTracks || []).includes(track)
                    return (
                      <label key={`user-track-${track}`} className="flex items-center gap-2 rounded-lg bg-white px-2 py-1 text-xs text-slate-700">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            setUserForm((current) => {
                              const next = new Set(current.websiteTracks || [])
                              if (next.has(track)) next.delete(track)
                              else next.add(track)
                              return { ...current, websiteTracks: Array.from(next) }
                            })
                          }}
                        />
                        {track}
                      </label>
                    )
                  })}
                </div>
              </div>
            ) : null}

            <div className="grid gap-2 sm:grid-cols-2">
              <input
                type="file"
                accept="image/*"
                onChange={onUserPhotoFileChange}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              />
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                {userForm.photoURL ? (
                  <>
                    <span>Image selected</span>
                    <button
                      type="button"
                      onClick={() => setUserForm((current) => ({ ...current, photoURL: '' }))}
                      className="rounded bg-rose-100 px-2 py-1 font-semibold text-rose-700 hover:bg-rose-200"
                    >
                      Clear
                    </button>
                  </>
                ) : (
                  <span>No image selected</span>
                )}
              </div>
            </div>

            <label className="block text-xs font-semibold text-slate-600">Accessible Teams</label>
            <div className="grid gap-2 sm:grid-cols-2">
              {teams.map((team) => {
                const checked = userForm.teamIds.includes(team.id)
                return (
                  <label key={`team-checkbox-${team.id}`} className="flex items-center gap-2 rounded-lg bg-slate-50 px-2 py-1.5 text-xs">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        setUserForm((current) => {
                          const next = new Set(current.teamIds)
                          if (next.has(team.id)) next.delete(team.id)
                          else next.add(team.id)
                          return { ...current, teamIds: Array.from(next) }
                        })
                      }}
                    />
                    {team.name}
                  </label>
                )
              })}
              {!teams.length ? <p className="text-xs text-slate-500">No teams yet.</p> : null}
            </div>

            <div className="flex gap-2">
              <button className="rounded-xl bg-[#8246f6] px-3 py-2 text-xs font-semibold text-white hover:bg-[#6f39e7]">
                {editingUserId ? 'Update User' : 'Add User'}
              </button>
              {editingUserId ? (
                <button
                  type="button"
                  onClick={() => {
                    setEditingUserId('')
                    setUserForm(EMPTY_USER_FORM)
                  }}
                  className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200"
                >
                  Cancel Edit
                </button>
              ) : null}
            </div>
          </form>

          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-600">User Directory</p>
              <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                {filteredUsers.length}/{users.length}
              </span>
            </div>
            <input
              value={userSearchTerm}
              onChange={(event) => setUserSearchTerm(event.target.value)}
              placeholder="Search users by name, phone, role, title, or team"
              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
            />

            <div className="mt-3 space-y-2">
              {filteredUsers.map((item) => (
                <div key={item.id} className="rounded-xl border border-slate-200 bg-white p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-start gap-2.5">
                      {item.photoURL ? (
                        <img src={item.photoURL} alt={item.name || 'User'} className="h-9 w-9 shrink-0 rounded-full object-cover" />
                      ) : (
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 ring-1 ring-slate-200">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden="true">
                            <circle cx="12" cy="8" r="3.2" />
                            <path d="M5.5 19.2a6.5 6.5 0 0 1 13 0" />
                          </svg>
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900">{item.name || 'User'}</p>
                        {item.title ? <p className="truncate text-xs text-slate-600">{item.title}</p> : null}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="rounded-full bg-[#f0e9ff] px-2 py-0.5 text-[11px] font-semibold text-[#6f39e7]">{item.role || 'outsource'}</span>
                      {String(item.role || '').toLowerCase() === 'outsource' ? (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">outsource</span>
                      ) : null}
                      {String(item.accountStatus || 'active').toLowerCase() !== 'active' ? (
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${String(item.accountStatus || 'active').toLowerCase() === 'locked' ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'}`}>
                          {String(item.accountStatus || 'active').toLowerCase()}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {item.phoneNumber ? (
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                        Phone: {item.phoneNumber}
                      </span>
                    ) : null}
                    {(item.outsourceServices || []).map((service) => (
                      <span key={`user-outsource-service-${item.id}-${service}`} className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-700">
                        {service}
                      </span>
                    ))}
                    {(item.websiteTracks || []).map((track) => (
                      <span key={`user-track-${item.id}-${track}`} className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">
                        {track}
                      </span>
                    ))}
                    {(item.teamIds || []).map((teamId) => (
                      <span key={`user-team-${item.id}-${teamId}`} className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700">
                        {teamNameById[teamId] || teamId}
                      </span>
                    ))}
                    {!(item.teamIds || []).length ? <span className="text-[11px] text-slate-500">No teams assigned</span> : null}
                  </div>

                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingUserId(item.id)
                        setUserForm({
                          name: item.name || '',
                          phoneNumber: item.phoneNumber || '',
                          role: item.role || 'outsource',
                          photoURL: item.photoURL || '',
                          title: item.title || '',
                          teamIds: Array.isArray(item.teamIds) ? item.teamIds : [],
                          websiteTracks: Array.isArray(item.websiteTracks) ? item.websiteTracks : [],
                          outsourceServices: Array.isArray(item.outsourceServices) ? item.outsourceServices : [],
                        })
                        requestAnimationFrame(() => {
                          userFormSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                        })
                      }}
                      className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteUser(item.id)}
                      className="hidden"
                    >
                      Delete
                    </button>

                    {item.id !== currentUser?.uid ? (
                      <>
                        <button
                          type="button"
                          onClick={() => onToggleUserLock(item.id)}
                          className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border transition ${String(item.accountStatus || 'active').toLowerCase() === 'locked' ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100'}`}
                          title={String(item.accountStatus || 'active').toLowerCase() === 'locked' ? 'Unlock user login' : 'Lock user login'}
                          aria-label={String(item.accountStatus || 'active').toLowerCase() === 'locked' ? 'Unlock user login' : 'Lock user login'}
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden="true">
                            <rect x="5" y="11" width="14" height="9" rx="2" />
                            {String(item.accountStatus || 'active').toLowerCase() === 'locked' ? (
                              <path d="M8 11V8a4 4 0 0 1 8 0v3" strokeLinecap="round" />
                            ) : (
                              <path d="M15.5 11V8a3.5 3.5 0 0 0-7 0" strokeLinecap="round" />
                            )}
                          </svg>
                        </button>

                        <button
                          type="button"
                          onClick={() => onDeleteUser(item.id)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-rose-200 bg-rose-50 text-rose-700 transition hover:bg-rose-100"
                          title="Remove user access"
                          aria-label="Remove user access"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden="true">
                            <path d="M4 7h16" />
                            <path d="M9.5 7V5.5A1.5 1.5 0 0 1 11 4h2a1.5 1.5 0 0 1 1.5 1.5V7" />
                            <path d="M7.5 7.5l.7 10a2 2 0 0 0 2 1.8h3.6a2 2 0 0 0 2-1.8l.7-10" />
                            <path d="M10 11v5" />
                            <path d="M14 11v5" />
                          </svg>
                        </button>

                        <button
                          type="button"
                          onClick={() => onClearUserFromSystem(item.id)}
                          className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                          title="Clear user from system"
                          aria-label="Clear user from system"
                        >
                          Clear
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>
              ))}
              {!loading && !filteredUsers.length ? <p className="text-sm text-slate-500">No users match this search.</p> : null}
              {loading && !users.length ? <p className="text-sm text-slate-500">Loading users...</p> : null}
            </div>
          </div>
            </div>
          </div>
        </article>

        <article ref={teamFormSectionRef} className="rounded-3xl border border-slate-200 bg-white p-5">
          <div className="inline-flex items-center gap-2">
            <h4 className="font-bold text-slate-900">Teams</h4>
            <button
              type="button"
              onClick={() => setShowTeamsSection((current) => !current)}
              className="group relative inline-flex h-9 w-9 shrink-0 self-center items-center justify-center rounded-full border border-slate-300/90 bg-gradient-to-b from-white via-slate-50 to-slate-100 text-slate-700 shadow-[0_8px_16px_-14px_rgba(15,23,42,0.8)] transition duration-200 hover:-translate-y-[1px] hover:border-slate-400 hover:shadow-[0_10px_18px_-14px_rgba(15,23,42,0.9)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 sm:h-7 sm:w-7"
              title={showTeamsSection ? 'Hide teams section' : 'Show teams section'}
              aria-label={showTeamsSection ? 'Hide teams section' : 'Show teams section'}
              aria-pressed={showTeamsSection}
            >
              <span className="pointer-events-none absolute inset-0 rounded-full bg-[radial-gradient(circle_at_30%_25%,rgba(255,255,255,0.96),rgba(255,255,255,0)_58%)]" />
              <span className="relative block h-3 w-3">
                <span className="absolute left-0 top-1/2 h-[2px] w-3 -translate-y-1/2 rounded-full bg-slate-700 transition-colors duration-200 group-hover:bg-slate-900" />
                <span
                  className={`absolute left-1/2 top-0 h-3 w-[2px] -translate-x-1/2 rounded-full bg-slate-700 transition-all duration-200 group-hover:bg-slate-900 ${
                    showTeamsSection ? 'scale-y-0 opacity-0' : 'scale-y-100 opacity-100'
                  }`}
                />
              </span>
            </button>
          </div>
          <p className="mt-1 text-xs text-slate-500">Create teams with responsible services, members, and access mapping.</p>

          <div
            className={`grid transition-all duration-300 ease-out ${showTeamsSection ? 'mt-4 grid-rows-[1fr] opacity-100' : 'mt-0 grid-rows-[0fr] opacity-0'}`}
          >
            <div className="overflow-hidden">
          <form onSubmit={onSaveTeam} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-1">
              <input
                value={teamForm.name}
                onChange={(event) => setTeamForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="Team name"
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                required
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-2">
                <p className="mb-2 text-xs font-semibold text-slate-600">Service categories</p>
                <div className="grid gap-1">
                  {SERVICE_CATEGORIES.map((category) => {
                    const checked = teamForm.serviceCategories.includes(category)
                    return (
                      <label key={category} className="flex items-center gap-2 rounded-lg bg-white px-2 py-1.5 text-xs text-slate-700">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            setTeamForm((current) => {
                              const next = new Set(current.serviceCategories || [])
                              if (next.has(category)) next.delete(category)
                              else next.add(category)
                              return { ...current, serviceCategories: Array.from(next) }
                            })
                          }}
                        />
                        {category}
                      </label>
                    )
                  })}
                </div>
              </div>
            </div>

            <textarea
              value={teamForm.description}
              onChange={(event) => setTeamForm((current) => ({ ...current, description: event.target.value }))}
              placeholder="Team description and responsibilities"
              className="h-20 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />

            <label className="block text-xs font-semibold text-slate-600">Team Members (Documentation)</label>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <input
                  value={teamMemberDraft.name}
                  onChange={(event) => setTeamMemberDraft((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Member name"
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                />
                <input
                  value={teamMemberDraft.technicalRole}
                  onChange={(event) => setTeamMemberDraft((current) => ({ ...current, technicalRole: event.target.value }))}
                  placeholder="Technical role (custom)"
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                />
              </div>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <input
                  type="file"
                  accept="image/*"
                  onChange={onTeamMemberPhotoFileChange}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                />
                <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
                  {teamMemberDraft.pictureUrl ? (
                    <>
                      <span>Image selected</span>
                      <button
                        type="button"
                        onClick={() => setTeamMemberDraft((current) => ({ ...current, pictureUrl: '' }))}
                        className="rounded bg-rose-100 px-2 py-1 font-semibold text-rose-700 hover:bg-rose-200"
                      >
                        Clear
                      </button>
                    </>
                  ) : (
                    <span>No image selected</span>
                  )}
                </div>
              </div>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <select
                  value=""
                  onChange={(event) => {
                    const selectedKey = event.target.value
                    const selectedMember = existingTeamMemberOptions.find((item) => item.key === selectedKey)
                    if (!selectedMember) return

                    setTeamMemberDraft((current) => ({
                      ...current,
                      name: selectedMember.name,
                      technicalRole: selectedMember.technicalRole,
                      websiteTracks: selectedMember.websiteTracks || [],
                      pictureUrl: selectedMember.pictureUrl,
                      linkedUserId: selectedMember.userId,
                    }))
                  }}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                >
                  <option value="">Choose from existing team members</option>
                  {existingTeamMemberOptions.map((member) => (
                    <option key={`existing-member-${member.key}`} value={member.key}>
                      {member.name}
                      {member.technicalRole ? ` • ${member.technicalRole}` : ''}
                      {member.websiteTracks?.length ? ` • ${member.websiteTracks.join(', ')}` : ''}
                      {member.teamName ? ` • ${member.teamName}` : ''}
                    </option>
                  ))}
                </select>
                <select
                  value={teamMemberDraft.linkedUserId}
                  onChange={(event) => {
                    const selectedId = event.target.value
                    const linkedUser = users.find((item) => item.id === selectedId)
                    setTeamMemberDraft((current) => ({
                      ...current,
                      linkedUserId: selectedId,
                      name: linkedUser ? (linkedUser.name || current.name) : current.name,
                      pictureUrl: linkedUser ? (linkedUser.photoURL || current.pictureUrl) : current.pictureUrl,
                      technicalRole: linkedUser ? (linkedUser.title || current.technicalRole) : current.technicalRole,
                      websiteTracks: linkedUser && Array.isArray(linkedUser.websiteTracks)
                        ? linkedUser.websiteTracks
                        : current.websiteTracks,
                    }))
                  }}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                >
                  <option value="">Choose from system users</option>
                  {users.map((item) => (
                    <option key={`team-member-user-${item.id}`} value={item.id}>
                      {item.name || 'User'}
                    </option>
                  ))}
                </select>
              </div>

              {isWebsiteDevelopmentTeam ? (
                <div className="mt-2 rounded-lg border border-indigo-100 bg-indigo-50/60 p-2">
                  <p className="text-xs font-semibold text-indigo-700">Website Development Tracks (multi-select)</p>
                  <div className="mt-2 grid gap-1 sm:grid-cols-2">
                    {WEBSITE_DEVELOPMENT_TRACKS.map((track) => {
                      const checked = (teamMemberDraft.websiteTracks || []).includes(track)
                      return (
                        <label key={`track-${track}`} className="flex items-center gap-2 rounded-lg bg-white px-2 py-1 text-xs text-slate-700">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              setTeamMemberDraft((current) => {
                                const next = new Set(current.websiteTracks || [])
                                if (next.has(track)) next.delete(track)
                                else next.add(track)
                                return { ...current, websiteTracks: Array.from(next) }
                              })
                            }}
                          />
                          {track}
                        </label>
                      )
                    })}
                  </div>
                </div>
              ) : null}

              <div className="mt-2 flex justify-end">
                <div className="flex gap-2">
                  {editingDraftMemberId ? (
                    <button
                      type="button"
                      onClick={cancelDraftMemberEdit}
                      className="rounded-lg bg-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-300"
                    >
                      Cancel Member Edit
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={addTeamMemberToDraft}
                    className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
                  >
                    {editingDraftMemberId ? 'Update Member' : 'Add Member'}
                  </button>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              {(teamForm.memberProfiles || []).map((member) => (
                <div key={member.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs">
                  <div className="flex min-w-0 items-center gap-2">
                    {member.pictureUrl ? (
                      <img
                        src={member.pictureUrl}
                        alt={member.name || 'Member'}
                        className="h-8 w-8 rounded-full object-cover"
                      />
                    ) : member.userId && userById[member.userId]?.photoURL ? (
                      <img
                        src={userById[member.userId].photoURL}
                        alt={member.name || 'Member'}
                        className="h-8 w-8 rounded-full object-cover"
                      />
                    ) : (
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 ring-1 ring-slate-200">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden="true">
                          <circle cx="12" cy="8" r="3.2" />
                          <path d="M5.5 19.2a6.5 6.5 0 0 1 13 0" />
                        </svg>
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-800">{member.name}</p>
                      <p className="truncate text-slate-600">
                        {member.technicalRole || 'No role'}
                        {member.userId ? ' • linked user' : ' • documentation only'}
                      </p>
                      {isWebsiteDevelopmentTeam && Array.isArray(member.websiteTracks) && member.websiteTracks.length ? (
                        <p className="truncate text-[11px] text-indigo-700">Tracks: {member.websiteTracks.join(', ')}</p>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => startEditDraftTeamMember(member)}
                      className="rounded-lg bg-amber-100 px-2 py-1 text-[11px] font-semibold text-amber-700 hover:bg-amber-200"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => removeDraftTeamMember(member.id)}
                      className="rounded-lg bg-rose-100 px-2 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-200"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
              {!teamForm.memberProfiles?.length ? <p className="text-xs text-slate-500">No members added yet.</p> : null}
            </div>

            <div className="flex gap-2">
              <button type="submit" className="rounded-xl bg-[#8246f6] px-3 py-2 text-xs font-semibold text-white hover:bg-[#6f39e7]">
                {editingTeamId ? 'Update Team' : 'Add Team'}
              </button>
              {editingTeamId ? (
                <button
                  type="button"
                  onClick={() => {
                    setEditingTeamId('')
                    setTeamForm(EMPTY_TEAM_FORM)
                    setTeamMemberDraft(EMPTY_TEAM_MEMBER_DRAFT)
                    setEditingDraftMemberId('')
                  }}
                  className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200"
                >
                  Cancel Edit
                </button>
              ) : null}
            </div>
          </form>

          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-600">Team Directory</p>
              <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                {filteredTeams.length}/{teams.length}
              </span>
            </div>

            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <input
                value={teamSearchTerm}
                onChange={(event) => setTeamSearchTerm(event.target.value)}
                placeholder="Search teams by name, service, or member"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              />
              <select
                value={teamServiceFilter}
                onChange={(event) => setTeamServiceFilter(event.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                <option value="all">All service categories</option>
                {SERVICE_CATEGORIES.map((category) => (
                  <option key={`filter-${category}`} value={category}>{category}</option>
                ))}
              </select>
            </div>

            <div className="mt-3 grid gap-3">
            {filteredTeams.map((team) => (
              <div key={team.id} className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-3 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-900">{team.name || 'Team'}</p>
                    <p className="mt-0.5 text-[11px] text-slate-500">{team.description || 'No description added yet.'}</p>
                  </div>
                  <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-700">
                    {(team.serviceCategories || []).length
                      ? `${team.serviceCategories.length} Services`
                      : team.serviceCategory || team.serviceType || 'General'}
                  </span>
                </div>

                {(team.serviceCategories || []).length ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {(team.serviceCategories || []).map((category) => (
                      <span key={`${team.id}-${category}`} className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-700">
                        {category}
                      </span>
                    ))}
                  </div>
                ) : null}

                <div className="mt-2 grid grid-cols-3 gap-2">
                  <div className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-center">
                    <p className="text-[10px] uppercase tracking-wide text-slate-500">Members</p>
                    <p className="text-sm font-bold text-slate-900">{(team.memberProfiles || []).length || (team.memberIds || []).length || 0}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-center">
                    <p className="text-[10px] uppercase tracking-wide text-slate-500">Linked Users</p>
                    <p className="text-sm font-bold text-sky-700">{(team.memberProfiles || []).filter((member) => member.userId).length}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-center">
                    <p className="text-[10px] uppercase tracking-wide text-slate-500">Services</p>
                    <p className="text-sm font-bold text-violet-700">{(team.serviceCategories || []).length || 1}</p>
                  </div>
                </div>

                <div className="mt-3 rounded-xl border border-slate-200 bg-white p-2.5">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Members</p>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                      {(team.memberProfiles || []).length || (team.memberIds || []).length || 0}
                    </span>
                  </div>

                  <p className="text-xs text-slate-600">
                    {(team.memberProfiles || [])
                      .map((member) => {
                        const teamHasWebsiteDevelopment = (team.serviceCategories || []).includes('Website Development')
                        const trackSuffix = teamHasWebsiteDevelopment && Array.isArray(member.websiteTracks) && member.websiteTracks.length
                          ? ` [${member.websiteTracks.join(', ')}]`
                          : ''
                        return `${member.name || 'Member'}${member.technicalRole ? ` (${member.technicalRole})` : ''}${trackSuffix}`
                      })
                      .join(', ') ||
                      (team.memberIds || []).map((id) => userNameById[id] || id).join(', ') ||
                      '-'}
                  </p>
                </div>

                {(team.memberProfiles || []).length ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {(team.memberProfiles || []).map((member) => (
                      <div key={`preview-${team.id}-${member.id}`} className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-2 py-1">
                        {member.pictureUrl ? (
                          <img
                            src={member.pictureUrl}
                            alt={member.name || 'Member'}
                            className="h-6 w-6 rounded-full object-cover"
                          />
                        ) : member.userId && userById[member.userId]?.photoURL ? (
                          <img
                            src={userById[member.userId].photoURL}
                            alt={member.name || 'Member'}
                            className="h-6 w-6 rounded-full object-cover"
                          />
                        ) : (
                          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-slate-500 ring-1 ring-slate-200">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3 w-3" aria-hidden="true">
                              <circle cx="12" cy="8" r="3.2" />
                              <path d="M5.5 19.2a6.5 6.5 0 0 1 13 0" />
                            </svg>
                          </div>
                        )}
                        <span className="max-w-[110px] truncate text-[11px] font-medium text-slate-700">{member.name}</span>
                      </div>
                    ))}
                  </div>
                ) : null}

                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const normalizedMemberProfiles = Array.isArray(team.memberProfiles)
                        ? team.memberProfiles
                        : (team.memberIds || []).map((memberId) => ({
                            id: createTeamMemberId(),
                            name: userNameById[memberId] || memberId,
                            technicalRole: '',
                            pictureUrl: '',
                            userId: memberId,
                            isUser: true,
                          }))

                      setEditingTeamId(team.id)
                      setTeamForm({
                        name: team.name || '',
                        serviceCategories: Array.isArray(team.serviceCategories)
                          ? team.serviceCategories
                          : [team.serviceCategory || team.serviceType || SERVICE_CATEGORIES[0]].filter(Boolean),
                        description: team.description || '',
                        memberIds: Array.isArray(team.memberIds) ? team.memberIds : [],
                        memberProfiles: normalizedMemberProfiles.map((member) => ({
                          ...member,
                          websiteTracks: Array.isArray(member.websiteTracks) ? member.websiteTracks : [],
                        })),
                      })
                      setTeamMemberDraft(EMPTY_TEAM_MEMBER_DRAFT)
                      setEditingDraftMemberId('')
                      requestAnimationFrame(() => {
                        teamFormSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                      })
                    }}
                    className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteTeam(team.id)}
                    className="rounded-lg bg-rose-100 px-2.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-200"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
            </div>
            {!loading && !teams.length ? <p className="mt-3 text-sm text-slate-500">No teams yet. Create your first team above.</p> : null}
            {!loading && teams.length > 0 && !filteredTeams.length ? <p className="mt-3 text-sm text-slate-500">No teams match the current filters.</p> : null}
            {loading && !teams.length ? <p className="text-sm text-slate-500">Loading teams...</p> : null}
          </div>
            </div>
          </div>
        </article>
      </section>

      {generatedCredentials ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-[2px]">
          <div className="w-full max-w-lg rounded-3xl border border-emerald-100 bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">Credentials Ready</p>
                <h4 className="mt-1 text-lg font-black text-slate-900">Successfully Generated Login Credentials</h4>
                <p className="mt-1 text-sm text-slate-600">
                  Share these credentials with {generatedCredentials.fullName || 'the user'}.
                </p>
              </div>
              <button
                type="button"
                onClick={closeCredentialsPopup}
                className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-200"
              >
                Close
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-[11px] uppercase tracking-wider text-slate-500">Login Email (Use This to Sign In)</p>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <p className="break-all text-sm font-semibold text-slate-900">{generatedCredentials.loginEmail}</p>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(generatedCredentials.loginEmail, 'email')}
                    className="rounded-lg bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100"
                  >
                    {copiedField === 'email' ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-[11px] uppercase tracking-wider text-slate-500">Temporary Password</p>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <p className="break-all text-sm font-semibold text-slate-900">{generatedCredentials.temporaryPassword}</p>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(generatedCredentials.temporaryPassword, 'password')}
                    className="rounded-lg bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100"
                  >
                    {copiedField === 'password' ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>

              <div className="rounded-xl border border-dashed border-slate-300 bg-white p-3">
                <p className="text-[11px] uppercase tracking-wider text-slate-500">Reference Phone Number</p>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <p className="break-all text-sm font-medium text-slate-700">{generatedCredentials.phoneNumber}</p>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(generatedCredentials.phoneNumber, 'phone')}
                    className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-200"
                  >
                    {copiedField === 'phone' ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() =>
                  copyToClipboard(
                    `Email: ${generatedCredentials.loginEmail}\nPassword: ${generatedCredentials.temporaryPassword}`,
                    'all',
                  )
                }
                className="rounded-xl bg-[#8246f6] px-3 py-2 text-xs font-semibold text-white hover:bg-[#6f39e7]"
              >
                {copiedField === 'all' ? 'Copied All' : 'Copy Login Credentials'}
              </button>
              <button
                type="button"
                onClick={closeCredentialsPopup}
                className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </ModuleShell>
  )
}
