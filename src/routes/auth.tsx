import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
});

// Supabase requires an email, so we synthesize an ASCII-safe one from the username.
// Usernames are unique in `profiles`, so this mapping is 1:1. Korean/Unicode IDs
// are hex-encoded so they fit RFC-valid local parts.
const EMAIL_DOMAIN = "ripple.local";
const toEmail = (username: string) => {
  const clean = username.trim().toLowerCase();
  if (clean.includes("@")) return clean;
  const isAscii = /^[a-z0-9_]+$/.test(clean);
  if (isAscii) return `${clean}@${EMAIL_DOMAIN}`;
  const bytes = new TextEncoder().encode(clean);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `u_${hex}@${EMAIL_DOMAIN}`;
};
const normalizeUsername = (raw: string) => raw.trim().replace(/^@/, "").toLowerCase();
// Allow lowercase letters, digits, underscore, and Korean (Hangul syllables + jamo).
const USERNAME_RE = /^[a-z0-9_\uAC00-\uD7A3\u1100-\u11FF\u3130-\u318F]+$/;
const usernameLength = (s: string) => [...s].length;
const stretchPassword = (pw: string) => (pw.length < 6 ? `${pw}_stretch` : pw);

function AuthPage() {
  const navigate = useNavigate();
  const [mounted, setMounted] = useState(false);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        navigate({ to: "/chats", replace: true });
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user || event === "SIGNED_IN") {
        navigate({ to: "/chats", replace: true });
        if (typeof window !== "undefined" && window.location.pathname === "/auth") {
          window.location.href = "/chats";
        }
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [navigate]);

  if (!mounted) {
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const rawInput = username.trim();
    if (!rawInput) {
      toast.error("ID 또는 이메일을 입력해 주세요.");
      return;
    }
    if (password.length < 4) {
      toast.error("비밀번호는 4자 이상이어야 해요.");
      return;
    }

    const isEmailInput = rawInput.includes("@");
    const uname = normalizeUsername(rawInput);

    if (!isEmailInput) {
      const len = usernameLength(uname);
      if (len < 2 || len > 20 || !USERNAME_RE.test(uname)) {
        toast.error("ID는 2~20자의 한글, 영문 소문자, 숫자, _ 만 가능해요.");
        return;
      }
    }

    setLoading(true);
    try {
      const targetEmail = isEmailInput ? rawInput : toEmail(uname);
      const targetPassword = stretchPassword(password);

      if (mode === "signup") {
        if (!isEmailInput) {
          const { data: existing, error: chkErr } = await supabase
            .from("profiles")
            .select("id")
            .eq("username", uname)
            .maybeSingle();
          if (chkErr) throw chkErr;
          if (existing) throw new Error("이미 사용 중인 ID예요.");
        }

        const nameToUse = displayName.trim() || (isEmailInput ? rawInput.split("@")[0] : uname);
        const { data: signUpData, error } = await supabase.auth.signUp({
          email: targetEmail,
          password: targetPassword,
          options: {
            data: {
              display_name: nameToUse,
              username: isEmailInput ? rawInput.split("@")[0] : uname,
              name: nameToUse,
            },
          },
        });
        if (error) throw error;

        if (signUpData?.user?.id) {
          const userId = signUpData.user.id;
          await supabase.from("profiles").upsert(
            {
              id: userId,
              username: isEmailInput ? rawInput.split("@")[0] : uname,
              display_name: nameToUse,
            },
            { onConflict: "id" }
          );
        }
        toast.success("가입 완료! 로그인되었어요.");
      } else {
        let res = await supabase.auth.signInWithPassword({
          email: targetEmail,
          password: targetPassword,
        });

        if (res.error && password.length >= 6) {
          const res2 = await supabase.auth.signInWithPassword({
            email: targetEmail,
            password: password,
          });
          if (!res2.error) res = res2;
        }

        if (res.error && isEmailInput) {
          const res3 = await supabase.auth.signInWithPassword({
            email: toEmail(rawInput.split("@")[0]),
            password: targetPassword,
          });
          if (!res3.error) res = res3;
        }

        if (res.error) throw new Error("ID 또는 비밀번호가 올바르지 않아요.");
        toast.success("로그인에 성공했습니다.");
      }
      navigate({ to: "/chats", replace: true });
      if (typeof window !== "undefined") {
        window.location.href = "/chats";
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "문제가 발생했어요.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-secondary/40 px-4 pt-safe pb-safe">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center">
          <div className="flex h-24 w-24 items-center justify-center rounded-full bg-[#DCFCE7] shadow-lg ring-4 ring-[#86EFAC]/40">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-[#166534] text-white font-black text-2xl tracking-wider shadow-inner select-none">
              LHJ
            </div>
          </div>
          <h1 className="mt-4 text-3xl font-bold tracking-tight text-[#166534]">LHJOON</h1>
          <p className="text-sm text-muted-foreground">친구들과 실시간 채팅</p>
        </div>

        <div className="rounded-3xl bg-card p-6 shadow-sm">
          <div className="mb-5 flex rounded-full bg-secondary p-1">
            <button
              type="button"
              onClick={() => setMode("signin")}
              className={`flex-1 rounded-full py-1.5 text-sm font-medium transition ${mode === "signin" ? "bg-card shadow-sm" : "text-muted-foreground"}`}
            >
              로그인
            </button>
            <button
              type="button"
              onClick={() => setMode("signup")}
              className={`flex-1 rounded-full py-1.5 text-sm font-medium transition ${mode === "signup" ? "bg-card shadow-sm" : "text-muted-foreground"}`}
            >
              회원가입
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            {mode === "signup" && (
              <input
                type="text"
                placeholder="표시 이름 (선택)"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={60}
                className="w-full rounded-xl border border-input bg-background px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            )}
            <input
              type="text"
              required
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="ID 또는 이메일"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-xl border border-input bg-background px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <input
              type="password"
              required
              minLength={4}
              placeholder="비밀번호 (4자 이상)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-input bg-background px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-primary py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {loading ? "처리 중..." : mode === "signin" ? "로그인" : "가입하기"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

