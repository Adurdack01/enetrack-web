import { useState } from "react";
import { PlugZap } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { UserProfile } from "@/types/settings";

type AuthMode = "login" | "signup";
type MessageTone = "error" | "success";

type AuthMessage = {
  tone: MessageTone;
  text: string;
};

type SignInPayload = {
  email: string;
  password: string;
};

type SignUpPayload = {
  displayName: string;
  email: string;
  password: string;
};

type AuthResult = {
  ok: boolean;
  message?: string;
};

type Props = {
  registeredEmails: string[];
  onEmailSignIn: (payload: SignInPayload) => AuthResult | Promise<AuthResult>;
  onEmailSignUp: (payload: SignUpPayload) => AuthResult | Promise<AuthResult>;
  onGoogleContinue: (mode: AuthMode) => UserProfile | null | Promise<UserProfile | null>;
  enableGoogleAuth: boolean;
  onSendPasswordReset: (email: string) => AuthResult | Promise<AuthResult>;
};

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export default function AuthScreen({
  registeredEmails,
  onEmailSignIn,
  onEmailSignUp,
  onGoogleContinue,
  enableGoogleAuth,
  onSendPasswordReset,
}: Props) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<AuthMessage | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isLogin = mode === "login";

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setMessage(null);
    setPassword("");
  };

  const handleSignIn = async () => {
    const normalizedEmail = normalizeEmail(email);

    if (!isValidEmail(normalizedEmail)) {
      setMessage({
        tone: "error",
        text: "Please enter a valid email address.",
      });
      return;
    }

    if (!password.trim()) {
      setMessage({ tone: "error", text: "Please enter your password." });
      return;
    }

    setIsSubmitting(true);
    const result = await onEmailSignIn({
      email: normalizedEmail,
      password,
    });
    setIsSubmitting(false);

    if (!result.ok) {
      setMessage({
        tone: "error",
        text: result.message ?? "Unable to sign in with those credentials.",
      });
    }
  };

  const handleSignUp = async () => {
    const normalizedEmail = normalizeEmail(email);

    if (!fullName.trim()) {
      setMessage({ tone: "error", text: "Please enter your full name." });
      return;
    }

    if (!isValidEmail(normalizedEmail)) {
      setMessage({
        tone: "error",
        text: "Please enter a valid email address.",
      });
      return;
    }

    if (
      registeredEmails.some(
        (registeredEmail) => registeredEmail.toLowerCase() === normalizedEmail
      )
    ) {
      setMessage({
        tone: "error",
        text: "This email address already has an account.",
      });
      return;
    }

    if (!password.trim()) {
      setMessage({ tone: "error", text: "Please enter your password." });
      return;
    }

    setIsSubmitting(true);
    const result = await onEmailSignUp({
      displayName: fullName.trim(),
      email: normalizedEmail,
      password,
    });
    setIsSubmitting(false);

    if (!result.ok) {
      setMessage({
        tone: "error",
        text: result.message ?? "Unable to create this account.",
      });
    }
  };

  const handleForgotPassword = async () => {
    const normalizedEmail = normalizeEmail(email);

    if (!isValidEmail(normalizedEmail)) {
      setMessage({
        tone: "error",
        text: "Please enter a valid email address.",
      });
      return;
    }

    setIsSubmitting(true);
    const result = await onSendPasswordReset(normalizedEmail);
    setIsSubmitting(false);

    setMessage({
      tone: result.ok ? "success" : "error",
      text:
        result.message ??
        (result.ok
          ? `Password reset link sent to ${normalizedEmail}.`
          : "Unable to send password reset email."),
    });
  };

  const handleGoogleContinue = async () => {
    setIsSubmitting(true);
    const profile = await onGoogleContinue(mode);
    setIsSubmitting(false);

    if (!profile) {
      setMessage({
        tone: "error",
        text: "Unable to continue with Google. Please try again.",
      });
      return;
    }

    setFullName(profile.displayName);
    setEmail(profile.email);
    setMessage(null);
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-5 py-8 text-slate-950">
      <div className="w-full max-w-sm">
        <div className="text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 shadow-sm">
            <PlugZap className="h-8 w-8" />
          </div>
          <h1 className="mt-5 text-2xl font-bold">EnerTrack</h1>
          <p className="mt-2 text-sm text-slate-500">
            Smart plug energy monitoring
          </p>
        </div>

        <section className="mt-8 rounded-[28px] border border-slate-200 bg-slate-50 p-5 shadow-sm">
          <h2 className="text-xl font-bold">
            {isLogin ? "Welcome back" : "Create account"}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {isLogin
              ? "Sign in to continue to your dashboard."
              : "Set up your account to start monitoring."}
          </p>

          <div className="mt-5 space-y-4">
            {!isLogin && (
              <AuthField label="Full Name">
                <input
                  value={fullName}
                  onChange={(event) => {
                    setFullName(event.target.value);
                    setMessage(null);
                  }}
                  placeholder="Enter your full name"
                  className="h-12 w-full rounded-full border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none transition focus:border-emerald-300 focus:bg-blue-50"
                />
              </AuthField>
            )}

            <AuthField label="Email">
              <input
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setMessage(null);
                }}
                placeholder="Enter your email"
                inputMode="email"
                className="h-12 w-full rounded-full border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none transition focus:border-emerald-300 focus:bg-blue-50"
              />
            </AuthField>

            <AuthField label="Password">
              <input
                type="password"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  setMessage(null);
                }}
                placeholder="Enter your password"
                className="h-12 w-full rounded-full border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none transition focus:border-emerald-300 focus:bg-blue-50"
              />
            </AuthField>
          </div>

          {isLogin && (
            <button
              type="button"
              onClick={handleForgotPassword}
              disabled={isSubmitting}
              className="mt-3 block w-full text-right text-xs font-bold text-emerald-600"
            >
              Forgot password?
            </button>
          )}

          {message && (
            <div
              className={`mt-4 rounded-2xl px-4 py-3 text-sm ${
                message.tone === "error"
                  ? "bg-red-50 text-red-600"
                  : "bg-emerald-50 text-emerald-700"
              }`}
            >
              {message.text}
            </div>
          )}

          <Button
            type="button"
            onClick={isLogin ? handleSignIn : handleSignUp}
            disabled={isSubmitting}
            className="mt-4 h-12 w-full rounded-full bg-[#1d1d1b] text-white hover:bg-slate-800"
          >
            {isSubmitting ? "Please wait..." : isLogin ? "Sign In" : "Create Account"}
          </Button>

          {enableGoogleAuth && (
            <>
              <div className="my-5 flex items-center gap-3 text-xs text-slate-400">
                <span className="h-px flex-1 bg-slate-200" />
                or
                <span className="h-px flex-1 bg-slate-200" />
              </div>

              <Button
                type="button"
                variant="outline"
                onClick={handleGoogleContinue}
                disabled={isSubmitting}
                className="h-12 w-full rounded-full border-slate-200 bg-white text-slate-950 hover:bg-slate-50"
              >
                Continue with Google
              </Button>
            </>
          )}
        </section>

        <p className="mt-10 text-center text-sm text-slate-500">
          {isLogin ? "No account yet? " : "Already have an account? "}
          <button
            type="button"
            onClick={() => switchMode(isLogin ? "signup" : "login")}
            className="font-medium text-slate-700"
          >
            {isLogin ? "Create an account" : "Sign in"}
          </button>
        </p>
      </div>
    </main>
  );
}

function AuthField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-slate-700">
        {label}
      </span>
      {children}
    </label>
  );
}
