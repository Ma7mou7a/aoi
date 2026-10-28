import { LinkSignin } from "@/components/LinkSignin";

export const dynamic = "force-dynamic";

/** Opened by scanning the QR code from Settings on a signed-in device. The token is in the #fragment. */
export default function LinkPage() {
  return (
    <div className="space-y-6 text-center">
      <div>
        <p className="font-display text-sm tracking-[0.25em] text-brand uppercase">Another device</p>
        <h1 className="text-5xl sm:text-6xl">Signing you in</h1>
      </div>
      <LinkSignin />
    </div>
  );
}
