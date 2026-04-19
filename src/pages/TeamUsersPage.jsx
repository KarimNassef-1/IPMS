import { useEffect, useMemo, useState } from 'react'
import ModuleShell from '../components/layout/ModuleShell'
import {
  createManagedAuthUser,
  deleteTeam,
  deleteUser,
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
} from '../utils/constants'

const EMPTY_USER_FORM = {
  name: '',
  email: '',
  password: '',
  role: 'viewer',
  photoURL: '',
  title: '',
  teamIds: [],
}

const EMPTY_TEAM_FORM = {
  name: '',
  role: '',
  pictureUrl: '',
  serviceType: '',
  leadName: '',
  description: '',
  memberIds: [],
  memberProfiles: [],
}

const EMPTY_TEAM_MEMBER_DRAFT = {
  name: '',
  technicalRole: '',
  pictureUrl: '',
  linkedUserId: '',
}

function initialsFromName(value) {
  return String(value || 'M')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || 'M'
}

function createTeamMemberId() {
  return `member_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Failed to read selected image file.'))
    reader.readAsDataURL(file)
  })
}

export default function TeamUsersPage() {
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
    () => users.reduce((acc, item) => {
      acc[item.id] = item.name || item.email || 'Unknown user'
      return acc
    }, {}),
    [users],
  )

  async function onSaveUser(event) {
    event.preventDefault()
    setStatus('')

    try {
      const normalizedEmail = String(userForm.email || '').trim().toLowerCase()
      const safePassword = String(userForm.password || '')

      if (!editingUserId) {
        await createManagedAuthUser(normalizedEmail, safePassword, {
          name: userForm.name,
          email: normalizedEmail,
          role: userForm.role,
          photoURL: userForm.photoURL,
          title: userForm.title,
          teamIds: userForm.teamIds,
        })
      } else {
        await upsertUser(editingUserId, {
          name: userForm.name,
          email: normalizedEmail,
          role: userForm.role,
          photoURL: userForm.photoURL,
          title: userForm.title,
          teamIds: userForm.teamIds,
        })
      }

      setStatus(editingUserId ? 'User updated.' : 'User created.')
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
      const normalizedMembers = (Array.isArray(teamForm.memberProfiles) ? teamForm.memberProfiles : [])
        .map((member) => ({
          id: member.id || createTeamMemberId(),
          name: String(member.name || '').trim(),
          technicalRole: String(member.technicalRole || '').trim(),
          pictureUrl: String(member.pictureUrl || '').trim(),
          userId: member.userId || '',
          isUser: Boolean(member.userId),
        }))
        .filter((member) => member.name)

      await upsertTeam(editingTeamId, {
        ...teamForm,
        memberProfiles: normalizedMembers,
        memberIds: normalizedMembers.map((member) => member.userId).filter(Boolean),
      })

      setStatus(editingTeamId ? 'Team updated.' : 'Team created.')
      setEditingTeamId('')
      setTeamForm(EMPTY_TEAM_FORM)
      setTeamMemberDraft(EMPTY_TEAM_MEMBER_DRAFT)
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

    setTeamForm((current) => ({
      ...current,
      memberProfiles: [
        ...(Array.isArray(current.memberProfiles) ? current.memberProfiles : []),
        {
          id: createTeamMemberId(),
          name,
          technicalRole: String(teamMemberDraft.technicalRole || '').trim(),
          pictureUrl: String(teamMemberDraft.pictureUrl || '').trim(),
          userId: linkedUser?.id || '',
          isUser: Boolean(linkedUser?.id),
        },
      ],
    }))

    setTeamMemberDraft(EMPTY_TEAM_MEMBER_DRAFT)
  }

  function removeDraftTeamMember(memberId) {
    setTeamForm((current) => ({
      ...current,
      memberProfiles: (Array.isArray(current.memberProfiles) ? current.memberProfiles : []).filter((item) => item.id !== memberId),
    }))
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

  async function onDeleteUser(userId) {
    if (!window.confirm('Delete this user profile?')) return

    try {
      await deleteUser(userId)
      setStatus('User deleted.')
    } catch (error) {
      setStatus(error?.message || 'Failed to delete user.')
    }
  }

  async function onDeleteTeam(teamId) {
    if (!window.confirm('Delete this team?')) return

    try {
      await deleteTeam(teamId)
      setStatus('Team deleted.')
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

  return (
    <ModuleShell
      title="Team & Users"
      description="Manage users, assign roles, configure role access, and organize service teams."
    >
      {status ? (
        <p className="mb-4 rounded-xl bg-slate-100 px-3 py-2 text-sm text-slate-700">{status}</p>
      ) : null}

      <section className="rounded-3xl border border-slate-200 bg-white p-5">
        <h4 className="font-bold text-slate-900">Role Access Matrix</h4>
        <p className="mt-1 text-xs text-slate-500">Select the pages/modules each role can access.</p>

        <div className="mt-4 space-y-3">
          {APP_ROLES.map((role) => (
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
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-2">
        <article className="rounded-3xl border border-slate-200 bg-white p-5">
          <h4 className="font-bold text-slate-900">Users</h4>
          <p className="mt-1 text-xs text-slate-500">Create user records, assign role, title, team membership, and profile picture.</p>

          <form onSubmit={onSaveUser} className="mt-4 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                value={userForm.name}
                onChange={(event) => setUserForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="Full name"
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                required
              />
              <input
                value={userForm.email}
                onChange={(event) => setUserForm((current) => ({ ...current, email: event.target.value }))}
                placeholder="Email"
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                required
                disabled={Boolean(editingUserId)}
              />
            </div>

            <input
              type="password"
              value={userForm.password}
              onChange={(event) => setUserForm((current) => ({ ...current, password: event.target.value }))}
              placeholder={editingUserId ? 'Password change is not supported here' : 'Temporary password (min 6 chars)'}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              required={!editingUserId}
              minLength={6}
              disabled={Boolean(editingUserId)}
            />

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

            <input
              value={userForm.photoURL}
              onChange={(event) => setUserForm((current) => ({ ...current, photoURL: event.target.value }))}
              placeholder="Profile picture URL"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />

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

          <div className="mt-4 space-y-2">
            {users.map((item) => (
              <div key={item.id} className="rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900">{item.name || item.email || 'User'}</p>
                  <span className="rounded-full bg-[#f0e9ff] px-2 py-0.5 text-[11px] font-semibold text-[#6f39e7]">{item.role || 'viewer'}</span>
                </div>
                <p className="text-xs text-slate-500">{item.email || '-'}</p>
                <p className="mt-1 text-xs text-slate-600">Teams: {(item.teamIds || []).map((teamId) => teams.find((team) => team.id === teamId)?.name || teamId).join(', ') || '-'}</p>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingUserId(item.id)
                      setUserForm({
                        name: item.name || '',
                        email: item.email || '',
                        password: '',
                        role: item.role || 'viewer',
                        photoURL: item.photoURL || '',
                        title: item.title || '',
                        teamIds: Array.isArray(item.teamIds) ? item.teamIds : [],
                      })
                    }}
                    className="rounded-lg bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteUser(item.id)}
                    className="rounded-lg bg-rose-100 px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-200"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
            {loading && !users.length ? <p className="text-sm text-slate-500">Loading users...</p> : null}
          </div>
        </article>

        <article className="rounded-3xl border border-slate-200 bg-white p-5">
          <h4 className="font-bold text-slate-900">Teams</h4>
          <p className="mt-1 text-xs text-slate-500">Create teams with image, service focus, lead, members, and access mapping.</p>

          <form onSubmit={onSaveTeam} className="mt-4 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                value={teamForm.name}
                onChange={(event) => setTeamForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="Team name"
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                required
              />
              <input
                value={teamForm.role}
                onChange={(event) => setTeamForm((current) => ({ ...current, role: event.target.value }))}
                placeholder="Team role (e.g. Delivery Squad)"
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <input
                value={teamForm.serviceType}
                onChange={(event) => setTeamForm((current) => ({ ...current, serviceType: event.target.value }))}
                placeholder="Service team type (e.g. Branding)"
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
              <input
                value={teamForm.leadName}
                onChange={(event) => setTeamForm((current) => ({ ...current, leadName: event.target.value }))}
                placeholder="Team lead name"
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <input
                value={teamForm.pictureUrl}
                onChange={(event) => setTeamForm((current) => ({ ...current, pictureUrl: event.target.value }))}
                placeholder="Team picture URL"
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
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
                  value={teamMemberDraft.linkedUserId}
                  onChange={(event) => {
                    const selectedId = event.target.value
                    const linkedUser = users.find((item) => item.id === selectedId)
                    setTeamMemberDraft((current) => ({
                      ...current,
                      linkedUserId: selectedId,
                      name: linkedUser ? (linkedUser.name || linkedUser.email || current.name) : current.name,
                      pictureUrl: linkedUser ? (linkedUser.photoURL || current.pictureUrl) : current.pictureUrl,
                      technicalRole: linkedUser ? (linkedUser.title || current.technicalRole) : current.technicalRole,
                    }))
                  }}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                >
                  <option value="">Not a system user</option>
                  {users.map((item) => (
                    <option key={`team-member-user-${item.id}`} value={item.id}>
                      {item.name || item.email || item.id}
                    </option>
                  ))}
                </select>
              </div>
              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  onClick={addTeamMemberToDraft}
                  className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
                >
                  Add Member
                </button>
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
                    ) : (
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#f0e9ff] text-[10px] font-bold text-[#6f39e7]">
                        {initialsFromName(member.name)}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-800">{member.name}</p>
                      <p className="truncate text-slate-600">
                        {member.technicalRole || 'No role'}
                        {member.userId ? ' • linked user' : ' • documentation only'}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeDraftTeamMember(member.id)}
                    className="rounded-lg bg-rose-100 px-2 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-200"
                  >
                    Remove
                  </button>
                </div>
              ))}
              {!teamForm.memberProfiles?.length ? <p className="text-xs text-slate-500">No members added yet.</p> : null}
            </div>

            <div className="flex gap-2">
              <button className="rounded-xl bg-[#8246f6] px-3 py-2 text-xs font-semibold text-white hover:bg-[#6f39e7]">
                {editingTeamId ? 'Update Team' : 'Add Team'}
              </button>
              {editingTeamId ? (
                <button
                  type="button"
                  onClick={() => {
                    setEditingTeamId('')
                    setTeamForm(EMPTY_TEAM_FORM)
                    setTeamMemberDraft(EMPTY_TEAM_MEMBER_DRAFT)
                  }}
                  className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200"
                >
                  Cancel Edit
                </button>
              ) : null}
            </div>
          </form>

          <div className="mt-4 space-y-2">
            {teams.map((team) => (
              <div key={team.id} className="rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900">{team.name || 'Team'}</p>
                  <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-700">{team.serviceType || 'General'}</span>
                </div>
                <p className="mt-1 text-xs text-slate-500">Role: {team.role || '-'}</p>
                <p className="mt-1 text-xs text-slate-500">Lead: {team.leadName || '-'}</p>
                <p className="mt-1 text-xs text-slate-600">
                  Members:{' '}
                  {(team.memberProfiles || [])
                    .map((member) => `${member.name || 'Member'}${member.technicalRole ? ` (${member.technicalRole})` : ''}`)
                    .join(', ') ||
                    (team.memberIds || []).map((id) => userNameById[id] || id).join(', ') ||
                    '-'}
                </p>
                {(team.memberProfiles || []).length ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(team.memberProfiles || []).map((member) => (
                      <div key={`preview-${team.id}-${member.id}`} className="flex items-center gap-2 rounded-full bg-white px-2 py-1">
                        {member.pictureUrl ? (
                          <img
                            src={member.pictureUrl}
                            alt={member.name || 'Member'}
                            className="h-6 w-6 rounded-full object-cover"
                          />
                        ) : (
                          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#f0e9ff] text-[9px] font-bold text-[#6f39e7]">
                            {initialsFromName(member.name)}
                          </div>
                        )}
                        <span className="max-w-[110px] truncate text-[11px] font-medium text-slate-700">{member.name}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
                {team.description ? <p className="mt-1 text-xs text-slate-600">{team.description}</p> : null}
                <div className="mt-2 flex gap-2">
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
                        role: team.role || '',
                        pictureUrl: team.pictureUrl || '',
                        serviceType: team.serviceType || '',
                        leadName: team.leadName || '',
                        description: team.description || '',
                        memberIds: Array.isArray(team.memberIds) ? team.memberIds : [],
                        memberProfiles: normalizedMemberProfiles,
                      })
                      setTeamMemberDraft(EMPTY_TEAM_MEMBER_DRAFT)
                    }}
                    className="rounded-lg bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteTeam(team.id)}
                    className="rounded-lg bg-rose-100 px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-200"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
            {loading && !teams.length ? <p className="text-sm text-slate-500">Loading teams...</p> : null}
          </div>
        </article>
      </section>
    </ModuleShell>
  )
}
