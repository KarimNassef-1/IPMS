import LoginForm from '../components/auth/LoginForm'
import { useAuth } from '../hooks/useAuth'

export default function LoginPage() {
  const { firebaseReady, firebaseError } = useAuth()
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID

  return (
    <div className="relative flex h-[100dvh] items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_0%_0%,_#f4ecff_0%,_#edf4ff_48%,_#f8fafc_100%)] p-3 sm:p-4 lg:p-6">
      <div className="ip-auth-orb ip-auth-orb--one" aria-hidden="true" />
      <div className="ip-auth-orb ip-auth-orb--two" aria-hidden="true" />
      <div className="ip-auth-orb ip-auth-orb--three" aria-hidden="true" />

      <div className="ip-auth-card relative h-full w-full max-w-6xl overflow-hidden rounded-[2rem] border border-white/40 bg-white/70 shadow-[0_30px_90px_-35px_rgba(130,70,246,0.55)] backdrop-blur-2xl lg:h-[min(90dvh,860px)]">
        <div className="grid h-full lg:grid-cols-[1.15fr_1fr]">
          <section className="relative hidden overflow-hidden bg-gradient-to-br from-[#140b28] via-[#2a1452] to-[#4a1f84] p-8 text-white lg:block lg:border-r lg:border-white/20 lg:p-10 xl:p-12">
            <div className="ip-auth-glow" aria-hidden="true" />
            <img src="/ip-badge.png" alt="Infinite Pixels" className="relative z-10 h-auto w-44 max-w-full object-contain sm:w-52" />
            <p className="relative z-10 mt-8 text-[11px] font-semibold uppercase tracking-[0.24em] text-fuchsia-100/80">Agency Operating System</p>
            <h1 className="relative z-10 mt-3 max-w-md text-3xl font-black leading-tight tracking-tight text-white sm:text-4xl">
              Premium command center for high-end client delivery
            </h1>
            <p className="relative z-10 mt-4 max-w-md text-sm leading-relaxed text-fuchsia-100/85 sm:text-[15px]">
              Keep projects, finances, and execution synced in a single intelligent workflow designed for speed, clarity, and elite presentation.
            </p>

            <div className="relative z-10 mt-8 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/20 bg-white/10 px-4 py-3 backdrop-blur">
                <p className="text-xs font-semibold uppercase tracking-[0.17em] text-fuchsia-100/80">Performance</p>
                <p className="mt-1 text-lg font-black text-white">Real-time sync</p>
              </div>
              <div className="rounded-2xl border border-white/20 bg-white/10 px-4 py-3 backdrop-blur">
                <p className="text-xs font-semibold uppercase tracking-[0.17em] text-fuchsia-100/80">Control</p>
                <p className="mt-1 text-lg font-black text-white">Role-secured access</p>
              </div>
            </div>

            <div className="relative z-10 mt-8 rounded-2xl border border-white/20 bg-black/20 p-4 backdrop-blur">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-fuchsia-100/80">Environment</p>
              {firebaseReady ? (
                <div className="mt-2">
                  <p className="text-sm font-semibold text-emerald-200">Firebase live mode is active</p>
                  <p className="mt-1 text-xs text-fuchsia-100/80">Project: {projectId}</p>
                </div>
              ) : (
                <div className="mt-2">
                  <p className="text-sm font-semibold text-amber-200">Firebase is not ready</p>
                  {firebaseError ? <p className="mt-1 text-xs text-amber-100/80">Reason: {firebaseError}</p> : null}
                </div>
              )}
            </div>
          </section>

          <section className="relative flex h-full items-center p-5 sm:p-7 lg:p-10 xl:p-12">
            <div className="mx-auto w-full max-w-md">
              <img src="/ip-badge.png" alt="Infinite Pixels" className="h-auto w-36 max-w-full object-contain lg:hidden" />
              <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#8246f6] sm:text-xs">Welcome Back</p>
              <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">Sign in to continue</h2>
              <p className="mt-1 text-xs text-slate-600 sm:mt-2 sm:text-sm">Access your workspace with a secure, frictionless login experience.</p>

              <div className="mt-5 sm:mt-6">
                <LoginForm />
              </div>

              <div className="mt-4 rounded-xl border border-slate-200/80 bg-white/70 px-3 py-2 text-[11px] text-slate-600 sm:text-xs lg:hidden">
                {firebaseReady ? (
                  <p>
                    <span className="font-semibold text-emerald-700">Live:</span> {projectId}
                  </p>
                ) : (
                  <p>
                    <span className="font-semibold text-amber-700">Firebase not ready.</span>
                    {firebaseError ? ` ${firebaseError}` : ''}
                  </p>
                )}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
