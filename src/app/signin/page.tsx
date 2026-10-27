import Link from "next/link";
import { SigninForm } from "@/components/SigninForm";
import { getCurrentUser } from "@/lib/server/user";

export const dynamic = "force-dynamic";

export default async function SigninPage() {
  const user = await getCurrentUser();
  return (
    <div className="space-y-6 text-center">
      <div>
        <p className="font-display text-sm tracking-[0.25em] text-brand uppercase">Welcome back</p>
        <h1 className="text-5xl sm:text-6xl">Sign in</h1>
        <p className="mx-auto mt-2 max-w-xl text-slate-600 dark:text-slate-300">No email, no password: open your Brain Twin on this browser with your private sign-in key.</p>
      </div>
      {user ? (
        <p className="glass mx-auto max-w-md rounded-2xl p-6">
          You&apos;re already signed in as <b>{user.displayName}</b>. <Link href="/dashboard" className="font-semibold text-brand hover:underline">Open your dashboard</Link>, or sign out in <Link href="/settings" className="text-brand hover:underline">Settings</Link> to switch profiles.
        </p>
      ) : (
        <SigninForm />
      )}
    </div>
  );
}
