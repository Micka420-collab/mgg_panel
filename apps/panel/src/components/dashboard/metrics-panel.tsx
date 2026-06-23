"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  Cpu,
  MemoryStick,
  HardDrive,
  ArrowDownUp,
  Users,
  Loader2,
  RefreshCw,
  AlertTriangle,
  Info,
  CheckCircle2,
  History,
} from "lucide-react";
import { api } from "@/lib/client";
import { cn, relativeTime } from "@/lib/util";

interface MetricPoint {
  ts: number;
  cpu: number;
  memMb: number;
  players: number;
  diskMb: number;
  netRxKbps: number;
  netTxKbps: number;
}
interface MetricSummary {
  current: number;
  avg: number;
  peak: number;
  min: number;
}
interface ServerEvent {
  level: string;
  message: string;
  resolved: boolean;
  at: number;
}
interface HealthSignal {
  risk: boolean;
  level: "info" | "warning" | "critical";
  message: string;
}
interface Health {
  memory: (HealthSignal & { ratio: number; etaMinutes: number | null }) | null;
  cpu: (HealthSignal & { latest: number }) | null;
}
interface MetricsResponse {
  points: MetricPoint[];
  summary: {
    cpu: MetricSummary;
    memMb: MetricSummary;
    diskMb: MetricSummary;
    players: MetricSummary;
    netRxKbps: MetricSummary;
    netTxKbps: MetricSummary;
  };
  events: ServerEvent[];
  health: Health;
  caps: { memMb: number; diskMb: number };
}

const RANGES: { label: string; hours: number }[] = [
  { label: "1h", hours: 1 },
  { label: "6h", hours: 6 },
  { label: "24h", hours: 24 },
  { label: "7d", hours: 168 },
];

