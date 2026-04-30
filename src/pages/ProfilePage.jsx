import { useEffect, useState } from 'react'
import ModuleShell from '../components/layout/ModuleShell'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import { changeUserPasswordWithReauth } from '../services/changePasswordWithReauth'
import { changeUserEmailWithReauth } from '../services/changeEmailWithReauth'
import { generateAndStoreSafeCode, validateSafeCode } from '../services/safeCodeService'
import { useLocation } from 'react-router-dom'

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Failed to read selected image file.'))
    reader.readAsDataURL(file)
  })
}

export default function ProfilePage() {
  const { user, profile, updateProfileSettings, role, isAdmin } = useAuth()
  const location = useLocation()
  const toast = useToast()
  const [name, setName] = useState('')
  const [photoURL, setPhotoURL] = useState('')
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState('')
  const [statusType, setStatusType] = useState('neutral')

  useEffect(() => {
    setName(profile?.name || '')
    setPhotoURL(profile?.photoURL || '')
  }, [profile])

  useEffect(() => {
    if (!status) return
    if (statusType === 'error') {
      toast.error(status)
      return
    }
    if (statusType === 'success') {
      toast.success(status)
      return
    }
    toast.info(status)
  }, [status, statusType, toast])

  async function onPhotoFileChange(event) {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      const dataUrl = await fileToDataUrl(file)
      setPhotoURL(dataUrl)
      setStatus('Image selected. Save profile to apply it.')
      setStatusType('neutral')
    } catch (error) {
      setStatus(error?.message || 'Unable to load selected image.')
      setStatusType('error')
    }
  }

  async function onSubmit(event) {
    event.preventDefault()
    setSaving(true)
    setStatus('')

    try {
      await updateProfileSettings({ name, photoURL })
      setStatus('Profile updated successfully.')
      setStatusType('success')
    } catch (error) {
      setStatus(error?.message || 'Failed to update profile.')
      setStatusType('error')
    } finally {
      setSaving(false)
    }
  }

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordLoading, setPasswordLoading] = useState(false)

  const [safeCodeLoading, setSafeCodeLoading] = useState(false)
  const [generatedSafeCode, setGeneratedSafeCode] = useState('')
  const [generatedSafeCodeExpiry, setGeneratedSafeCodeExpiry] = useState('')

  const [secureCode, setSecureCode] = useState('')
  const [secureCurrentPassword, setSecureCurrentPassword] = useState('')
  const [newLoginEmail, setNewLoginEmail] = useState('')
  const [secureNewPassword, setSecureNewPassword] = useState('')
  const [secureConfirmPassword, setSecureConfirmPassword] = useState('')
  const [secureLoading, setSecureLoading] = useState(false)

  async function handlePasswordReset(event) {
    event.preventDefault()
    setPasswordLoading(true)
    setStatus('')
    setStatusType('neutral')

    if (!currentPassword) {
      setStatus('Please enter your current password.')
      setStatusType('error')
      setPasswordLoading(false)
      return
    }

    if (!newPassword || newPassword.length < 6) {
      setStatus('Password must be at least 6 characters.')
      setStatusType('error')
      setPasswordLoading(false)
      return
    }

    if (newPassword !== confirmPassword) {
      setStatus('Passwords do not match.')
      setStatusType('error')
      setPasswordLoading(false)
      return
    }

    try {
      await changeUserPasswordWithReauth(currentPassword, newPassword)
      setStatus('Password updated successfully.')
      setStatusType('success')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (error) {
      setStatus(error?.message || 'Failed to update password.')
      setStatusType('error')
    } finally {
      setPasswordLoading(false)
    }
  }

  async function onGenerateSafeCode() {
    if (!isAdmin || !user?.uid) return
    setSafeCodeLoading(true)
    setStatus('')

    try {
      const payload = await generateAndStoreSafeCode({
        generatedBy: user.uid,
        generatedByName: profile?.name || user.email || 'Admin',
      })
      setGeneratedSafeCode(payload.code)
      setGeneratedSafeCodeExpiry(payload.expiresAt)
      setStatus('Safe code generated. Share it securely with the outsource user.')
      setStatusType('success')
    } catch (error) {
      setStatus(error?.message || 'Failed to generate safe code.')
      setStatusType('error')
    } finally {
      setSafeCodeLoading(false)
    }
  }

  async function copyGeneratedSafeCode() {
    if (!generatedSafeCode) return
    try {
      await navigator.clipboard.writeText(generatedSafeCode)
      setStatus('Safe code copied.')
      setStatusType('success')
    } catch {
      setStatus('Copy failed. Please copy the code manually.')
      setStatusType('error')
    }
  }

  async function onSubmitOutsourceCredentialUpdate(event) {
    event.preventDefault()
    if (role !== 'outsource') return

    setSecureLoading(true)
    setStatus('')
    setStatusType('neutral')

    const normalizedEmail = String(newLoginEmail || '').trim().toLowerCase()
    const wantsEmailUpdate = normalizedEmail.length > 0
    const wantsPasswordUpdate = String(secureNewPassword || '').length > 0

    if (!secureCode.trim()) {
      setStatus('Safe code is required.')
      setStatusType('error')
      setSecureLoading(false)
      return
    }

    if (!secureCurrentPassword.trim()) {
      setStatus('Current password is required to confirm your identity.')
      setStatusType('error')
      setSecureLoading(false)
      return
    }

    if (!wantsEmailUpdate && !wantsPasswordUpdate) {
      setStatus('Enter a new login email or a new password.')
      setStatusType('error')
      setSecureLoading(false)
      return
    }

    if (wantsPasswordUpdate) {
      if (secureNewPassword.length < 6) {
        setStatus('New password must be at least 6 characters.')
        setStatusType('error')
        setSecureLoading(false)
        return
      }
      if (secureNewPassword !== secureConfirmPassword) {
        setStatus('New password and confirmation do not match.')
        setStatusType('error')
        setSecureLoading(false)
        return
      }
    }

    try {
      const safeCodeResult = await validateSafeCode(secureCode)
      if (!safeCodeResult.valid) {
        const reasonMessage =
          safeCodeResult.reason === 'expired'
            ? 'Safe code expired. Ask admin to generate a new one.'
            : 'Invalid safe code.'
        throw new Error(reasonMessage)
      }

      let emailVerificationRequired = false

      if (wantsEmailUpdate && normalizedEmail !== String(user?.email || '').toLowerCase()) {
        const emailResult = await changeUserEmailWithReauth(secureCurrentPassword, normalizedEmail)
        emailVerificationRequired = Boolean(emailResult?.verificationRequired)
      }

      if (wantsPasswordUpdate) {
        await changeUserPasswordWithReauth(secureCurrentPassword, secureNewPassword)
      }

      if (emailVerificationRequired && wantsPasswordUpdate) {
        setStatus('Password updated. Please verify the new email from your inbox to finish changing login email.')
      } else if (emailVerificationRequired) {
        setStatus('Verification email sent. Please open your inbox and verify the new email to finish the change.')
      } else {
        setStatus('Credentials updated successfully.')
      }
      setStatusType('success')
      setSecureCode('')
      setSecureCurrentPassword('')
      setNewLoginEmail('')
      setSecureNewPassword('')
      setSecureConfirmPassword('')
    } catch (error) {
      setStatus(error?.message || 'Failed to update credentials.')
      setStatusType('error')
    } finally {
      setSecureLoading(false)
    }
  }

  return (
    <ModuleShell title="Profile" description="Personalize your identity across the agency workspace.">
      {profile?.passwordResetRequired || location.state?.forcedCredentialUpdate ? (
        <section className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm font-semibold text-amber-800">Credential update required</p>
          <p className="mt-1 text-xs text-amber-700">
            Your account was created by admin. Please update your login email or password before using other pages.
          </p>
        </section>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <section className="rounded-3xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Preview</p>
          <div className="mt-4 flex flex-col items-center gap-3 text-center">
            {photoURL ? (
              <img
                src={photoURL}
                alt="Profile preview"
                className="h-28 w-28 rounded-full object-cover ring-2 ring-[#8246f6]/20"
              />
            ) : (
              <div className="flex h-28 w-28 items-center justify-center rounded-full bg-slate-100 text-slate-500 ring-2 ring-slate-200">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-10 w-10" aria-hidden="true">
                  <circle cx="12" cy="8" r="3.2" />
                  <path d="M5.5 19.2a6.5 6.5 0 0 1 13 0" />
                </svg>
              </div>
            )}
            <p className="text-lg font-bold text-slate-900">{name || 'Your Name'}</p>
            <p className="max-w-full truncate text-sm text-slate-500">Your profile identity</p>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5">
          <h4 className="font-bold text-slate-900">Edit Profile</h4>
          <p className="mt-1 text-xs text-slate-500">Set your username and profile picture for the control panel and navigation.</p>

          <form onSubmit={onSubmit} className="mt-4 space-y-4">
            <label className="block text-sm font-semibold text-slate-700">
              Username
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Your display name"
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none ring-[#8246f6]/20 focus:ring"
                required
                maxLength={80}
              />
            </label>

            <label className="block text-sm font-semibold text-slate-700">
              Upload Image
              <input
                type="file"
                accept="image/*"
                onChange={onPhotoFileChange}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
            </label>

            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-[#8246f6] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#6f39e7] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? 'Saving...' : 'Save Profile'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setName(profile?.name || '')
                  setPhotoURL(profile?.photoURL || '')
                  setStatus('Reset to current profile values.')
                  setStatusType('neutral')
                }}
                className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-200"
              >
                Reset
              </button>
            </div>
          </form>

          {isAdmin ? (
            <div className="mt-8 rounded-2xl border border-indigo-100 bg-indigo-50 p-4">
              <h4 className="font-bold text-slate-900">Admin Safe Code</h4>
              <p className="mt-1 text-xs text-slate-600">
                Generate a one-time safe code for outsource credential updates. It expires after 10 minutes.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={onGenerateSafeCode}
                  disabled={safeCodeLoading}
                  className="rounded-xl bg-[#8246f6] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#6f39e7] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {safeCodeLoading ? 'Generating...' : 'Generate Safe Code'}
                </button>
                {generatedSafeCode ? (
                  <button
                    type="button"
                    onClick={copyGeneratedSafeCode}
                    className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-200"
                  >
                    Copy Code
                  </button>
                ) : null}
              </div>
              {generatedSafeCode ? (
                <div className="mt-3 rounded-xl border border-indigo-200 bg-white px-3 py-2 text-sm">
                  <p className="font-semibold text-indigo-700">{generatedSafeCode}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Expires: {generatedSafeCodeExpiry ? new Date(generatedSafeCodeExpiry).toLocaleString() : 'N/A'}
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}

          {role === 'outsource' ? (
            <div className="mt-8 border-t pt-6">
              <h4 className="mb-2 font-bold text-slate-900">Secure Credentials Update</h4>
              <p className="mb-4 text-xs text-slate-600">
                Enter the admin safe code first. For security, your current password is still required.
              </p>
              <form onSubmit={onSubmitOutsourceCredentialUpdate} className="max-w-md space-y-4">
                <label className="block text-sm font-semibold text-slate-700">
                  Safe Code
                  <input
                    value={secureCode}
                    onChange={(event) => setSecureCode(event.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none ring-[#8246f6]/20 focus:ring"
                    required
                  />
                </label>

                <label className="block text-sm font-semibold text-slate-700">
                  Current Password
                  <input
                    type="password"
                    value={secureCurrentPassword}
                    onChange={(event) => setSecureCurrentPassword(event.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none ring-[#8246f6]/20 focus:ring"
                    required
                  />
                </label>

                <label className="block text-sm font-semibold text-slate-700">
                  New Login Email (optional)
                  <input
                    type="email"
                    value={newLoginEmail}
                    onChange={(event) => setNewLoginEmail(event.target.value)}
                    placeholder={user?.email || 'name@example.com'}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none ring-[#8246f6]/20 focus:ring"
                  />
                </label>

                <label className="block text-sm font-semibold text-slate-700">
                  New Password (optional)
                  <input
                    type="password"
                    value={secureNewPassword}
                    onChange={(event) => setSecureNewPassword(event.target.value)}
                    minLength={6}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none ring-[#8246f6]/20 focus:ring"
                  />
                </label>

                <label className="block text-sm font-semibold text-slate-700">
                  Confirm New Password
                  <input
                    type="password"
                    value={secureConfirmPassword}
                    onChange={(event) => setSecureConfirmPassword(event.target.value)}
                    minLength={6}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none ring-[#8246f6]/20 focus:ring"
                  />
                </label>

                <button
                  type="submit"
                  disabled={secureLoading}
                  className="rounded-xl bg-[#8246f6] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#6f39e7] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {secureLoading ? 'Updating...' : 'Update Credentials'}
                </button>
              </form>
            </div>
          ) : (
            <div className="mt-8 border-t pt-6">
              <h4 className="mb-2 font-bold text-slate-900">Reset Password</h4>
              <form onSubmit={handlePasswordReset} className="max-w-sm space-y-4">
                <label className="block text-sm font-semibold text-slate-700">
                  Current Password
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(event) => setCurrentPassword(event.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none ring-[#8246f6]/20 focus:ring"
                    required
                  />
                </label>
                <label className="block text-sm font-semibold text-slate-700">
                  New Password
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none ring-[#8246f6]/20 focus:ring"
                    minLength={6}
                    required
                  />
                </label>
                <label className="block text-sm font-semibold text-slate-700">
                  Confirm Password
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none ring-[#8246f6]/20 focus:ring"
                    minLength={6}
                    required
                  />
                </label>
                <button
                  type="submit"
                  disabled={passwordLoading}
                  className="rounded-xl bg-[#8246f6] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#6f39e7] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {passwordLoading ? 'Updating...' : 'Change Password'}
                </button>
              </form>
            </div>
          )}
        </section>
      </div>
    </ModuleShell>
  )
}
