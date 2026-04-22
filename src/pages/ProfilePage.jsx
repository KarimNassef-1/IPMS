import { useEffect, useState } from 'react'
import ModuleShell from '../components/layout/ModuleShell'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Failed to read selected image file.'))
    reader.readAsDataURL(file)
  })
}

export default function ProfilePage() {
  const { user, profile, updateProfileSettings } = useAuth()
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

  // Password reset state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);

  async function handlePasswordReset(e) {
    e.preventDefault();
    setPasswordLoading(true);
    setStatus('');
    setStatusType('neutral');
    if (!currentPassword) {
      setStatus('Please enter your current password.');
      setStatusType('error');
      setPasswordLoading(false);
      return;
    }
    if (!newPassword || newPassword.length < 6) {
      setStatus('Password must be at least 6 characters.');
      setStatusType('error');
      setPasswordLoading(false);
      return;
    }
    if (newPassword !== confirmPassword) {
      setStatus('Passwords do not match.');
      setStatusType('error');
      setPasswordLoading(false);
      return;
    }
    try {
      const { changeUserPasswordWithReauth } = await import('../services/changePasswordWithReauth');
      await changeUserPasswordWithReauth(currentPassword, newPassword);
      setStatus('Password updated successfully.');
      setStatusType('success');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error) {
      setStatus(error?.message || 'Failed to update password.');
      setStatusType('error');
    } finally {
      setPasswordLoading(false);
    }
  }

  return (
    <ModuleShell title="Profile" description="Personalize your identity across the agency workspace.">
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
              Profile Picture URL (optional)
              <input
                value={photoURL}
                onChange={(event) => setPhotoURL(event.target.value)}
                placeholder="https://... or data:image/..."
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none ring-[#8246f6]/20 focus:ring"
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

          {/* Password Reset Section */}
          <div className="mt-8 border-t pt-6">
            <h4 className="font-bold text-slate-900 mb-2">Reset Password</h4>
            <form onSubmit={handlePasswordReset} className="space-y-4 max-w-sm">
              <label className="block text-sm font-semibold text-slate-700">
                Current Password
                <input
                  type="password"
                  value={currentPassword}
                  onChange={e => setCurrentPassword(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none ring-[#8246f6]/20 focus:ring"
                  required
                />
              </label>
              <label className="block text-sm font-semibold text-slate-700">
                New Password
                <input
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
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
                  onChange={e => setConfirmPassword(e.target.value)}
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
        </section>
      </div>
    </ModuleShell>
  )
}
