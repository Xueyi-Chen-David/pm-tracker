import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { auth, signIn, providerIds } from "@/server/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const metadata = { title: "登入 · Project Pulse" };

const hasGoogle = providerIds.includes("google");
const hasDev = providerIds.includes("dev");

async function googleSignIn() {
  "use server";
  await signIn("google", { redirectTo: "/dashboard" });
}

async function devSignIn(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "");
  try {
    await signIn("dev", { email, redirectTo: "/dashboard" });
  } catch (err) {
    if (err instanceof AuthError) {
      redirect("/login?error=CredentialsSignin");
    }
    throw err; // NEXT_REDIRECT 需往外傳
  }
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (session?.user) redirect("/dashboard");
  const { error } = await searchParams;

  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="bg-primary text-primary-foreground mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl text-xl font-bold">
            P
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Project Pulse</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            一眼掌握所有專案進度
          </p>
        </div>

        <div className="bg-card rounded-2xl border p-6 shadow-sm">
          {error && (
            <p className="bg-destructive/10 text-destructive mb-4 rounded-md px-3 py-2 text-sm">
              登入失敗，請再試一次。
            </p>
          )}

          {hasGoogle && (
            <form action={googleSignIn}>
              <Button
                type="submit"
                variant="outline"
                className="h-11 w-full gap-3 text-base"
              >
                <GoogleIcon />
                使用 Google 登入
              </Button>
            </form>
          )}

          {hasGoogle && hasDev && (
            <div className="my-5 flex items-center gap-3">
              <div className="bg-border h-px flex-1" />
              <span className="text-muted-foreground text-xs">或</span>
              <div className="bg-border h-px flex-1" />
            </div>
          )}

          {hasDev && (
            <form action={devSignIn} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="email">開發者快速登入</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  required
                  placeholder="you@example.com"
                  autoComplete="email"
                />
              </div>
              <Button type="submit" className="h-11 w-full">
                以此 Email 登入
              </Button>
              <p className="text-muted-foreground text-xs">
                開發模式：輸入任意 Email 即可建立帳號並登入（正式環境請關閉
                ALLOW_DEV_LOGIN）。
              </p>
            </form>
          )}

          {!hasGoogle && !hasDev && (
            <p className="text-muted-foreground text-center text-sm">
              尚未設定任何登入方式。請在 .env 設定 AUTH_GOOGLE_ID / SECRET，或
              ALLOW_DEV_LOGIN=1。
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.57c2.08-1.92 3.27-4.74 3.27-8.09Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.76c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z"
      />
    </svg>
  );
}
