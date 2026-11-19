import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ChevronLeft, Lock, Plus } from "lucide-react";
import { MascotSays } from "./Mascot";
import { ProfileAvatar } from "./ProfileAvatar";
import { createProfile, deleteProfile, getUser, switchProfile, useUser } from "@/lib/store/user";
import { isChooser, isValidPin, unlock, verifyPin } from "@/lib/store/accounts";
import type { ProfileRecord } from "@/lib/store/db";
import { useHead } from "@/lib/seo";

/**
 * "Who's reading?" (D4, D29). Shown instead of the app when the active profile has a PIN
 * that hasn't been entered this session, or after Sign out. Nothing here is a network login.
 */
export function SignIn() {
  const profiles = useUser((s) => s.profiles);
  const active = useUser((s) => s.profile);
  const nav = useNavigate();
  const loc = useLocation();
  const [picked, setPicked] = useState<ProfileRecord | null>(active?.pin && !isChooser() ? active : null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useHead({ title: "Who's reading?", noindex: true });

  const enter = async (p: ProfileRecord) => {
    setBusy(true);
    const prev = getUser();
    // a never-used blank profile (first run, then "Sign in") is tidied away
    const blank = prev.profile && prev.profile.id !== p.id && !prev.profile.onboarded && !prev.events.length && !prev.library.size ? prev.profile.id : null;
    if (p.id !== active?.id) await switchProfile(p.id);
    if (blank) await deleteProfile(blank).catch(() => undefined);
    unlock(p.id);
    setBusy(false);
    if (loc.pathname === "/welcome" && p.onboarded) nav("/", { replace: true });
  };
  const choose = (p: ProfileRecord) => {
    setError("");
    setPin("");
    if (p.pin) setPicked(p);
    else void enter(p);
  };
  const submit = async () => {
    if (!picked) return;
    if (!(await verifyPin(picked, pin))) {
      setError("That PIN doesn't match. Try again.");
      setPin("");
      return;
    }
    await enter(picked);
  };

  return (
    <div className="signin">
      {picked ? (
        <form
          className="signin-card"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <button type="button" className="icon-btn signin-back" onClick={() => setPicked(null)} aria-label="Choose another reader">
            <ChevronLeft size={22} />
          </button>
          <ProfileAvatar profile={picked} size={88} />
          <h1>Hi again, {picked.name}</h1>
          <label className="field signin-pin">
            <span>Enter your 4-digit PIN</span>
            <input
              className="input"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              pattern="\d{4}"
              maxLength={4}
              autoFocus
              value={pin}
              aria-invalid={Boolean(error) || undefined}
              aria-describedby="pin-msg"
              onChange={(e) => {
                setError("");
                setPin(e.target.value.replace(/\D/g, "").slice(0, 4));
              }}
            />
          </label>
          <p id="pin-msg" className={error ? "signin-error" : "muted signin-note"} role={error ? "alert" : undefined}>
            {error || "A PIN keeps other people on this device out of your shelf. It isn't encryption."}
          </p>
          <button className="btn btn-primary btn-lg" disabled={!isValidPin(pin) || busy}>
            Sign in
          </button>
        </form>
      ) : (
        <div className="signin-card">
          <MascotSays size={104} pose="welcome">
            Welcome back! Who's reading today?
          </MascotSays>
          <ul className="signin-list">
            {profiles.map((p) => (
              <li key={p.id}>
                <button className="signin-reader" onClick={() => choose(p)} disabled={busy}>
                  <ProfileAvatar profile={p} size={48} />
                  <span className="signin-name">{p.name}</span>
                  {p.pin && <Lock size={16} aria-label="PIN protected" />}
                </button>
              </li>
            ))}
          </ul>
          <button
            className="btn"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const p = await createProfile("Reader");
              await switchProfile(p.id);
              unlock(p.id);
              nav("/welcome?new=1", { replace: true });
            }}
          >
            <Plus size={16} aria-hidden="true" /> New reader
          </button>
        </div>
      )}
    </div>
  );
}
