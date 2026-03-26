import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type { Client } from "./backend.d";
import { useActor } from "./hooks/useActor";
import { useInternetIdentity } from "./hooks/useInternetIdentity";

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
function today() {
  return new Date().toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const STATUSES = [
  { key: "new", label: "New", color: "#6b7a99" },
  { key: "letter_ready", label: "Letter Ready", color: "#818cf8" },
  { key: "sent", label: "Sent", color: "#4a8af4" },
  { key: "waiting", label: "Waiting", color: "#f0b429" },
  { key: "resolved", label: "Resolved", color: "#2dd4a0" },
  { key: "denied", label: "Denied", color: "#f04848" },
];

function statusColor(s: string) {
  return STATUSES.find((x) => x.key === s)?.color || "#6b7a99";
}
function statusLabel(s: string) {
  return STATUSES.find((x) => x.key === s)?.label || "New";
}

const VENICE_API_KEY =
  "VENICE_INFERENCE_KEY_xOWSP7r5Mt5WphJCBAxkxL1laYw4ZzClXHnWz_eW7R";

const SYS = `You are an expert consumer rights advocate specializing in FCRA disputes. Read the ChexSystems Consumer Disclosure report below and identify every negative mark.

For EACH negative mark, write a separate formal dispute letter addressed to:
ChexSystems, Inc.
Attn: Consumer Relations
7805 Hudson Road, Suite 100
Woodbury, MN 55125

Each letter must:
- Be written from the client using their real name and details
- Reference FCRA Section 611 (15 U.S.C. 1681i)
- Include the exact bank name, date, reason, amount, and account number from the report
- Dispute the accuracy and request investigation within 30 days
- State unverified items must be removed per FCRA 611(a)(5)(A)
- Request an updated consumer disclosure report
- Include client name, SSN last 4, and date of birth for identification
- Note Certified Mail with Return Receipt Requested
- List enclosures: photo ID, proof of address, ChexSystems report

Separate each letter with:
========================================

Write ONLY the letters. No explanations. No markdown.`;

async function generateLetter(model: string, client: Client) {
  const r = await fetch("https://api.venice.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${VENICE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: model || "llama-3.3-70b-e2ee",
      messages: [
        { role: "system", content: SYS },
        {
          role: "user",
          content: `Client: ${client.name}\nAddress: ${client.address}, ${client.csz}\nSSN last 4: ${client.ssn}\nDOB: ${client.dob}\n\nChexSystems Report:\n\n${client.report}`,
        },
      ],
      max_tokens: 4000,
      temperature: 0.3,
      venice_parameters: { include_venice_system_prompt: false },
    }),
  });
  if (!r.ok) throw new Error(await r.text().then((t) => t.slice(0, 200)));
  const d = await r.json();
  if (d.error) throw new Error(d.error.message);
  return d.choices?.[0]?.message?.content || "";
}

// Colors
const bg = "#060810";
const sf = "#0b0e17";
const cd = "#0f1220";
const bd = "#181d30";
const bl = "#4a8af4";
const tx = "#c8d0df";
const sb = "#53627e";
const dm = "#2a3148";

const I: React.CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: 8,
  border: `1px solid ${bd}`,
  background: sf,
  color: tx,
  fontFamily: "var(--m)",
  fontSize: 13,
  outline: "none",
};
const L: React.CSSProperties = {
  fontFamily: "var(--m)",
  fontSize: 11,
  color: sb,
  display: "block",
  marginBottom: 4,
};
const Btn = (c: string, disabled: boolean): React.CSSProperties => ({
  width: "100%",
  padding: "13px",
  borderRadius: 10,
  border: "none",
  background: disabled ? dm : c,
  color: disabled ? sb : "#fff",
  fontFamily: "var(--h)",
  fontSize: 14,
  fontWeight: 600,
  cursor: disabled ? "not-allowed" : "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
});

