import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/UserContext";
import wizardLogo from "@/assets/wizard-logo.webp";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ChevronLeft } from "lucide-react";
import { Capacitor } from "@capacitor/core";

export default function Auth() {
  const [isLogin, setIsLogin] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("mode") !== "signup";
  });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();
  const { userId } = useAuth();

  const isPasswordReset = searchParams.get("reset") === "true";

  useEffect(() => {
    if (userId && !isPasswordReset) navigate("/dashboard");
  }, [userId, isPasswordReset, navigate]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setPasswordError("");
    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        if (password !== confirmPassword) {
          setPasswordError("Passwords do not match");
          setLoading(false);
          return;
        }
        if (password.length < 6) {
          setPasswordError("Password must be at least 6 characters");
          setLoading(false);
          return;
        }
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.protocol === 'file:' || window.location.hostname === 'localhost'
              ? 'weightcutwizard://dashboard'
              : `${window.location.origin}/dashboard`,
          },
        });
        if (error) throw error;
      }
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message || "Authentication failed" });
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth?reset=true`,
      });
      if (error) throw error;
      toast({ title: "Email sent", description: "Check your inbox for the reset link." });
      setShowForgotPassword(false);
      setEmail("");
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message || "Failed to send reset email" });
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError("");
    if (password !== confirmPassword) { setPasswordError("Passwords do not match"); return; }
    if (password.length < 6) { setPasswordError("Must be at least 6 characters"); return; }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast({ title: "Password updated!" });
      setSearchParams({});
      navigate("/dashboard");
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message || "Failed to update password" });
    } finally {
      setLoading(false);
    }
  };

  const handleAppleSignIn = async () => {
    setLoading(true);
    try {
      if (Capacitor.isNativePlatform()) {
        const rawNonce = crypto.randomUUID();
        const encoder = new TextEncoder();
        const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(rawNonce));
        const hashedNonce = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");
        const { SignInWithApple } = await import("@capacitor-community/apple-sign-in");
        const result = await SignInWithApple.authorize({
          clientId: "com.weightcutwizard.app",
          redirectURI: "https://pkubdwmnnsxjjnpjjqqy.supabase.co/auth/v1/callback",
          scopes: "email",
          nonce: hashedNonce,
        });
        const { data: signInData, error } = await supabase.auth.signInWithIdToken({
          provider: "apple",
          token: result.response.identityToken,
          nonce: rawNonce,
        });
        if (error && !signInData?.session) throw error;
      } else {
        const { error } = await supabase.auth.signInWithOAuth({
          provider: "apple",
          options: { redirectTo: `${window.location.origin}/dashboard` },
        });
        if (error) throw error;
      }
    } catch (error: any) {
      const msg = error?.message?.toLowerCase() || "";
      if (msg.includes("cancel") || error?.code === "ERR_CANCELED" || error?.code === 1001) {
        setLoading(false);
        return;
      }
      if (msg.includes("not complete")) {
        toast({ title: "Please try again", description: "Apple Sign-In was interrupted." });
        setLoading(false);
        return;
      }
      toast({ variant: "destructive", title: "Apple Sign-In Failed", description: error.message || "Please try again." });
    } finally {
      setLoading(false);
    }
  };

  const passwordTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (passwordTimerRef.current) clearTimeout(passwordTimerRef.current);
    passwordTimerRef.current = setTimeout(() => {
      if ((!isLogin || isPasswordReset) && confirmPassword && password !== confirmPassword) {
        setPasswordError("Passwords do not match");
      } else if ((!isLogin || isPasswordReset) && confirmPassword && password === confirmPassword) {
        setPasswordError("");
      }
    }, 300);
    return () => { if (passwordTimerRef.current) clearTimeout(passwordTimerRef.current); };
  }, [password, confirmPassword, isLogin, isPasswordReset]);

  const inputClass = "h-[50px] rounded-xl bg-muted/40 dark:bg-white/[0.06] border-border/40 text-foreground placeholder:text-muted-foreground/50 px-4 text-[16px] focus:ring-2 focus:ring-primary/40 focus:border-primary/40 transition-all";
  const errorInputClass = "border-red-500/50 focus:ring-red-500/40";

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Nav bar — iOS style */}
      <div
        className="flex items-center justify-between px-4 shrink-0"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)", paddingBottom: "8px" }}
      >
        <button
          type="button"
          onClick={() => navigate("/")}
          className="flex items-center gap-0.5 min-h-[44px] min-w-[44px] -ml-2 pl-2 pr-3 rounded-full text-primary active:opacity-60 transition-opacity touch-manipulation"
          aria-label="Back"
        >
          <ChevronLeft className="h-5 w-5 shrink-0" strokeWidth={2.5} />
          <span className="text-[17px] font-normal">Back</span>
        </button>
        <ThemeToggle />
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col items-center px-6 overflow-y-auto" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)" }}>
        <div className="w-full max-w-[360px] pt-4">
          {/* Logo + title */}
          <div className="flex flex-col items-center text-center mb-8">
            <img
              src={wizardLogo}
              alt="FightCamp Wizard"
              className="h-16 w-16 object-contain rounded-2xl shadow-lg shadow-primary/10 mb-4"
            />
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              {isPasswordReset ? "New Password" : showForgotPassword ? "Reset Password" : isLogin ? "Welcome Back" : "Create Account"}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {isPasswordReset ? "Choose a strong password" : showForgotPassword ? "We'll send you a reset link" : isLogin ? "Sign in to continue" : "Get started with FightCamp Wizard"}
            </p>
          </div>

          {/* Forms */}
          <div className="space-y-4">
            {isPasswordReset ? (
              <form onSubmit={handlePasswordUpdate} className="space-y-3">
                <Input type="password" placeholder="New password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} className={`${inputClass} ${passwordError ? errorInputClass : ""}`} />
                <Input type="password" placeholder="Confirm password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={6} className={`${inputClass} ${passwordError ? errorInputClass : ""}`} />
                {passwordError && <p className="text-xs text-red-500 text-center">{passwordError}</p>}
                <Button type="submit" disabled={loading} className="w-full h-[50px] rounded-xl text-[16px] font-semibold bg-primary text-primary-foreground active:scale-[0.98] transition-transform">
                  {loading ? "Updating..." : "Update Password"}
                </Button>
              </form>
            ) : showForgotPassword ? (
              <form onSubmit={handleForgotPassword} className="space-y-3">
                <Input type="email" placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} required className={inputClass} autoFocus />
                <Button type="submit" disabled={loading} className="w-full h-[50px] rounded-xl text-[16px] font-semibold bg-primary text-primary-foreground active:scale-[0.98] transition-transform">
                  {loading ? "Sending..." : "Send Reset Link"}
                </Button>
                <button type="button" onClick={() => setShowForgotPassword(false)} className="w-full text-center text-sm text-muted-foreground py-2">Back to Sign In</button>
              </form>
            ) : (
              <form onSubmit={handleAuth} className="space-y-3">
                <Input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required className={inputClass} autoFocus />
                <Input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} className={`${inputClass} ${passwordError ? errorInputClass : ""}`} />
                {!isLogin && (
                  <Input type="password" placeholder="Confirm password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={6} className={`${inputClass} ${passwordError ? errorInputClass : ""}`} />
                )}
                {passwordError && <p className="text-xs text-red-500 text-center">{passwordError}</p>}
                <Button type="submit" disabled={loading} className="w-full h-[50px] rounded-xl text-[16px] font-semibold bg-primary text-primary-foreground active:scale-[0.98] transition-transform">
                  {loading ? "Please wait..." : isLogin ? "Sign In" : "Create Account"}
                </Button>
              </form>
            )}

            {!showForgotPassword && !isPasswordReset && (
              <>
                {/* Divider */}
                <div className="flex items-center gap-3 py-1">
                  <div className="flex-1 h-px bg-border/50" />
                  <span className="text-xs text-muted-foreground">or</span>
                  <div className="flex-1 h-px bg-border/50" />
                </div>

                {/* Apple Sign-In — iOS native style */}
                <button
                  type="button"
                  onClick={handleAppleSignIn}
                  disabled={loading}
                  className="w-full h-[50px] rounded-xl bg-foreground text-background font-semibold text-[16px] flex items-center justify-center gap-2 active:scale-[0.98] transition-transform touch-manipulation disabled:opacity-50"
                >
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.52-3.23 0-1.44.62-2.2.44-3.06-.4C3.79 16.17 4.36 9.51 8.82 9.28c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.3 4.11zM12.03 9.2C11.88 7.16 13.5 5.5 15.42 5.35c.28 2.35-2.14 4.1-3.39 3.85z" />
                  </svg>
                  {isLogin ? "Sign in with Apple" : "Sign up with Apple"}
                </button>
              </>
            )}
          </div>

          {/* Footer links */}
          {!showForgotPassword && !isPasswordReset && (
            <div className="mt-8 space-y-3 text-center">
              {isLogin && (
                <button type="button" onClick={() => setShowForgotPassword(true)} className="text-sm text-muted-foreground">
                  Forgot password?
                </button>
              )}
              <div>
                <button
                  type="button"
                  onClick={() => { setIsLogin(!isLogin); setConfirmPassword(""); setPasswordError(""); setShowForgotPassword(false); }}
                  className="text-sm text-primary font-medium"
                >
                  {isLogin ? "Don't have an account? Sign Up" : "Already have an account? Sign In"}
                </button>
              </div>
            </div>
          )}

          {/* Legal */}
          <div className="flex items-center justify-center gap-2 mt-6 text-[11px] text-muted-foreground/50">
            <Link to="/legal?tab=privacy" className="hover:text-muted-foreground transition-colors">Privacy</Link>
            <span>·</span>
            <Link to="/legal?tab=terms" className="hover:text-muted-foreground transition-colors">Terms</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
