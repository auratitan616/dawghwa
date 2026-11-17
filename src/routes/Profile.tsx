import { useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Download, Plus, RotateCcw, Trash2, Upload } from "lucide-react";
import { Sheet } from "@/components/Layer";
import { toast } from "@/components/Toast";
import { useHead } from "@/lib/seo";
import { updateSettings, useSettings } from "@/lib/settings";
import { createProfile, deleteProfile, switchProfile, unhideTitle, updateProfile, useUser } from "@/lib/store/user";
import { isMemoryStorage } from "@/lib/store/db";
import { downloadJson, exportProfile, importProfile } from "@/lib/store/transfer";
import { resetIntel, useIntel } from "@/lib/intel/runtime";
import { evidence } from "@/lib/intel/learner";
import { featureLabel } from "@/lib/intel/features";
import { titlePath } from "@/lib/titles";
import { isNative, platformName } from "@/lib/platform";

function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map(([v, l]) => (
        <button key={v} role="radio" aria-checked={value === v} onClick={() => onChange(v)}>
          {l}
        </button>
      ))}
    </div>
  );
}

function TasteDna() {
  const s = useIntel();
  const rows = useMemo(() => {
    if (!s) return [];
    return Object.entries(s.affinity)
      .filter(([k, a]) => a.pos >= 2 && a.score > 0 && !k.startsWith("gp:") && !k.startsWith("st:"))
      .sort((a, b) => b[1].score - a[1].score)
      .slice(0, 8);
  }, [s]);
  const max = rows[0]?.[1].score ?? 1;
  const e = s ? evidence(s) : 0;
  return (
    <section className="settings-group" aria-labelledby="dna-h">
      <h2 id="dna-h">Taste profile</h2>
      <p className="muted" style={{ fontSize: "var(--text-sm)", marginBottom: 12 }}>
        Learned on this device from chapters you finish, titles you save, like or ask more of, and the ones you hide. Nothing is sent anywhere.
      </p>
      {rows.length ? (
        <div className="dna">
          {rows.map(([k, a]) => (
            <div key={k} className="dna-row">
              <span>{featureLabel(k)}</span>
              <span className="dna-bar" aria-hidden="true">
                <i style={{ width: `${Math.max(8, (a.score / max) * 100)}%` }} />
              </span>
              <span className="muted" style={{ fontSize: "var(--text-xs)" }}>
                {a.pos} titles
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="muted">Not enough reading yet. Read a few chapters or save some titles and this fills in.</p>
      )}
      <p className="muted" style={{ fontSize: "var(--text-xs)", marginTop: 12 }}>
        Confidence {Math.round(e * 100)}% · {s?.eventCount ?? 0} interactions
      </p>
    </section>
  );
}

export default function Profile() {
  const profile = useUser((s) => s.profile);
  const profiles = useUser((s) => s.profiles);
  const hidden = useUser((s) => s.hidden);
  const titles = useUser((s) => s.titles);
  const settings = useSettings();
  const nav = useNavigate();
  const file = useRef<HTMLInputElement>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [name, setName] = useState("");
  const [confirm, setConfirm] = useState<null | "reset" | "delete">(null);
  useHead({ title: "Profile and settings", noindex: true });
  if (!profile) return null;
  return (
    <div className="page page-narrow">
      <header className="page-head">
        <div>
          <h1>{profile.name}</h1>
          <p className="muted">Profiles keep reading, library and recommendations separate on this device.</p>
        </div>
      </header>
      {isMemoryStorage() && (
        <div className="banner banner-warn" role="status">
          This browser blocks local storage, so nothing will be kept after you close the tab.
        </div>
      )}

      <section className="settings-group" aria-labelledby="profiles-h">
        <h2 id="profiles-h">Profiles</h2>
        <div className="chips">
          {profiles.map((p) => (
            <button key={p.id} className="chip" aria-pressed={p.id === profile.id} onClick={() => void switchProfile(p.id).then(() => toast(`Switched to ${p.name}`))}>
              <span className="avatar" style={{ background: p.color }} aria-hidden="true">
                {p.name.slice(0, 1).toUpperCase()}
              </span>
              {p.name}
            </button>
          ))}
          <button className="chip" onClick={() => setNewOpen(true)}>
            <Plus size={15} /> New profile
          </button>
        </div>
        <label className="field" style={{ marginTop: 16 }}>
          <span>Name</span>
          <input className="input" defaultValue={profile.name} key={profile.id} maxLength={40} onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== profile.name && void updateProfile({ name: e.target.value.trim() })} />
        </label>
        <label className="switch settings-row">
          <span>
            <span className="label">Personalised recommendations</span>
            <span className="hint">Off shows the same catalogue order to everyone.</span>
          </span>
          <input type="checkbox" checked={profile.prefs.personalize !== false} onChange={(e) => void updateProfile({ prefs: { ...profile.prefs, personalize: e.target.checked } })} />
        </label>
        <div className="cluster" style={{ marginTop: 8 }}>
          <button className="btn btn-sm" onClick={() => nav("/welcome?edit=1")}>
            Edit favourite genres
          </button>
          {profiles.length > 1 && (
            <button className="btn btn-sm btn-ghost" onClick={() => setConfirm("delete")}>
              <Trash2 size={15} /> Delete profile
            </button>
          )}
        </div>
      </section>

      <TasteDna />

      <section className="settings-group" aria-labelledby="appearance-h">
        <h2 id="appearance-h">Appearance</h2>
        <div className="settings-row">
          <span className="label">Theme</span>
          <Segmented label="Theme" value={settings.theme} options={[["system", "System"], ["dark", "Dark"], ["light", "Light"]]} onChange={(v) => updateSettings({ theme: v })} />
        </div>
        <div className="settings-row">
          <span className="label">Reduce motion</span>
          <Segmented label="Reduce motion" value={settings.reduceMotion} options={[["system", "System"], ["on", "On"], ["off", "Off"]]} onChange={(v) => updateSettings({ reduceMotion: v })} />
        </div>
      </section>

      <section className="settings-group" aria-labelledby="reading-h">
        <h2 id="reading-h">Reading</h2>
        <div className="settings-row">
          <span className="label">Default layout</span>
          <Segmented label="Default layout" value={settings.readerMode} options={[["auto", "Auto"], ["vertical", "Scroll"], ["single", "Single"], ["double", "Double"]]} onChange={(v) => updateSettings({ readerMode: v })} />
        </div>
        <div className="settings-row">
          <span className="label">Manga direction</span>
          <Segmented label="Manga direction" value={settings.direction} options={[["rtl", "Right to left"], ["ltr", "Left to right"]]} onChange={(v) => updateSettings({ direction: v })} />
        </div>
        <label className="switch settings-row">
          <span>
            <span className="label">Auto-continue to next chapter</span>
          </span>
          <input type="checkbox" checked={settings.autoNext} onChange={(e) => updateSettings({ autoNext: e.target.checked })} />
        </label>
        <label className="switch settings-row">
          <span>
            <span className="label">Data saver</span>
            <span className="hint">Compressed page images where the source offers them.</span>
          </span>
          <input type="checkbox" checked={settings.dataSaver} onChange={(e) => updateSettings({ dataSaver: e.target.checked })} />
        </label>
      </section>

      <section className="settings-group" aria-labelledby="hidden-h">
        <h2 id="hidden-h">Hidden titles</h2>
        {hidden.size ? (
          <div className="list">
            {[...hidden.values()].map((h) => {
              const t = titles.get(h.titleKey);
              return (
                <div key={h.titleKey} className="list-item list-item-plain">
                  <span style={{ flex: 1, minWidth: 0 }}>
                    {t ? <Link to={titlePath(t)}>{t.title}</Link> : h.titleKey}
                    <span className="card-meta">{h.reason === "not_interested" ? "Not interested" : "Hidden"}</span>
                  </span>
                  <button className="btn btn-sm" onClick={() => void unhideTitle(h.titleKey)}>
                    Show again
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="muted">Titles you mark Not interested or hide are listed here.</p>
        )}
      </section>

      <section className="settings-group" aria-labelledby="data-h">
        <h2 id="data-h">Your data</h2>
        <p className="muted" style={{ fontSize: "var(--text-sm)" }}>
          Everything is stored on this device{isNative() ? ` (${platformName()})` : " in this browser"}. Export to back up or move to another device.
        </p>
        <div className="cluster" style={{ marginTop: 12 }}>
          <button className="btn" onClick={() => void exportProfile().then((d) => downloadJson(`dawghwa-${profile.name.replace(/\W+/g, "-").toLowerCase()}.json`, d))}>
            <Download size={16} /> Export profile
          </button>
          <button className="btn" onClick={() => file.current?.click()}>
            <Upload size={16} /> Import
          </button>
          <input
            ref={file}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              try {
                const p = await importProfile(await f.text());
                toast(`Imported as ${p.name}`);
              } catch (err) {
                toast(err instanceof Error ? err.message : "Import failed");
              }
            }}
          />
          <button className="btn btn-ghost" onClick={() => setConfirm("reset")}>
            <RotateCcw size={16} /> Reset recommendations
          </button>
        </div>
      </section>

      <p className="muted" style={{ fontSize: "var(--text-xs)", marginTop: 24 }}>
        <Link to="/about">About Dawghwa and credits</Link>
      </p>

      <Sheet open={newOpen} onClose={() => setNewOpen(false)} title="New profile">
        <form
          className="stack"
          onSubmit={async (e) => {
            e.preventDefault();
            const n = name.trim();
            if (!n) return;
            const p = await createProfile(n);
            await switchProfile(p.id);
            setNewOpen(false);
            setName("");
            nav("/welcome");
          }}
        >
          <label className="field">
            <span>Name</span>
            <input className="input" autoFocus value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
          </label>
          <button className="btn btn-primary" disabled={!name.trim()}>
            Create and switch
          </button>
        </form>
      </Sheet>
      <Sheet open={confirm !== null} onClose={() => setConfirm(null)} title={confirm === "delete" ? `Delete ${profile.name}?` : "Reset recommendations?"}>
        <p className="muted">{confirm === "delete" ? "This permanently removes this profile's library, history and taste profile from this device." : "Your library and history stay. The taste profile starts fresh from now on."}</p>
        <div className="cluster" style={{ marginTop: 16 }}>
          <button
            className="btn btn-primary"
            onClick={async () => {
              if (confirm === "delete") await deleteProfile(profile.id);
              else await resetIntel();
              toast(confirm === "delete" ? "Profile deleted" : "Recommendations reset");
              setConfirm(null);
            }}
          >
            {confirm === "delete" ? "Delete profile" : "Reset"}
          </button>
          <button className="btn" onClick={() => setConfirm(null)}>
            Cancel
          </button>
        </div>
      </Sheet>
    </div>
  );
}