export default function App() {
  const { identity, login, clear, loginStatus, isInitializing } =
    useInternetIdentity();
  const queryClient = useQueryClient();
  const { actor, isFetching: actorFetching } = useActor();
  const isAuthenticated = !!identity;

  const [page, setPage] = useState("home");
  const [clients, setClients] = useState<Client[]>([]);
  const [ready, setReady] = useState(false);
  const [sel, setSel] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [savedState, setSavedState] = useState<"" | "saving" | "ok" | "err">(
    "",
  );
  const [model, setModel] = useState("llama-3.3-70b-e2ee");
  const [form, setForm] = useState<Partial<Client>>({});
  const [draft, setDraft] = useState<Client | null>(null);
  const _saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // keep a ref so persist() can diff against latest clients
  const clientsRef = useRef<Client[]>([]);

  useEffect(() => {
    clientsRef.current = clients;
  }, [clients]);

  // Initialize draft when navigating to a client detail
  useEffect(() => {
    const found = clientsRef.current.find((c) => c.id === sel);
    if (found) setDraft({ ...found });
  }, [sel]);

  // If auth is done initializing and user is not logged in, show login screen
  useEffect(() => {
    if (!isInitializing && !isAuthenticated) setReady(true);
  }, [isInitializing, isAuthenticated]);

  // Load data on mount when actor is ready and authenticated
  useEffect(() => {
    if (!actor || actorFetching || !isAuthenticated) return;
    let cancelled = false;
    (async () => {
      try {
        const [c, m] = await Promise.all([
          actor.getClients(),
          actor.getModel(),
        ]);
        if (!cancelled) {
          setClients(c);
          if (m) setModel(m);
          setReady(true);
        }
      } catch {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [actor, actorFetching, isAuthenticated]);

  const flash = (ok: boolean) => {
    setSavedState(ok ? "ok" : "err");
    if (ok) setTimeout(() => setSavedState(""), 1500);
  };

  const persist = async (next: Client[]) => {
    setClients(next);
    if (!actor) return;
    setSavedState("saving");
    try {
      const prev = clientsRef.current;
      const changed = next.filter((n) => {
        const old = prev.find((c) => c.id === n.id);
        return !old || JSON.stringify(old) !== JSON.stringify(n);
      });
      await Promise.all(changed.map((c) => actor.saveClient(c)));
      flash(true);
    } catch {
      flash(false);
    }
  };

  const active = clients.find((c) => c.id === sel);

  const go = (pg: string, id?: string) => {
    setPage(pg);
    setSel(id || null);
    setErr("");
  };

  const doGen = async () => {
    if (!active || !actor) return;
    const reportText = draft?.report ?? active.report;
    if (!reportText) {
      setErr("Paste the ChexSystems report first.");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      const clientForGen = draft ?? active;
      const letter = await generateLetter(model, clientForGen);
      if (letter.length < 50) throw new Error("Response too short. Try again.");
      setDraft((d) => (d ? { ...d, letter, status: "letter_ready" } : d));
    } catch (e: any) {
      setErr(e.message);
    }
    setBusy(false);
  };

  const handleLogout = async () => {
    await clear();
    queryClient.clear();
    setClients([]);
    setReady(false);
    setPage("home");
    setSel(null);
  };

  const globalStyles = `
    @import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700&family=Fira+Code:wght@300;400;500&display=swap');
    :root{--h:'Sora',sans-serif;--m:'Fira Code',monospace}
    @keyframes sp{to{transform:rotate(360deg)}}
    @keyframes fi{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
    *{box-sizing:border-box;font-family:var(--h)}body{margin:0}
    input:focus,textarea:focus,select:focus{border-color:${bl}!important}
    textarea{font-family:var(--m)!important}
  `;

  // ── Login screen
  if (!isAuthenticated) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: bg,
          color: tx,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <style>{globalStyles}</style>
        <div style={{ textAlign: "center", padding: "40px 20px" }}>
          <div
            style={{
              fontSize: 32,
              fontWeight: 700,
              letterSpacing: -1,
              marginBottom: 8,
            }}
          >
            <span style={{ color: bl }}>CHEX</span>
            <span style={{ fontWeight: 300, color: "#eee" }}>CLEAR</span>
          </div>
          <div
            style={{
              fontFamily: "var(--m)",
              fontSize: 11,
              color: sb,
              marginBottom: 40,
              letterSpacing: 0.3,
            }}
          >
            ChexSystems Dispute Management
          </div>
          <button
            type="button"
            data-ocid="login.button"
            onClick={() => login()}
            disabled={loginStatus === "logging-in"}
            style={{
              padding: "13px 36px",
              borderRadius: 10,
              border: "none",
              background: bl,
              color: "#fff",
              fontFamily: "var(--h)",
              fontSize: 15,
              fontWeight: 600,
              cursor: loginStatus === "logging-in" ? "wait" : "pointer",
              opacity: loginStatus === "logging-in" ? 0.7 : 1,
            }}
          >
            {loginStatus === "logging-in" ? "Signing in..." : "Sign In"}
          </button>
          <div
            style={{
              fontFamily: "var(--m)",
              fontSize: 9,
              color: dm,
              marginTop: 20,
            }}
          >
            Secured by Internet Identity
          </div>
        </div>
      </div>
    );
  }

  // ── Loading spinner
  if (!ready) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: bg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <style>{globalStyles}</style>
        <span
          data-ocid="app.loading_state"
          style={{
            display: "inline-block",
            width: 20,
            height: 20,
            border: `2px solid ${dm}`,
            borderTopColor: bl,
            borderRadius: "50%",
            animation: "sp .6s linear infinite",
          }}
        />
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: bg, color: tx }}>
      <style>{globalStyles}</style>

      {/* Header */}
      <header
        style={{
          padding: "13px 20px",
          borderBottom: `1px solid ${bd}`,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <button
          type="button"
          data-ocid="nav.link"
          onClick={() => go("home")}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: 17,
            fontWeight: 700,
            letterSpacing: -0.5,
            padding: 0,
            color: tx,
          }}
        >
          <span style={{ color: bl }}>CHEX</span>
          <span style={{ fontWeight: 300, color: "#eee" }}>CLEAR</span>
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {savedState === "saving" && (
            <span
              data-ocid="header.loading_state"
              style={{
                display: "inline-block",
                width: 10,
                height: 10,
                border: `1.5px solid ${dm}`,
                borderTopColor: bl,
                borderRadius: "50%",
                animation: "sp .6s linear infinite",
              }}
            />
          )}
          {savedState === "ok" && (
            <span
              data-ocid="header.success_state"
              style={{ fontFamily: "var(--m)", fontSize: 9, color: "#2dd4a0" }}
            >
              ✓
            </span>
          )}
          {savedState === "err" && (
            <span
              data-ocid="header.error_state"
              style={{ fontFamily: "var(--m)", fontSize: 9, color: "#f04848" }}
            >
              ✕
            </span>
          )}
          <button
            type="button"
            data-ocid="settings.link"
            onClick={() => go("settings")}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: 14,
              color: sb,
              padding: 0,
            }}
            aria-label="Settings"
          >
            ⚙
          </button>
          <button
            type="button"
            data-ocid="logout.button"
            onClick={handleLogout}
            style={{
              padding: "4px 10px",
              borderRadius: 5,
              border: `1px solid ${bd}`,
              background: "transparent",
              color: sb,
              fontFamily: "var(--m)",
              fontSize: 9,
              cursor: "pointer",
            }}
          >
            Sign Out
          </button>
        </div>
      </header>

      <main>
        <div
          style={{
            maxWidth: 580,
            margin: "0 auto",
            padding: "20px 16px 90px",
            animation: "fi .25s ease",
          }}
          key={`${page}${sel}`}
        >
          {/* HOME */}
          {page === "home" && (
            <section>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 16,
                }}
              >
                <span style={{ fontSize: 17, fontWeight: 300 }}>Clients</span>
                <button
                  type="button"
                  data-ocid="client.open_modal_button"
                  onClick={() => {
                    setForm({
                      name: "",
                      address: "",
                      csz: "",
                      dob: "",
                      ssn: "",
                      phone: "",
                      report: "",
                    });
                    go("new");
                  }}
                  style={{
                    padding: "8px 16px",
                    borderRadius: 8,
                    border: "none",
                    background: bl,
                    color: "#fff",
                    fontFamily: "var(--h)",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  + New
                </button>
              </div>

              {clients.length === 0 ? (
                <div
                  data-ocid="clients.empty_state"
                  style={{
                    textAlign: "center",
                    padding: "50px 20px",
                    color: sb,
                  }}
                >
                  <div style={{ fontSize: 28, opacity: 0.25, marginBottom: 8 }}>
                    📋
                  </div>
                  <div style={{ fontSize: 13 }}>No clients yet</div>
                </div>
              ) : (
                <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  {clients.map((c, i) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        data-ocid={`clients.item.${i + 1}`}
                        onClick={() => go("detail", c.id)}
                        style={{
                          width: "100%",
                          textAlign: "left",
                          background: cd,
                          border: `1px solid ${bd}`,
                          borderRadius: 10,
                          padding: "13px 15px",
                          marginBottom: 6,
                          cursor: "pointer",
                          color: tx,
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            marginBottom: 3,
                          }}
                        >
                          <span style={{ fontWeight: 600, fontSize: 14 }}>
                            {c.name}
                          </span>
                          <span
                            style={{
                              fontFamily: "var(--m)",
                              fontSize: 9,
                              fontWeight: 600,
                              textTransform: "uppercase",
                              letterSpacing: 0.5,
                              padding: "2px 8px",
                              borderRadius: 4,
                              color: statusColor(c.status),
                              background: `${statusColor(c.status)}18`,
                            }}
                          >
                            {statusLabel(c.status)}
                          </span>
                        </div>
                        <div
                          style={{
                            fontFamily: "var(--m)",
                            fontSize: 11,
                            color: sb,
                          }}
                        >
                          {c.csz || "—"} · {c.date}
                          {c.letter && (
                            <span style={{ color: "#2dd4a0", marginLeft: 8 }}>
                              ✓ Letter
                            </span>
                          )}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {err && (
                <div
                  style={{
                    marginTop: 8,
                    padding: "8px 12px",
                    borderRadius: 6,
                    fontFamily: "var(--m)",
                    fontSize: 10,
                    color: "#f04848",
                    background: "rgba(240,72,72,0.06)",
                  }}
                >
                  {err}
                </div>
              )}
            </section>
          )}

          {/* NEW CLIENT */}
          {page === "new" && (
            <section>
              <button
                type="button"
                data-ocid="new_client.cancel_button"
                onClick={() => go("home")}
                style={{
                  background: "none",
                  border: "none",
                  color: sb,
                  fontFamily: "var(--m)",
                  fontSize: 11,
                  cursor: "pointer",
                  padding: 0,
                  marginBottom: 14,
                }}
              >
                ← Cancel
              </button>
              <div style={{ fontSize: 17, fontWeight: 300, marginBottom: 18 }}>
                New Client
              </div>

              <div
                style={{
                  background: cd,
                  border: `1px solid ${bd}`,
                  borderRadius: 12,
                  padding: 18,
                  marginBottom: 14,
                }}
              >
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 10,
                  }}
                >
                  <div style={{ gridColumn: "1/-1" }}>
                    <label htmlFor="nc-name" style={L}>
                      Full Name *
                    </label>
                    <input
                      id="nc-name"
                      data-ocid="new_client.input"
                      style={I}
                      value={form.name || ""}
                      onChange={(e) =>
                        setForm({ ...form, name: e.target.value })
                      }
                      placeholder="John Doe"
                    />
                  </div>
                  <div>
                    <label htmlFor="nc-address" style={L}>
                      Address
                    </label>
                    <input
                      id="nc-address"
                      style={I}
                      value={form.address || ""}
                      onChange={(e) =>
                        setForm({ ...form, address: e.target.value })
                      }
                      placeholder="123 Main St"
                    />
                  </div>
                  <div>
                    <label htmlFor="nc-csz" style={L}>
                      City, State ZIP
                    </label>
                    <input
                      id="nc-csz"
                      style={I}
                      value={form.csz || ""}
                      onChange={(e) =>
                        setForm({ ...form, csz: e.target.value })
                      }
                      placeholder="Houston, TX 77001"
                    />
                  </div>
                  <div>
                    <label htmlFor="nc-dob" style={L}>
                      Date of Birth
                    </label>
                    <input
                      id="nc-dob"
                      style={I}
                      value={form.dob || ""}
                      onChange={(e) =>
                        setForm({ ...form, dob: e.target.value })
                      }
                      placeholder="01/15/1990"
                    />
                  </div>
                  <div>
                    <label htmlFor="nc-ssn" style={L}>
                      SSN Last 4
                    </label>
                    <input
                      id="nc-ssn"
                      style={I}
                      value={form.ssn || ""}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          ssn: e.target.value.replace(/\D/g, "").slice(0, 4),
                        })
                      }
                      placeholder="1234"
                      maxLength={4}
                    />
                  </div>
                  <div style={{ gridColumn: "1/-1" }}>
                    <label htmlFor="nc-phone" style={L}>
                      Phone
                    </label>
                    <input
                      id="nc-phone"
                      style={I}
                      value={form.phone || ""}
                      onChange={(e) =>
                        setForm({ ...form, phone: e.target.value })
                      }
                      placeholder="(555) 123-4567"
                    />
                  </div>
                </div>
              </div>

              <div
                style={{
                  background: cd,
                  border: `1px solid ${bd}`,
                  borderRadius: 12,
                  padding: 18,
                  marginBottom: 14,
                }}
              >
                <label htmlFor="nc-report" style={{ ...L, marginBottom: 8 }}>
                  ChexSystems Report
                </label>
                <div
                  style={{
                    fontFamily: "var(--m)",
                    fontSize: 10,
                    color: sb,
                    marginBottom: 8,
                    lineHeight: 1.4,
                  }}
                >
                  Paste the full text from the consumer disclosure report
                </div>
                <textarea
                  id="nc-report"
                  data-ocid="new_client.textarea"
                  value={form.report || ""}
                  onChange={(e) => setForm({ ...form, report: e.target.value })}
                  placeholder="Paste report text here..."
                  style={{
                    ...I,
                    minHeight: 160,
                    resize: "vertical",
                    lineHeight: 1.5,
                  }}
                />
              </div>

              {err && (
                <div
                  data-ocid="new_client.error_state"
                  style={{
                    marginBottom: 10,
                    padding: "8px 12px",
                    borderRadius: 6,
                    fontFamily: "var(--m)",
                    fontSize: 10,
                    color: "#f04848",
                    background: "rgba(240,72,72,0.06)",
                  }}
                >
                  {err}
                </div>
              )}

              <button
                type="button"
                data-ocid="new_client.submit_button"
                onClick={() => {
                  if (!form.name?.trim()) {
                    setErr("Name is required");
                    return;
                  }
                  const c: Client = {
                    id: uid(),
                    name: form.name.trim(),
                    address: form.address || "",
                    csz: form.csz || "",
                    dob: form.dob || "",
                    ssn: form.ssn || "",
                    phone: form.phone || "",
                    report: form.report || "",
                    letter: "",
                    notes: "",
                    status: "new",
                    date: today(),
                  };
                  const next = [c, ...clients];
                  persist(next);
                  go("detail", c.id);
                }}
                disabled={!form.name?.trim()}
                style={Btn(bl, !form.name?.trim())}
              >
                Save Client
              </button>
            </section>
          )}

          {/* DETAIL */}
          {page === "detail" && active && (
            <section>
              <button
                type="button"
                data-ocid="detail.cancel_button"
                onClick={() => go("home")}
                style={{
                  background: "none",
                  border: "none",
                  color: sb,
                  fontFamily: "var(--m)",
                  fontSize: 11,
                  cursor: "pointer",
                  padding: 0,
                  marginBottom: 14,
                }}
              >
                ← Clients
              </button>

              {/* Info card */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  marginBottom: 10,
                }}
              >
                <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 3 }}>
                  {draft?.name || active.name}
                </div>
                <button
                  type="button"
                  data-ocid="detail.delete_button"
                  onClick={async () => {
                    if (confirm(`Delete ${active.name}?`)) {
                      setSavedState("saving");
                      try {
                        await actor?.deleteClient(active.id);
                        flash(true);
                      } catch {
                        flash(false);
                      }
                      persist(clients.filter((c) => c.id !== sel));
                      go("home");
                    }
                  }}
                  style={{
                    padding: "5px 12px",
                    borderRadius: 5,
                    border: "1px solid rgba(240,72,72,0.15)",
                    background: "transparent",
                    color: "#f04848",
                    fontFamily: "var(--m)",
                    fontSize: 9,
                    cursor: "pointer",
                    flexShrink: 0,
                  }}
                >
                  Delete
                </button>
              </div>

              <div
                style={{
                  background: cd,
                  border: `1px solid ${bd}`,
                  borderRadius: 10,
                  padding: "12px 14px",
                  marginBottom: 10,
                }}
              >
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 10,
                  }}
                >
                  <div style={{ gridColumn: "1/-1" }}>
                    <label htmlFor="edit-name" style={L}>
                      Full Name
                    </label>
                    <input
                      id="edit-name"
                      data-ocid="detail.name.input"
                      style={I}
                      value={draft?.name ?? active.name}
                      onChange={(e) =>
                        setDraft((d) =>
                          d ? { ...d, name: e.target.value } : d,
                        )
                      }
                      placeholder="Full Name"
                    />
                  </div>
                  <div>
                    <label htmlFor="edit-address" style={L}>
                      Address
                    </label>
                    <input
                      id="edit-address"
                      data-ocid="detail.address.input"
                      style={I}
                      value={draft?.address ?? active.address}
                      onChange={(e) =>
                        setDraft((d) =>
                          d ? { ...d, address: e.target.value } : d,
                        )
                      }
                      placeholder="123 Main St"
                    />
                  </div>
                  <div>
                    <label htmlFor="edit-csz" style={L}>
                      City/State/ZIP
                    </label>
                    <input
                      id="edit-csz"
                      data-ocid="detail.csz.input"
                      style={I}
                      value={draft?.csz ?? active.csz}
                      onChange={(e) =>
                        setDraft((d) => (d ? { ...d, csz: e.target.value } : d))
                      }
                      placeholder="Houston, TX 77001"
                    />
                  </div>
                  <div>
                    <label htmlFor="edit-dob" style={L}>
                      Date of Birth
                    </label>
                    <input
                      id="edit-dob"
                      data-ocid="detail.dob.input"
                      style={I}
                      value={draft?.dob ?? active.dob}
                      onChange={(e) =>
                        setDraft((d) => (d ? { ...d, dob: e.target.value } : d))
                      }
                      placeholder="01/15/1990"
                    />
                  </div>
                  <div>
                    <label htmlFor="edit-ssn" style={L}>
                      SSN Last 4
                    </label>
                    <input
                      id="edit-ssn"
                      data-ocid="detail.ssn.input"
                      style={I}
                      value={draft?.ssn ?? active.ssn}
                      onChange={(e) =>
                        setDraft((d) =>
                          d
                            ? {
                                ...d,
                                ssn: e.target.value
                                  .replace(/\D/g, "")
                                  .slice(0, 4),
                              }
                            : d,
                        )
                      }
                      placeholder="1234"
                      maxLength={4}
                    />
                  </div>
                  <div>
                    <label htmlFor="edit-phone" style={L}>
                      Phone
                    </label>
                    <input
                      id="edit-phone"
                      data-ocid="detail.phone.input"
                      style={I}
                      value={draft?.phone ?? active.phone}
                      onChange={(e) =>
                        setDraft((d) =>
                          d ? { ...d, phone: e.target.value } : d,
                        )
                      }
                      placeholder="(555) 123-4567"
                    />
                  </div>
                </div>
              </div>

              {/* Status */}
              <div
                style={{
                  background: cd,
                  border: `1px solid ${bd}`,
                  borderRadius: 10,
                  padding: "12px 14px",
                  marginBottom: 10,
                }}
              >
                <div
                  style={{
                    fontFamily: "var(--m)",
                    fontSize: 9,
                    color: sb,
                    letterSpacing: 0.8,
                    marginBottom: 8,
                    textTransform: "uppercase",
                  }}
                >
                  Status
                </div>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                  {STATUSES.map((s) => {
                    const currentStatus = draft?.status ?? active.status;
                    return (
                      <button
                        type="button"
                        data-ocid={`detail.${s.key}.toggle`}
                        key={s.key}
                        onClick={() =>
                          setDraft((d) => (d ? { ...d, status: s.key } : d))
                        }
                        style={{
                          padding: "5px 12px",
                          borderRadius: 5,
                          cursor: "pointer",
                          fontFamily: "var(--m)",
                          fontSize: 10,
                          fontWeight: currentStatus === s.key ? 600 : 400,
                          border: `1px solid ${
                            currentStatus === s.key ? s.color : bd
                          }`,
                          background:
                            currentStatus === s.key
                              ? `${s.color}18`
                              : "transparent",
                          color: currentStatus === s.key ? s.color : sb,
                          transition: "all .15s",
                        }}
                      >
                        {s.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Report */}
              <div
                style={{
                  background: cd,
                  border: `1px solid ${bd}`,
                  borderRadius: 10,
                  padding: "12px 14px",
                  marginBottom: 10,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: 6,
                  }}
                >
                  <span
                    style={{
                      fontFamily: "var(--m)",
                      fontSize: 9,
                      color: sb,
                      letterSpacing: 0.8,
                      textTransform: "uppercase",
                    }}
                  >
                    Report
                  </span>
                  {(draft?.report ?? active.report) && (
                    <span
                      style={{
                        fontFamily: "var(--m)",
                        fontSize: 9,
                        color: "#2dd4a0",
                      }}
                    >
                      {(draft?.report ?? active.report).length} chars
                    </span>
                  )}
                </div>
                <textarea
                  data-ocid="detail.report.textarea"
                  aria-label="ChexSystems Report"
                  value={draft?.report ?? active.report}
                  onChange={(e) =>
                    setDraft((d) => (d ? { ...d, report: e.target.value } : d))
                  }
                  placeholder="Paste ChexSystems report..."
                  style={{
                    ...I,
                    minHeight: (draft?.report ?? active.report) ? 100 : 70,
                    resize: "vertical",
                    fontSize: 11,
                    lineHeight: 1.5,
                  }}
                />
              </div>

              {/* Letter */}
              <div
                style={{
                  background: cd,
                  borderRadius: 10,
                  padding: "12px 14px",
                  marginBottom: 10,
                  border: `1px solid ${
                    (draft?.letter ?? active.letter) ? `${bl}30` : "#f0b42925"
                  }`,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: 6,
                  }}
                >
                  <span
                    style={{
                      fontFamily: "var(--m)",
                      fontSize: 9,
                      letterSpacing: 0.8,
                      textTransform: "uppercase",
                      fontWeight: 600,
                      color: (draft?.letter ?? active.letter) ? bl : "#f0b429",
                    }}
                  >
                    {(draft?.letter ?? active.letter)
                      ? "Dispute Letter"
                      : "No Letter Yet"}
                  </span>
                  {(draft?.letter ?? active.letter) && (
                    <span
                      style={{
                        fontFamily: "var(--m)",
                        fontSize: 9,
                        color: "#2dd4a0",
                      }}
                    >
                      ✓ {(draft?.letter ?? active.letter).length} chars
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  data-ocid="detail.generate.button"
                  onClick={doGen}
                  disabled={busy || !(draft?.report ?? active.report)}
                  style={{
                    ...Btn(bl, busy || !(draft?.report ?? active.report)),
                    marginBottom: (draft?.letter ?? active.letter) ? 10 : 0,
                    fontSize: 13,
                  }}
                >
                  {busy ? (
                    <>
                      <span
                        style={{
                          display: "inline-block",
                          width: 14,
                          height: 14,
                          border: "2px solid rgba(255,255,255,0.2)",
                          borderTopColor: "#fff",
                          borderRadius: "50%",
                          animation: "sp .6s linear infinite",
                        }}
                      />{" "}
                      Generating...
                    </>
                  ) : (draft?.letter ?? active.letter) ? (
                    "Regenerate"
                  ) : (
                    "Generate Dispute Letter"
                  )}
                </button>

                {(draft?.letter ?? active.letter) && (
                  <>
                    <textarea
                      data-ocid="detail.letter.textarea"
                      aria-label="Dispute Letter"
                      value={draft?.letter ?? active.letter}
                      onChange={(e) =>
                        setDraft((d) =>
                          d ? { ...d, letter: e.target.value } : d,
                        )
                      }
                      style={{
                        ...I,
                        minHeight: 280,
                        resize: "vertical",
                        fontSize: 11,
                        lineHeight: 1.6,
                      }}
                    />
                    <button
                      type="button"
                      data-ocid="detail.letter.select_button"
                      onClick={() => {
                        const areas = document.querySelectorAll("textarea");
                        const last = areas[
                          areas.length - 1
                        ] as HTMLTextAreaElement;
                        if (last) {
                          last.focus();
                          last.select();
                        }
                      }}
                      style={{
                        marginTop: 6,
                        width: "100%",
                        padding: "8px",
                        borderRadius: 6,
                        border: `1px solid ${bd}`,
                        background: "transparent",
                        color: sb,
                        fontFamily: "var(--m)",
                        fontSize: 10,
                        cursor: "pointer",
                      }}
                    >
                      Select All Letter Text
                    </button>
                  </>
                )}
              </div>

              {/* Notes */}
              <div
                style={{
                  background: cd,
                  border: `1px solid ${bd}`,
                  borderRadius: 10,
                  padding: "12px 14px",
                  marginBottom: 10,
                }}
              >
                <div
                  style={{
                    fontFamily: "var(--m)",
                    fontSize: 9,
                    color: sb,
                    letterSpacing: 0.8,
                    marginBottom: 6,
                    textTransform: "uppercase",
                  }}
                >
                  Notes
                </div>
                <textarea
                  data-ocid="detail.notes.textarea"
                  aria-label="Notes"
                  value={draft?.notes ?? active.notes ?? ""}
                  onChange={(e) =>
                    setDraft((d) => (d ? { ...d, notes: e.target.value } : d))
                  }
                  placeholder="Add notes about this client..."
                  style={{
                    ...I,
                    minHeight: 70,
                    resize: "vertical",
                    fontSize: 11,
                    lineHeight: 1.5,
                  }}
                />
              </div>

              {/* Save Changes */}
              <button
                type="button"
                data-ocid="detail.save_button"
                disabled={!draft?.name?.trim()}
                onClick={async () => {
                  if (!draft) return;
                  setBusy(true);
                  const next = clients.map((c) => (c.id === sel ? draft : c));
                  await persist(next);
                  setBusy(false);
                }}
                style={{ ...Btn(bl, !draft?.name?.trim()), marginBottom: 10 }}
              >
                Save Changes
              </button>

              {err && (
                <div
                  data-ocid="detail.error_state"
                  style={{
                    padding: "8px 12px",
                    borderRadius: 6,
                    fontFamily: "var(--m)",
                    fontSize: 10,
                    color: "#f04848",
                    background: "rgba(240,72,72,0.06)",
                    marginBottom: 10,
                  }}
                >
                  {err}
                </div>
              )}
            </section>
          )}

          {/* SETTINGS */}
          {page === "settings" && (
            <section>
              <button
                type="button"
                data-ocid="settings.cancel_button"
                onClick={() => go("home")}
                style={{
                  background: "none",
                  border: "none",
                  color: sb,
                  fontFamily: "var(--m)",
                  fontSize: 11,
                  cursor: "pointer",
                  padding: 0,
                  marginBottom: 14,
                }}
              >
                ← Back
              </button>
              <div style={{ fontSize: 17, fontWeight: 300, marginBottom: 18 }}>
                Settings
              </div>

              <div
                style={{
                  background: cd,
                  border: `1px solid ${bd}`,
                  borderRadius: 12,
                  padding: 18,
                }}
              >
                <div
                  style={{ fontSize: 13, fontWeight: 600, marginBottom: 14 }}
                >
                  Venice AI
                </div>
                <div style={{ marginBottom: 14 }}>
                  <label htmlFor="model-select" style={L}>
                    Model
                  </label>
                  <select
                    id="model-select"
                    data-ocid="settings.model.select"
                    style={{ ...I, cursor: "pointer" }}
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                  >
                    <option value="llama-3.3-70b">
                      llama-3.3-70b (standard, fast)
                    </option>
                    <option value="llama-3.3-70b-e2ee">
                      llama-3.3-70b-e2ee (end-to-end encrypted, slower but fully
                      private)
                    </option>
                  </select>
                  <div
                    style={{
                      fontFamily: "var(--m)",
                      fontSize: 9,
                      color: sb,
                      marginTop: 4,
                    }}
                  >
                    E2EE models require Venice Pro. Get it at{" "}
                    <a
                      href="https://venice.ai"
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: bl }}
                    >
                      venice.ai
                    </a>
                  </div>
                </div>
                <button
                  type="button"
                  data-ocid="settings.save_button"
                  onClick={async () => {
                    if (!actor) return;
                    setSavedState("saving");
                    try {
                      await actor.saveModel(model);
                      flash(true);
                    } catch {
                      flash(false);
                    }
                  }}
                  style={Btn(bl, false)}
                >
                  Save Settings
                </button>
              </div>
            </section>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          padding: "10px",
          textAlign: "center",
          fontFamily: "var(--m)",
          fontSize: 9,
          color: dm,
          background: `linear-gradient(transparent, ${bg} 30%)`,
          pointerEvents: "none",
          letterSpacing: 0.3,
        }}
      >
        CHEXCLEAR — Can&#39;t stack bread with a flagged account. Let&#39;s fix
        that.
      </footer>
    </div>
  );
}
