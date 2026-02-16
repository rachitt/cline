import { useState, useEffect, useCallback, useRef } from "react";
import { api, type Incident, type Service } from "./api";

// ─── Types ──────────────────────────────────────────────────

type Page = "incidents" | "services" | "settings";

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; glow?: boolean }> = {
  RECEIVED:      { label: "RECV",       color: "#f59e0b", bg: "rgba(245,158,11,0.1)" },
  FETCHING_LOGS: { label: "LOGS",       color: "#06b6d4", bg: "rgba(6,182,212,0.1)" },
  DIAGNOSING:    { label: "DIAG",       color: "#8b5cf6", bg: "rgba(139,92,246,0.1)", glow: true },
  GENERATING_FIX:{ label: "FIX",        color: "#3b82f6", bg: "rgba(59,130,246,0.1)", glow: true },
  CREATING_PR:   { label: "PR",         color: "#3b82f6", bg: "rgba(59,130,246,0.1)" },
  NOTIFYING:     { label: "NOTIFY",     color: "#22c55e", bg: "rgba(34,197,94,0.1)" },
  COMPLETED:     { label: "DONE",       color: "#22c55e", bg: "rgba(34,197,94,0.1)" },
  FAILED:        { label: "FAIL",       color: "#ef4444", bg: "rgba(239,68,68,0.1)" },
};

// ─── App Shell ──────────────────────────────────────────────

export function App() {
  const [page, setPage] = useState<Page>("incidents");
  const [time, setTime] = useState(new Date());
  const [healthy, setHealthy] = useState(true);

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const check = async () => {
      try {
        await fetch("/api/health");
        setHealthy(true);
      } catch {
        setHealthy(false);
      }
    };
    check();
    const t = setInterval(check, 30000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="scanlines noise h-screen flex flex-col overflow-hidden">
      {/* ─── Top Bar ─────────────────────────────────────── */}
      <header className="flex-shrink-0 h-11 flex items-center justify-between px-4 border-b"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full"
              style={{
                background: healthy ? "var(--accent-green)" : "var(--accent-red)",
                animation: healthy ? "pulse-green 2s infinite" : "pulse-red 1s infinite",
              }} />
            <span className="text-[11px] font-bold tracking-[0.2em] uppercase"
              style={{ fontFamily: "'Anybody', sans-serif", color: "var(--text-primary)" }}>
              INCIDENT RESPONDER
            </span>
          </div>
          <span className="text-[10px]" style={{ color: "var(--text-dim)" }}>
            //CONTROL
          </span>
        </div>

        <div className="flex items-center gap-4">
          <span className="text-[10px] tabular-nums" style={{ color: "var(--text-dim)" }}>
            {time.toISOString().replace("T", " ").slice(0, 19)}Z
          </span>
          <span className="text-[10px] px-2 py-0.5 rounded"
            style={{
              background: healthy ? "var(--accent-green-dim)" : "var(--accent-red-dim)",
              color: healthy ? "var(--accent-green)" : "var(--accent-red)",
            }}>
            {healthy ? "SYSTEMS NOMINAL" : "DEGRADED"}
          </span>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* ─── Sidebar ─────────────────────────────────── */}
        <nav className="flex-shrink-0 w-44 border-r flex flex-col"
          style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
          <div className="flex-1 py-3">
            {([
              { id: "incidents" as Page, label: "INCIDENTS", icon: "⚡" },
              { id: "services" as Page,  label: "SERVICES",  icon: "◆" },
              { id: "settings" as Page,  label: "SETTINGS",  icon: "⚙" },
            ]).map((item) => (
              <button
                key={item.id}
                onClick={() => setPage(item.id)}
                className="w-full text-left px-3 py-2 text-[11px] tracking-wider flex items-center gap-2 transition-colors duration-100"
                style={{
                  color: page === item.id ? "var(--text-primary)" : "var(--text-dim)",
                  background: page === item.id ? "var(--surface-hover)" : "transparent",
                  borderLeft: page === item.id ? "2px solid var(--accent-cyan)" : "2px solid transparent",
                }}>
                <span className="text-xs">{item.icon}</span>
                {item.label}
              </button>
            ))}
          </div>

          <div className="px-3 py-3 border-t text-[9px]" style={{ borderColor: "var(--border)", color: "var(--text-dim)" }}>
            <div>v1.0.0</div>
            <div className="mt-1">CLINE CLI INFRA</div>
          </div>
        </nav>

        {/* ─── Main Content ────────────────────────────── */}
        <main className="flex-1 overflow-auto p-5" style={{ background: "var(--void)" }}>
          {page === "incidents" && <IncidentsPage />}
          {page === "services" && <ServicesPage />}
          {page === "settings" && <SettingsPage />}
        </main>
      </div>
    </div>
  );
}