const fmtMb = (mb: number) => (mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`);
const fmtKbps = (k: number) => (k >= 1000 ? `${(k / 1000).toFixed(1)} Mbps` : `${Math.round(k)} kbps`);
const pct = (v: number, cap: number) => (cap > 0 ? ` · ${Math.round((v / cap) * 100)}%` : "");

export function MetricsPanel({ id }: { id: string }) {
  const [data, setData] = useState<MetricsResponse | null>(null);
  const [hours, setHours] = useState(6);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const res = await api<MetricsResponse>(`/api/servers/${id}/metrics?hours=${hours}`);
      setData(res);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setRefreshing(false);
    }
  }, [id, hours]);

  useEffect(() => {
    setData(null);
    load();
    const t = setInterval(load, 30_000); // live-ish: refresh every 30s
    return () => clearInterval(t);
  }, [load]);

  const points = data?.points ?? null;
  const latest = points && points.length ? points[points.length - 1] : null;
  const health = data?.health ?? null;
  const events = data?.events ?? [];

  const charts = useMemo(() => {
    if (!data) return [];
    const s = data.summary;
    const caps = data.caps;
    return [
      {
        key: "cpu",
        label: "CPU",
        icon: Cpu,
        color: "#22B8D8",
        values: (points ?? []).map((p) => p.cpu),
        format: (v: number) => `${v.toFixed(0)}%`,
        current: latest ? `${latest.cpu.toFixed(0)}%` : "—",
        avg: s.cpu.avg,
        fixedMax: 100,
      },
      {
        key: "mem",
        label: "RAM",
        icon: MemoryStick,
        color: "#7C5CFF",
        values: (points ?? []).map((p) => p.memMb),
        format: fmtMb,
        current: latest ? `${fmtMb(latest.memMb)}${pct(latest.memMb, caps.memMb)}` : "—",
        avg: s.memMb.avg,
        fixedMax: caps.memMb || undefined,
      },
      {
        key: "disk",
        label: "Disk",
        icon: HardDrive,
        color: "#FBBF24",
        values: (points ?? []).map((p) => p.diskMb),
        format: fmtMb,
        current: latest ? `${fmtMb(latest.diskMb)}${pct(latest.diskMb, caps.diskMb)}` : "—",
        avg: s.diskMb.avg,
        fixedMax: caps.diskMb || undefined,
      },
      {
        key: "net",
        label: "Network",
        icon: ArrowDownUp,
        color: "#58A6FF",
        values: (points ?? []).map((p) => p.netRxKbps + p.netTxKbps),
        format: fmtKbps,
        current: latest ? `↓${fmtKbps(latest.netRxKbps)} ↑${fmtKbps(latest.netTxKbps)}` : "—",
        avg: s.netRxKbps.avg + s.netTxKbps.avg,
        fixedMax: undefined,
      },
      {
        key: "players",
        label: "Players",
        icon: Users,
        color: "#34D399",
        values: (points ?? []).map((p) => p.players),
        format: (v: number) => `${Math.round(v)}`,
        current: latest ? `${latest.players}` : "—",
        avg: s.players.avg,
        fixedMax: undefined,
      },
    ];
  }, [data, points, latest]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-white/50">
          <Activity className="h-4 w-4 text-cyan" />
          Resource history
          {refreshing && <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan" />}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-white/10 bg-black/20 p-0.5">
            {RANGES.map((r) => (
              <button
                key={r.hours}
                onClick={() => setHours(r.hours)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition",
                  hours === r.hours ? "bg-white/10 text-white" : "text-white/40 hover:text-white",
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
          <button
            onClick={load}
            title="Refresh"
            className="rounded-lg border border-white/10 bg-black/20 p-1.5 text-white/40 transition hover:text-white"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>
      )}

      {health && (health.memory?.risk || health.cpu?.risk) && (
        <div className="space-y-2">
          {health.memory?.risk && (
            <div className="flex items-start gap-2.5 rounded-xl border border-warn/30 bg-warn/10 px-3 py-2.5 text-sm text-warn">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
              <span>{health.memory.message}</span>
            </div>
          )}
          {health.cpu?.risk && (
            <div className="flex items-start gap-2.5 rounded-xl border border-cyan/30 bg-cyan/10 px-3 py-2.5 text-sm text-cyan">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-cyan" />
              <span>{health.cpu.message}</span>
            </div>
          )}
        </div>
      )}

      {points === null ? (
        <div className="flex h-48 items-center justify-center glass">
          <Loader2 className="h-6 w-6 animate-spin text-cyan" />
        </div>
      ) : points.length === 0 ? (
        <div className="glass flex h-48 flex-col items-center justify-center gap-2 text-center">
          <Activity className="h-7 w-7 text-white/20" />
          <p className="text-sm text-white/50">No metrics recorded yet.</p>
          <p className="max-w-xs text-xs text-white/30">
            Samples are collected every minute while the server is running. Check back shortly.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {charts.map((c) => (
            <Sparkline
              key={c.key}
              label={c.label}
              icon={c.icon}
              color={c.color}
              current={c.current}
              values={c.values}
              avg={c.avg}
              fixedMax={c.fixedMax}
              format={c.format}
            />
          ))}
        </div>
      )}

      {points !== null && <EventsHistory events={events} />}
    </div>
  );
}

/** Dependency-free area + line chart drawn as inline SVG (no chart library). */
function Sparkline({
  label,
  icon: Icon,
  color,
  current,
  values,
  avg,
  fixedMax,
  format,
}: {
  label: string;
  icon: any;
  color: string;
  current: string;
  values: number[];
  avg?: number;
  fixedMax?: number;
  format: (v: number) => string;
}) {
  const W = 320;
  const H = 96;
  const PAD = 4;

  const { line, area, peak } = useMemo(() => {
    if (values.length === 0) return { line: "", area: "", peak: 0 };
    const max = Math.max(fixedMax ?? 0, ...values, 1); // never divide by zero
    const peakVal = Math.max(...values);
    const innerW = W - PAD * 2;
    const innerH = H - PAD * 2;
    const n = values.length;
    const x = (i: number) => PAD + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
    const y = (v: number) => PAD + innerH - (Math.min(v, max) / max) * innerH;

    const pts = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
    const linePath = `M${pts.join(" L")}`;
    const areaPath =
      `M${x(0).toFixed(1)},${(H - PAD).toFixed(1)} ` +
      `L${pts.join(" L")} ` +
      `L${x(n - 1).toFixed(1)},${(H - PAD).toFixed(1)} Z`;
    return { line: linePath, area: areaPath, peak: peakVal };
  }, [values, fixedMax]);

  const gradId = `grad-${label.replace(/\s+/g, "")}`;

  return (
    <div className="glass p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs text-white/45">
          <Icon className="h-3.5 w-3.5" style={{ color }} />
          {label}
        </div>
        <div className="font-display text-sm font-semibold text-white">{current}</div>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="mt-3 h-24 w-full overflow-visible"
        role="img"
        aria-label={`${label} over time`}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.35" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* baseline grid */}
        <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
        <line x1={PAD} y1={H / 2} x2={W - PAD} y2={H / 2} stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
        {area && <path d={area} fill={`url(#${gradId})`} />}
        {line && (
          <path
            d={line}
            fill="none"
            stroke={color}
            strokeWidth="1.75"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
      <div className="mt-2 flex justify-between text-[10px] text-white/25">
        <span>{values.length} pts</span>
        {avg !== undefined && <span>avg {format(avg)}</span>}
        <span>peak {format(peak)}</span>
      </div>
    </div>
  );
}

/** Recent crashes, auto-restarts and predictive warnings for this server. */
function EventsHistory({ events }: { events: ServerEvent[] }) {
  const icon = (e: ServerEvent) => {
    if (e.resolved) return <CheckCircle2 className="h-4 w-4 text-online" />;
    if (e.level === "critical") return <AlertTriangle className="h-4 w-4 text-danger" />;
    if (e.level === "warning") return <AlertTriangle className="h-4 w-4 text-warn" />;
    return <Info className="h-4 w-4 text-cyan" />;
  };
  return (
    <div className="glass p-5">
      <h3 className="flex items-center gap-2 font-display font-semibold text-white">
        <History className="h-4 w-4 text-cyan" /> Event history
      </h3>
      {events.length === 0 ? (
        <p className="mt-3 text-sm text-white/40">No events recorded yet — crashes, auto-restarts and resource warnings will appear here.</p>
      ) : (
        <ul className="mt-4 space-y-2.5">
          {events.map((e, i) => (
            <li key={i} className="flex items-start gap-3 text-sm">
              <span className="mt-0.5 shrink-0">{icon(e)}</span>
              <span className="flex-1 text-white/75">{e.message}</span>
              <span className="flex shrink-0 items-center gap-2 text-xs text-white/35">
                {e.resolved && <span className="rounded bg-online/15 px-1.5 py-0.5 text-[10px] text-online">resolved</span>}
                {relativeTime(e.at)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
