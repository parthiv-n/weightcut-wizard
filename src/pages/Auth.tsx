import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import wizardLogo from "@/assets/wizard-logo.png";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ChevronLeft } from "lucide-react";

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        navigate("/dashboard");
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        navigate("/dashboard");
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setPasswordError("");

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
      } else {
        // Validate password match before sign up
        if (password !== confirmPassword) {
          setPasswordError("Passwords do not match");
          toast({
            variant: "destructive",
            title: "Password Mismatch",
            description: "Please ensure both passwords match.",
          });
          setLoading(false);
          return;
        }

        // Validate password length
        if (password.length < 6) {
          setPasswordError("Password must be at least 6 characters long");
          toast({
            variant: "destructive",
            title: "Invalid Password",
            description: "Password must be at least 6 characters long.",
          });
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
        toast({
          title: "Account created!",
          description: "Please check your email to verify your account.",
        });
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "An error occurred during authentication",
      });
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
      toast({
        title: "Password reset email sent!",
        description: "Check your inbox for instructions to reset your password.",
      });
      setShowForgotPassword(false);
      setEmail("");
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to send reset email. Please try again.",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleToggleMode = () => {
    setIsLogin(!isLogin);
    setConfirmPassword("");
    setPasswordError("");
    setShowForgotPassword(false);
  };

  const handleToggleForgotPassword = () => {
    setShowForgotPassword(!showForgotPassword);
    setPasswordError("");
    if (!showForgotPassword) {
      setPassword("");
    }
  };

  // Real-time password match validation
  useEffect(() => {
    if (!isLogin && confirmPassword && password !== confirmPassword) {
      setPasswordError("Passwords do not match");
    } else if (!isLogin && confirmPassword && password === confirmPassword) {
      setPasswordError("");
    }
  }, [password, confirmPassword, isLogin]);

  return (
    <div className="min-h-screen bg-background dark:bg-gradient-to-br dark:from-[#120024] dark:via-[#05000f] dark:to-[#180636] text-foreground flex flex-col items-center justify-center p-6 relative overflow-hidden">
      <div className="fixed top-[max(1rem,env(safe-area-inset-top))] left-[max(1rem,env(safe-area-inset-left))] right-[max(1rem,env(safe-area-inset-right))] z-50 flex items-center justify-between px-1">
        <button
          type="button"
          onClick={() => navigate("/")}
          className="flex items-center gap-1 min-h-[44px] min-w-[44px] -ml-2 pl-2 pr-3 rounded-full text-foreground hover:bg-black/5 dark:hover:bg-white/10 active:scale-[0.97] transition-all duration-200 touch-manipulation"
          aria-label="Back to home"
        >
          <ChevronLeft className="h-6 w-6 shrink-0" strokeWidth={2.25} />
          <span className="text-[17px] font-medium">Back</span>
        </button>
        <ThemeToggle />
      </div>
      {/* Subtle background orbs */}
      <div className="absolute top-[-20%] left-[-10%] w-[400px] h-[400px] bg-primary/20 dark:bg-primary/20 rounded-full blur-[120px] pointer-events-none opacity-30 dark:opacity-20" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[300px] h-[300px] bg-secondary/15 dark:bg-secondary/20 rounded-full blur-[100px] pointer-events-none opacity-40 dark:opacity-10" />

      <div className="w-full max-w-[380px] z-10">
        {/* Glass card container */}
        <div className="glass-card relative rounded-3xl border border-border dark:border-white/10 bg-gradient-to-br from-primary/5 via-background/60 to-secondary/5 dark:from-primary/10 dark:via-background/50 dark:to-secondary/10 shadow-xl dark:shadow-[0_0_60px_rgba(168,85,247,0.25)] backdrop-blur-2xl overflow-hidden">
          <div className="p-8 flex flex-col gap-6">
            {/* Header */}
            <div className="flex flex-col items-center text-center space-y-3">
              <div className="relative">
                <img
                  src={wizardLogo}
                  alt="Weight Cut Wizard"
                  className="h-20 w-20 object-contain drop-shadow-xl ring-2 ring-primary/30 rounded-2xl bg-background/50 dark:bg-background/30 p-1"
                />
              </div>
              <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                Weight Cut Wizard
              </h1>
              <p className="text-muted-foreground text-base font-medium">
                {showForgotPassword
                  ? "Reset Password"
                  : isLogin
                    ? "Welcome Back"
                    : "Start Your Journey"}
              </p>
            </div>

            {/* Form */}
            <div className="w-full space-y-4">
              {showForgotPassword ? (
                <form onSubmit={handleForgotPassword} className="space-y-4">
                  <div className="space-y-2">
                    <Input
                      id="reset-email"
                      type="email"
                      placeholder="Email Address"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="h-12 rounded-full bg-card border-border text-foreground placeholder:text-muted-foreground px-5 text-base focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all font-medium"
                    />
                  </div>
                  <Button
                    type="submit"
                    className="w-full h-12 rounded-full text-base font-bold bg-gradient-to-r from-primary to-secondary text-primary-foreground shadow-lg shadow-primary/25 hover:opacity-90 transition-opacity active:scale-[0.98]"
                    disabled={loading}
                  >
                    {loading ? "Sending..." : "Send Reset Link"}
                  </Button>
                  <button
                    type="button"
                    onClick={handleToggleForgotPassword}
                    className="w-full text-center text-sm font-medium text-muted-foreground hover:text-foreground transition-colors py-2"
                  >
                    Back to Sign In
                  </button>
                </form>
              ) : (
                <form onSubmit={handleAuth} className="space-y-4">
                  <div className="space-y-3">
                    <Input
                      id="email"
                      type="email"
                      placeholder="Email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="h-12 rounded-full bg-card border-border text-foreground placeholder:text-muted-foreground px-5 text-base focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all font-medium"
                    />
                    <Input
                      id="password"
                      type="password"
                      placeholder="Password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={6}
                      className={`h-12 rounded-full bg-card border-border text-foreground placeholder:text-muted-foreground px-5 text-base focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all font-medium ${passwordError ? "border-red-500 focus:ring-red-500/50" : ""
                        }`}
                    />
                    {!isLogin && (
                      <Input
                        id="confirmPassword"
                        type="password"
                        placeholder="Confirm Password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                        minLength={6}
                        className={`h-12 rounded-full bg-card border-border text-foreground placeholder:text-muted-foreground px-5 text-base focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all font-medium ${passwordError ? "border-red-500 focus:ring-red-500/50" : ""
                          }`}
                      />
                    )}
                    {passwordError && (
                      <p className="text-xs text-red-500 text-center px-4 font-medium">{passwordError}</p>
                    )}
                  </div>

                  <div className="pt-1">
                    <Button
                      type="submit"
                      className="w-full h-12 rounded-full text-base font-bold bg-gradient-to-r from-primary to-secondary text-primary-foreground shadow-lg shadow-primary/25 hover:opacity-90 transition-opacity active:scale-[0.98]"
                      disabled={loading}
                    >
                      {loading ? "Please wait..." : isLogin ? "Sign In" : "Sign Up"}
                    </Button>
                  </div>
                </form>
              )}

              {!showForgotPassword && (
                <div className="space-y-4 text-center mt-6">
                  {isLogin && (
                    <button
                      type="button"
                      onClick={handleToggleForgotPassword}
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Forgot your password?
                    </button>
                  )}
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={handleToggleMode}
                      className="text-primary font-medium hover:text-primary/80 transition-colors text-base"
                    >
                      {isLogin ? "New here? Create Account" : "Have an account? Sign In"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}