// ─── Incidents Page ─────────────────────────────────────────

function IncidentsPage() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refreshRef = useRef<NodeJS.Timeout>();

  const fetchIncidents = useCallback(async () => {
    try {
      const data = await api.getIncidents();
      setIncidents(data);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchIncidents();
    refreshRef.current = setInterval(fetchIncidents, 10000);
    return () => clearInterval(refreshRef.current);
  }, [fetchIncidents]);

  const activeCount = incidents.filter(
    (i) => !["COMPLETED", "FAILED"].includes(i.status)
  ).length;

  return (
    <div className="animate-fade-in-up">
      {/* Page header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-semibold tracking-[0.15em] uppercase"
            style={{ fontFamily: "'Anybody', sans-serif" }}>
            INCIDENTS
          </h1>
          {activeCount > 0 && (
            <span className="text-[10px] px-2 py-0.5 rounded-sm font-medium"
              style={{ background: "var(--accent-red-dim)", color: "var(--accent-red)" }}>
              {activeCount} ACTIVE
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-[10px]" style={{ color: "var(--text-dim)" }}>
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500"
            style={{ animation: "pulse-green 2s infinite" }} />
          AUTO-REFRESH 10s
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        {[
          { label: "TOTAL", value: incidents.length, color: "var(--text-secondary)" },
          { label: "ACTIVE", value: activeCount, color: "var(--accent-amber)" },
          { label: "RESOLVED", value: incidents.filter((i) => i.status === "COMPLETED").length, color: "var(--accent-green)" },
          { label: "FAILED", value: incidents.filter((i) => i.status === "FAILED").length, color: "var(--accent-red)" },
        ].map((stat, i) => (
          <div key={stat.label}
            className={`p-3 rounded border animate-fade-in-up stagger-${i + 1}`}
            style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
            <div className="text-[9px] tracking-widest mb-1" style={{ color: "var(--text-dim)" }}>
              {stat.label}
            </div>
            <div className="text-xl font-bold tabular-nums" style={{ color: stat.color, fontFamily: "'Anybody', sans-serif" }}>
              {stat.value}
            </div>
          </div>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center gap-2 py-8 justify-center text-[11px]"
          style={{ color: "var(--text-dim)" }}>
          <span style={{ animation: "blink-cursor 1s infinite" }}>▊</span>
          LOADING INCIDENTS...
        </div>
      ) : error ? (
        <div className="text-center py-8">
          <div className="text-[11px] mb-1" style={{ color: "var(--accent-red)" }}>CONNECTION ERROR</div>
          <div className="text-[10px]" style={{ color: "var(--text-dim)" }}>{error}</div>
        </div>
      ) : incidents.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-2xl mb-2 opacity-20">⚡</div>
          <div className="text-[11px]" style={{ color: "var(--text-dim)" }}>
            NO INCIDENTS RECORDED
          </div>
          <div className="text-[10px] mt-1" style={{ color: "var(--text-dim)" }}>
            Waiting for PagerDuty webhooks...
          </div>
        </div>
      ) : (
        <div className="border rounded overflow-hidden"
          style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
          <table className="w-full text-[11px]">
            <thead>
              <tr className="border-b" style={{ borderColor: "var(--border)" }}>
                {["STATUS", "TITLE", "SERVICE", "SEV", "DURATION", "PR"].map((h) => (
                  <th key={h} className="text-left px-3 py-2 font-medium tracking-wider"
                    style={{ color: "var(--text-dim)", fontSize: "9px" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {incidents.map((inc, i) => (
                <IncidentRow key={inc.id} incident={inc} index={i} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function IncidentRow({ incident, index }: { incident: Incident; index: number }) {
  const cfg = STATUS_CONFIG[incident.status] ?? STATUS_CONFIG.RECEIVED;

  const duration = incident.completedAt
    ? formatDuration(new Date(incident.startedAt), new Date(incident.completedAt))
    : formatDuration(new Date(incident.startedAt), new Date());

  return (
    <tr
      className={`border-b transition-colors duration-75 hover:bg-[var(--surface-hover)] animate-fade-in-up stagger-${Math.min(index + 1, 5)}`}
      style={{ borderColor: "var(--border)" }}>
      <td className="px-3 py-2.5">
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-sm text-[10px] font-medium tracking-wider"
          style={{ background: cfg.bg, color: cfg.color }}>
          {cfg.glow && (
            <span className="inline-block w-1.5 h-1.5 rounded-full"
              style={{ background: cfg.color, animation: "pulse-green 1.5s infinite" }} />
          )}
          {cfg.label}
        </span>
      </td>
      <td className="px-3 py-2.5 max-w-[300px] truncate" style={{ color: "var(--text-primary)" }}>
        {incident.title}
      </td>
      <td className="px-3 py-2.5" style={{ color: "var(--text-secondary)" }}>
        {incident.serviceName}
      </td>
      <td className="px-3 py-2.5">
        <span className="text-[10px] font-medium"
          style={{ color: incident.urgency === "high" ? "var(--accent-red)" : "var(--accent-amber)" }}>
          {incident.urgency?.toUpperCase() ?? "—"}
        </span>
      </td>
      <td className="px-3 py-2.5 tabular-nums" style={{ color: "var(--text-dim)" }}>
        {duration}
      </td>
      <td className="px-3 py-2.5">
        {incident.prUrl ? (
          <a href={incident.prUrl} target="_blank" rel="noopener noreferrer"
            className="text-[10px] underline underline-offset-2 transition-colors hover:brightness-125"
            style={{ color: "var(--accent-blue)" }}>
            #{incident.prNumber}
          </a>
        ) : (
          <span style={{ color: "var(--text-dim)" }}>—</span>
        )}
      </td>
    </tr>
  );
}

// ─── Services Page ──────────────────────────────────────────

function ServicesPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const fetchServices = useCallback(async () => {
    try {
      const data = await api.getServices();
      setServices(data);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchServices(); }, [fetchServices]);

  return (
    <div className="animate-fade-in-up">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-sm font-semibold tracking-[0.15em] uppercase"
          style={{ fontFamily: "'Anybody', sans-serif" }}>
          MONITORED SERVICES
        </h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="text-[10px] tracking-wider px-3 py-1.5 rounded border transition-all duration-150"
          style={{
            borderColor: "var(--accent-cyan)",
            color: "var(--accent-cyan)",
            background: showForm ? "rgba(6,182,212,0.1)" : "transparent",
          }}>
          {showForm ? "✕ CANCEL" : "+ ADD SERVICE"}
        </button>
      </div>

      {showForm && (
        <AddServiceForm
          onCreated={() => { setShowForm(false); fetchServices(); }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {loading ? (
        <div className="flex items-center gap-2 py-8 justify-center text-[11px]"
          style={{ color: "var(--text-dim)" }}>
          <span style={{ animation: "blink-cursor 1s infinite" }}>▊</span>
          LOADING SERVICES...
        </div>
      ) : services.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-2xl mb-2 opacity-20">◆</div>
          <div className="text-[11px]" style={{ color: "var(--text-dim)" }}>
            NO SERVICES CONFIGURED
          </div>
          <div className="text-[10px] mt-1" style={{ color: "var(--text-dim)" }}>
            Add a service to start monitoring.
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
          {services.map((svc, i) => (
            <ServiceCard key={svc.id} service={svc} index={i} onDeleted={fetchServices} />
          ))}
        </div>
      )}
    </div>
  );
}

function ServiceCard({ service, index, onDeleted }: { service: Service; index: number; onDeleted: () => void }) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!confirm(`Remove service "${service.name}"?`)) return;
    setDeleting(true);
    try {
      await api.deleteService(service.id);
      onDeleted();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div
      className={`border rounded p-4 transition-colors duration-100 hover:border-[var(--border-bright)] animate-fade-in-up stagger-${Math.min(index + 1, 5)}`}
      style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="text-[12px] font-semibold tracking-wide" style={{ color: "var(--text-primary)" }}>
            {service.name}
          </h3>
          <div className="text-[10px] mt-0.5" style={{ color: "var(--text-dim)" }}>
            PD: {service.pagerdutyServiceId}
          </div>
        </div>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="text-[9px] px-1.5 py-0.5 rounded transition-colors hover:bg-[var(--accent-red-dim)]"
          style={{ color: "var(--accent-red)" }}>
          {deleting ? "..." : "DEL"}
        </button>
      </div>

      <div className="space-y-2 text-[10px]">
        <div className="flex items-center gap-2">
          <span className="w-12 flex-shrink-0" style={{ color: "var(--text-dim)" }}>REPO</span>
          <span style={{ color: "var(--accent-blue)" }}>
            {service.repoOwner}/{service.repoName}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-12 flex-shrink-0" style={{ color: "var(--text-dim)" }}>BRANCH</span>
          <span style={{ color: "var(--text-secondary)" }}>{service.defaultBranch}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-12 flex-shrink-0" style={{ color: "var(--text-dim)" }}>LOGS</span>
          <span className="px-1.5 py-0.5 rounded-sm text-[9px] tracking-wider font-medium"
            style={{
              background: service.logSource === "mock" ? "var(--accent-amber-dim)" : "var(--accent-green-dim)",
              color: service.logSource === "mock" ? "var(--accent-amber)" : "var(--accent-green)",
            }}>
            {service.logSource.toUpperCase()}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-12 flex-shrink-0" style={{ color: "var(--text-dim)" }}>SLACK</span>
          <span className="text-[10px]" style={{ color: "var(--text-secondary)" }}>
            #{service.slackChannelId}
          </span>
        </div>
      </div>
    </div>
  );
}

function AddServiceForm({ onCreated, onCancel }: { onCreated: () => void; onCancel: () => void }) {
  const [form, setForm] = useState({
    name: "",
    pagerdutyServiceId: "",
    repoOwner: "",
    repoName: "",
    defaultBranch: "main",
    slackChannelId: "",
    logSource: "mock",
    logQuery: "",
  });
  const [submitting, setSubmitting] = useState(false);

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.createService({
        ...form,
        logQuery: form.logQuery || null,
      });
      onCreated();
    } catch {
      alert("Failed to create service");
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass = "w-full px-2 py-1.5 rounded text-[11px] border outline-none transition-colors focus:border-[var(--accent-cyan)]";
  const inputStyle = {
    background: "var(--void)",
    borderColor: "var(--border)",
    color: "var(--text-primary)",
  };

  return (
    <form onSubmit={handleSubmit} className="border rounded p-4 mb-5 animate-slide-in"
      style={{ borderColor: "var(--accent-cyan)", background: "var(--surface)", borderStyle: "dashed" }}>
      <div className="text-[9px] tracking-widest mb-3" style={{ color: "var(--accent-cyan)" }}>
        NEW SERVICE CONFIGURATION
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[9px] tracking-wider mb-1" style={{ color: "var(--text-dim)" }}>SERVICE NAME</label>
          <input value={form.name} onChange={set("name")} required placeholder="payments-api"
            className={inputClass} style={inputStyle} />
        </div>
        <div>
          <label className="block text-[9px] tracking-wider mb-1" style={{ color: "var(--text-dim)" }}>PAGERDUTY SERVICE ID</label>
          <input value={form.pagerdutyServiceId} onChange={set("pagerdutyServiceId")} required placeholder="P1234ABC"
            className={inputClass} style={inputStyle} />
        </div>
        <div>
          <label className="block text-[9px] tracking-wider mb-1" style={{ color: "var(--text-dim)" }}>REPO OWNER</label>
          <input value={form.repoOwner} onChange={set("repoOwner")} required placeholder="your-org"
            className={inputClass} style={inputStyle} />
        </div>
        <div>
          <label className="block text-[9px] tracking-wider mb-1" style={{ color: "var(--text-dim)" }}>REPO NAME</label>
          <input value={form.repoName} onChange={set("repoName")} required placeholder="payments-api"
            className={inputClass} style={inputStyle} />
        </div>
        <div>
          <label className="block text-[9px] tracking-wider mb-1" style={{ color: "var(--text-dim)" }}>DEFAULT BRANCH</label>
          <input value={form.defaultBranch} onChange={set("defaultBranch")} placeholder="main"
            className={inputClass} style={inputStyle} />
        </div>
        <div>
          <label className="block text-[9px] tracking-wider mb-1" style={{ color: "var(--text-dim)" }}>SLACK CHANNEL ID</label>
          <input value={form.slackChannelId} onChange={set("slackChannelId")} required placeholder="C0123ABCDEF"
            className={inputClass} style={inputStyle} />
        </div>
        <div>
          <label className="block text-[9px] tracking-wider mb-1" style={{ color: "var(--text-dim)" }}>LOG SOURCE</label>
          <select value={form.logSource} onChange={set("logSource")}
            className={inputClass} style={inputStyle}>
            <option value="mock">MOCK (Demo)</option>
            <option value="datadog">DATADOG</option>
            <option value="cloudwatch">CLOUDWATCH</option>
          </select>
        </div>
        <div>
          <label className="block text-[9px] tracking-wider mb-1" style={{ color: "var(--text-dim)" }}>LOG QUERY (optional)</label>
          <input value={form.logQuery} onChange={set("logQuery")} placeholder="service:payments"
            className={inputClass} style={inputStyle} />
        </div>
      </div>
      <div className="flex items-center gap-2 mt-4">
        <button
          type="submit"
          disabled={submitting}
          className="text-[10px] tracking-wider px-4 py-1.5 rounded font-medium transition-opacity"
          style={{ background: "var(--accent-cyan)", color: "#06080c" }}>
          {submitting ? "CREATING..." : "CREATE SERVICE"}
        </button>
        <button type="button" onClick={onCancel}
          className="text-[10px] tracking-wider px-3 py-1.5" style={{ color: "var(--text-dim)" }}>
          CANCEL
        </button>
      </div>
    </form>
  );
}

// ─── Settings Page ──────────────────────────────────────────

function SettingsPage() {
  return (
    <div className="animate-fade-in-up">
      <h1 className="text-sm font-semibold tracking-[0.15em] uppercase mb-5"
        style={{ fontFamily: "'Anybody', sans-serif" }}>
        SETTINGS
      </h1>

      <div className="space-y-4 max-w-xl">
        <div className="border rounded p-4" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
          <div className="text-[9px] tracking-widest mb-3" style={{ color: "var(--text-dim)" }}>
            ENVIRONMENT
          </div>
          <div className="space-y-2 text-[11px]">
            {[
              { key: "ANTHROPIC_API_KEY", status: true },
              { key: "PAGERDUTY_WEBHOOK_SECRET", status: true },
              { key: "SLACK_BOT_TOKEN", status: true },
              { key: "GITHUB_TOKEN", status: true },
              { key: "DATABASE_URL", status: true },
              { key: "REDIS_URL", status: true },
            ].map((env) => (
              <div key={env.key} className="flex items-center justify-between py-1 border-b"
                style={{ borderColor: "var(--border)" }}>
                <span style={{ color: "var(--text-secondary)" }}>{env.key}</span>
                <span className="text-[9px] px-1.5 py-0.5 rounded-sm tracking-wider"
                  style={{
                    background: "var(--accent-green-dim)",
                    color: "var(--accent-green)",
                  }}>
                  SET
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="border rounded p-4" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
          <div className="text-[9px] tracking-widest mb-3" style={{ color: "var(--text-dim)" }}>
            CLINE CLI
          </div>
          <div className="space-y-2 text-[11px]">
            <div className="flex justify-between">
              <span style={{ color: "var(--text-dim)" }}>Path</span>
              <span style={{ color: "var(--text-secondary)" }}>cline</span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: "var(--text-dim)" }}>Timeout</span>
              <span className="tabular-nums" style={{ color: "var(--text-secondary)" }}>300,000ms</span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: "var(--text-dim)" }}>Max Turns</span>
              <span className="tabular-nums" style={{ color: "var(--text-secondary)" }}>25</span>
            </div>
          </div>
        </div>

        <div className="border rounded p-4" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
          <div className="text-[9px] tracking-widest mb-3" style={{ color: "var(--text-dim)" }}>
            ABOUT
          </div>
          <div className="text-[10px] space-y-1" style={{ color: "var(--text-dim)" }}>
            <div>Incident Responder Bot v1.0.0</div>
            <div>Track: Cline CLI as Infrastructure</div>
            <div className="mt-2" style={{ color: "var(--text-dim)" }}>
              Automated incident diagnosis and remediation powered by Cline CLI.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Utilities ──────────────────────────────────────────────

function formatDuration(start: Date, end: Date): string {
  const ms = end.getTime() - start.getTime();
  if (ms < 0) return "—";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  if (m < 60) return `${m}m ${rs}s`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return `${h}h ${rm}m`;
}
