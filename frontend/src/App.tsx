import { useState } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider, useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import {
  useListCodes, useCreateCode, useDeleteCode,
  useListStaff, useCreateStaff, useDeleteStaff, useUpdateStaff, useStaffLogin,
  useListTasks, useCreateTask, useUpdateTask, useDeleteTask,
  useListLeaves, useCreateLeave, useUpdateLeave,
  useGetStats,
  getListCodesQueryKey, getListStaffQueryKey, getListTasksQueryKey, getListLeavesQueryKey, getGetStatsQueryKey,
} from "@workspace/api-client-react";
import type { StaffMember } from "@workspace/api-client-react";
import { DISCORD_URL, OWNER_PASSWORD } from "./config.js";

const queryClient = new QueryClient();

const ROLES = ["Trainee", "Staff", "Mod", "Senior Mod", "Admin", "Senior Admin", "Manager", "Developer"] as const;

const ROLE_COLORS: Record<string, string> = {
  Trainee: "bg-slate-500/10 text-slate-400 border-slate-500/20",
  Staff: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  Mod: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
  "Senior Mod": "bg-teal-500/10 text-teal-400 border-teal-500/20",
  Admin: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  "Senior Admin": "bg-red-500/10 text-red-400 border-red-500/20",
  Manager: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  Developer: "bg-primary/10 text-primary border-primary/20",
};

type Announcement = { id: number; type: string; title: string; content: string; pinned: string; createdAt: string };
type PromotionRequest = { id: number; staffId: number; staffUsername: string; currentRole: string; requestedRole: string; reason: string; status: string; createdAt: string; reviewedAt: string | null };

const API = "/api";

/* ─── Custom hooks ─── */
function useAnnouncements(type?: "public" | "staff") {
  return useQuery<Announcement[]>({
    queryKey: ["announcements", type ?? "all"],
    queryFn: () => fetch(`${API}/announcements${type ? `?type=${type}` : ""}`).then(r => r.json()),
  });
}
function useCreateAnnouncement() {
  return useMutation({
    mutationFn: (body: { type: string; title: string; content: string; pinned: boolean }) =>
      fetch(`${API}/announcements`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(r => r.json()),
  });
}
function useDeleteAnnouncement() {
  return useMutation({ mutationFn: (id: number) => fetch(`${API}/announcements/${id}`, { method: "DELETE" }).then(r => r.json()) });
}
function usePromotionRequests(staffId?: number) {
  return useQuery<PromotionRequest[]>({
    queryKey: ["promotions", staffId ?? "all"],
    queryFn: () => fetch(`${API}/promotion-requests${staffId ? `?staffId=${staffId}` : ""}`).then(r => r.json()),
  });
}
function useCreatePromotion() {
  return useMutation({
    mutationFn: (body: { staffId: number; staffUsername: string; currentRole: string; requestedRole: string; reason: string }) =>
      fetch(`${API}/promotion-requests`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(async r => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || "Failed");
        return data;
      }),
  });
}
function useUpdatePromotion() {
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      fetch(`${API}/promotion-requests/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) }).then(r => r.json()),
  });
}

/* ─── Shared stable sub-components (all outside any render fn) ─── */

function RoleBadge({ role }: { role: string }) {
  const cls = ROLE_COLORS[role] || "bg-muted text-muted-foreground border-border";
  return <span className={`px-2 py-0.5 text-xs rounded-full border font-semibold ${cls}`}>{role}</span>;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button onClick={() => { navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }); }}
      className={`absolute top-2 right-2 px-2 py-1 rounded text-xs font-semibold border transition-all duration-200 ${copied ? "bg-green-500/20 text-green-400 border-green-500/30" : "bg-muted text-muted-foreground border-border hover:bg-primary/10 hover:text-primary hover:border-primary/30"}`}>
      {copied ? "✓ Copied!" : "Copy"}
    </button>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
    done: "bg-green-500/10 text-green-400 border-green-500/20",
    failed: "bg-red-500/10 text-red-400 border-red-500/20",
    approved: "bg-green-500/10 text-green-400 border-green-500/20",
    denied: "bg-red-500/10 text-red-400 border-red-500/20",
  };
  return <span className={`px-2 py-0.5 text-xs rounded-full border font-semibold capitalize ${map[status] || "bg-muted text-muted-foreground border-border"}`}>{status}</span>;
}

/* Modal defined OUTSIDE all components — never recreated on re-render */
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-card border border-border rounded-xl p-6 w-full max-w-sm shadow-xl mx-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-foreground">{title}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-lg leading-none">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function AnnouncementCard({ ann, onDelete }: { ann: Announcement; onDelete?: (id: number) => void }) {
  return (
    <div className={`p-4 rounded-xl border ${ann.pinned === "true" ? "bg-primary/5 border-primary/30" : "bg-card border-border"}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            {ann.pinned === "true" && <span className="text-xs text-primary font-bold">📌 PINNED</span>}
            <span className="font-bold text-sm text-foreground">{ann.title}</span>
          </div>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{ann.content}</p>
          <p className="text-xs text-muted-foreground mt-2">{new Date(ann.createdAt).toLocaleString()}</p>
        </div>
        {onDelete && (
          <button onClick={() => onDelete(ann.id)} className="flex-shrink-0 px-2 py-1 rounded text-xs text-destructive border border-destructive/20 bg-destructive/5 hover:bg-destructive/20 transition-colors">✕</button>
        )}
      </div>
    </div>
  );
}

const inputCls = "px-3 py-2 rounded-lg bg-input border border-border text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 ring-primary";

function Btn({ variant = "primary", className = "", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" | "outline" }) {
  const base = "px-4 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50";
  const v = { primary: "bg-primary text-white hover:bg-primary/90", ghost: "border border-border text-muted-foreground hover:bg-muted", danger: "bg-destructive/10 text-destructive border border-destructive/20 hover:bg-destructive/20", outline: "border border-border text-foreground hover:bg-muted" };
  return <button {...props} className={`${base} ${v[variant]} ${className}`} />;
}

/* ─── Public Site ─── */
function PublicSite({ onOwnerLogin, onStaffLogin }: { onOwnerLogin: () => void; onStaffLogin: (s: StaffMember) => void }) {
  const { data: codes = [] } = useListCodes();
  const { data: announcements = [] } = useAnnouncements("public");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "free" | "paid">("all");
  const q = search.toLowerCase();
  const allFiltered = codes.filter(c =>
    (filter === "all" || c.type === filter) &&
    (!q || c.title.toLowerCase().includes(q) || (c.emoji || "").includes(q) || (c.description || "").toLowerCase().includes(q))
  );
  const freeCodes = allFiltered.filter(c => c.type === "free");
  const paidCodes = allFiltered.filter(c => c.type === "paid");

  const [showOwnerLogin, setShowOwnerLogin] = useState(false);
  const [showStaffLogin, setShowStaffLogin] = useState(false);
  const [ownerPw, setOwnerPw] = useState("");
  const [staffUser, setStaffUser] = useState("");
  const [staffPw, setStaffPw] = useState("");
  const staffLogin = useStaffLogin();
  const { toast } = useToast();

  function handleOwnerLogin(e: React.FormEvent) {
    e.preventDefault();
    if (ownerPw === OWNER_PASSWORD) { onOwnerLogin(); setShowOwnerLogin(false); setOwnerPw(""); }
    else toast({ title: "Wrong password", variant: "destructive" });
  }

  function handleStaffLogin(e: React.FormEvent) {
    e.preventDefault();
    staffLogin.mutate({ data: { username: staffUser, password: staffPw } }, {
      onSuccess: (data) => { onStaffLogin(data as StaffMember); setShowStaffLogin(false); },
      onError: () => toast({ title: "Invalid credentials", variant: "destructive" }),
    });
  }

  const sorted = [...announcements.filter(a => a.pinned === "true"), ...announcements.filter(a => a.pinned !== "true")];

  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b border-border px-6 py-4 flex items-center justify-between sticky top-0 z-50 bg-background/95 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center font-black text-white text-sm">CZ</div>
          <span className="font-bold text-lg tracking-tight text-foreground">CodeZ <span className="text-primary">Development</span></span>
        </div>
        <div className="flex items-center gap-2">
          <a href={DISCORD_URL} target="_blank" rel="noopener noreferrer" className="px-4 py-2 rounded-lg bg-[#5865F2] text-white text-sm font-semibold hover:bg-[#4752c4] transition-colors hidden sm:block">Discord</a>
          <Btn variant="outline" onClick={() => { setShowStaffLogin(true); setShowOwnerLogin(false); }}>Staff Panel</Btn>
          <Btn onClick={() => { setShowOwnerLogin(true); setShowStaffLogin(false); }}>Owner Panel</Btn>
        </div>
      </nav>

      {showOwnerLogin && (
        <Modal title="Owner Login" onClose={() => setShowOwnerLogin(false)}>
          <form onSubmit={handleOwnerLogin} className="flex flex-col gap-3">
            <input type="password" placeholder="Password" value={ownerPw} onChange={e => setOwnerPw(e.target.value)} className={`w-full ${inputCls}`} autoFocus />
            <div className="flex gap-2">
              <Btn type="submit" className="flex-1">Login</Btn>
              <Btn type="button" variant="ghost" onClick={() => setShowOwnerLogin(false)} className="flex-1">Cancel</Btn>
            </div>
          </form>
        </Modal>
      )}

      {showStaffLogin && (
        <Modal title="Staff Login" onClose={() => setShowStaffLogin(false)}>
          <form onSubmit={handleStaffLogin} className="flex flex-col gap-3">
            <input placeholder="Username" value={staffUser} onChange={e => setStaffUser(e.target.value)} className={`w-full ${inputCls}`} autoFocus />
            <input type="password" placeholder="Password" value={staffPw} onChange={e => setStaffPw(e.target.value)} className={`w-full ${inputCls}`} />
            <div className="flex gap-2">
              <Btn type="submit" className="flex-1">Login</Btn>
              <Btn type="button" variant="ghost" onClick={() => setShowStaffLogin(false)} className="flex-1">Cancel</Btn>
            </div>
          </form>
        </Modal>
      )}

      <header className="py-20 px-6 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold mb-6">FREE & PREMIUM CODES</div>
        <h1 className="text-5xl font-black tracking-tight text-foreground mb-4">CodeZ <span className="text-primary">Development</span></h1>
        <p className="text-muted-foreground text-lg max-w-xl mx-auto mb-8">Your hub for exclusive server codes — free for everyone, premium for serious communities.</p>
        <a href={DISCORD_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-white font-bold text-base hover:bg-primary/90 transition-colors">Join Our Discord</a>
      </header>

      <main className="max-w-5xl mx-auto px-6 pb-20">
        {sorted.length > 0 && (
          <section className="mb-10">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-xl">📢</span>
              <h2 className="text-lg font-bold text-foreground">Announcements</h2>
            </div>
            <div className="space-y-3">{sorted.map(a => <AnnouncementCard key={a.id} ann={a} />)}</div>
          </section>
        )}

        <div className="mb-10 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">🔍</span>
            <input type="text" placeholder="Search codes by title, emoji or description…" value={search} onChange={e => setSearch(e.target.value)}
              className={`w-full pl-11 pr-10 py-3 rounded-xl ${inputCls}`} />
            {search && <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-lg">✕</button>}
          </div>
          <div className="flex gap-2">
            {(["all", "free", "paid"] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`px-4 py-2 rounded-xl text-sm font-semibold capitalize transition-colors ${filter === f ? "bg-primary text-white" : "bg-card border border-border text-muted-foreground hover:bg-muted"}`}>
                {f === "paid" ? "Premium" : f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {(filter === "all" || filter === "free") && (
          <section className="mb-16">
            <div className="flex items-center gap-3 mb-6">
              <span className="text-2xl">🆓</span>
              <h2 className="text-2xl font-bold text-foreground">Free Codes</h2>
              <span className="px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 text-xs font-bold border border-green-500/20">{freeCodes.length} available</span>
            </div>
            {freeCodes.length === 0
              ? <div className="text-center py-12 bg-card border border-border rounded-xl text-muted-foreground">No free codes available yet.</div>
              : <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {freeCodes.map(code => (
                    <div key={code.id} className="bg-card border border-border rounded-xl p-4 hover:border-primary/40 transition-colors">
                      <div className="flex items-start justify-between mb-2">
                        <span className="text-lg">{code.emoji || "💎"}</span>
                        <span className="px-2 py-0.5 text-xs rounded-full bg-green-500/10 text-green-400 border border-green-500/20 font-semibold">FREE</span>
                      </div>
                      <h3 className="font-bold text-foreground mb-1">{code.title}</h3>
                      {code.description && <p className="text-sm text-muted-foreground mb-3">{code.description}</p>}
                      {code.code && <div className="relative mt-2"><div className="p-2 pr-16 rounded-lg bg-muted font-mono text-sm text-primary select-all border border-border break-all">{code.code}</div><CopyButton text={code.code} /></div>}
                    </div>
                  ))}
                </div>
            }
          </section>
        )}

        {(filter === "all" || filter === "paid") && (
          <section>
            <div className="flex items-center gap-3 mb-6">
              <span className="text-2xl">🔒</span>
              <h2 className="text-2xl font-bold text-foreground">Premium Codes</h2>
              <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-bold border border-primary/20">{paidCodes.length} available</span>
            </div>
            {paidCodes.length === 0
              ? <div className="text-center py-12 bg-card border border-border rounded-xl text-muted-foreground">No premium codes listed yet.</div>
              : <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {paidCodes.map(code => (
                    <div key={code.id} className="bg-card border border-primary/20 rounded-xl p-4 hover:border-primary/50 transition-colors">
                      <div className="flex items-start justify-between mb-2">
                        <span className="text-lg">{code.emoji || "⭐"}</span>
                        <span className="px-2 py-0.5 text-xs rounded-full bg-primary/10 text-primary border border-primary/20 font-semibold">PREMIUM</span>
                      </div>
                      <h3 className="font-bold text-foreground mb-1">{code.title}</h3>
                      {code.description && <p className="text-sm text-muted-foreground mb-3">{code.description}</p>}
                      {code.link && <a href={code.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 mt-2 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-sm font-semibold border border-primary/20 hover:bg-primary/20 transition-colors">Get Access →</a>}
                    </div>
                  ))}
                </div>
            }
          </section>
        )}
      </main>
    </div>
  );
}

/* ─── Owner Panel ─── */
const OWNER_TABS = ["Manage Codes", "Manage Staff", "Assign Tasks", "Leave Requests", "Promotions", "Announcements", "Statistics"] as const;
type OwnerTab = typeof OWNER_TABS[number];

function OwnerPanel({ onLogout }: { onLogout: () => void }) {
  const [tab, setTab] = useState<OwnerTab>("Manage Codes");
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: codes = [] } = useListCodes();
  const { data: staff = [] } = useListStaff();
  const { data: tasks = [] } = useListTasks();
  const { data: leaves = [] } = useListLeaves();
  const { data: stats } = useGetStats();
  const { data: announcements = [] } = useAnnouncements();
  const { data: promotions = [] } = usePromotionRequests();

  const createCode = useCreateCode();
  const deleteCode = useDeleteCode();
  const createStaff = useCreateStaff();
  const deleteStaff = useDeleteStaff();
  const updateStaff = useUpdateStaff();
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const updateLeave = useUpdateLeave();
  const createAnn = useCreateAnnouncement();
  const deleteAnn = useDeleteAnnouncement();
  const updatePromo = useUpdatePromotion();

  const [codeForm, setCodeForm] = useState({ type: "free", title: "", description: "", code: "", link: "", emoji: "" });
  const [codeFilter, setCodeFilter] = useState<"all" | "free" | "paid">("all");
  const [codeSearch, setCodeSearch] = useState("");
  const [staffForm, setStaffForm] = useState({ username: "", password: "", role: "Trainee" });
  const [taskForm, setTaskForm] = useState({ staffId: "", title: "", description: "", consequence: "" });
  const [taskFilter, setTaskFilter] = useState<"all" | "pending" | "done" | "failed">("all");
  const [leaveFilter, setLeaveFilter] = useState<"all" | "pending" | "approved" | "denied">("all");
  const [promoFilter, setPromoFilter] = useState<"all" | "pending" | "approved" | "denied">("all");
  const [editRoleId, setEditRoleId] = useState<number | null>(null);
  const [editRoleVal, setEditRoleVal] = useState("");
  const [staffSortBy, setStaffSortBy] = useState<"name" | "done" | "failed" | "rate">("name");
  const [annForm, setAnnForm] = useState({ type: "public", title: "", content: "", pinned: false });
  const [annFilter, setAnnFilter] = useState<"all" | "public" | "staff">("all");

  function invalidate(...keys: string[][]) {
    keys.forEach(k => qc.invalidateQueries({ queryKey: k }));
  }
  function invalidateAll() {
    invalidate(getListCodesQueryKey(), getListStaffQueryKey(), getListTasksQueryKey(), getListLeavesQueryKey(), getGetStatsQueryKey(), ["announcements"], ["promotions"]);
  }

  const handleAddCode = (e: React.FormEvent) => {
    e.preventDefault();
    createCode.mutate({ data: codeForm as Parameters<typeof createCode.mutate>[0]["data"] }, {
      onSuccess: () => { invalidate(getListCodesQueryKey()); setCodeForm({ type: "free", title: "", description: "", code: "", link: "", emoji: "" }); toast({ title: "✅ Code added" }); },
    });
  };

  const handleAddStaff = (e: React.FormEvent) => {
    e.preventDefault();
    createStaff.mutate({ data: staffForm }, {
      onSuccess: () => { invalidate(getListStaffQueryKey()); setStaffForm({ username: "", password: "", role: "Trainee" }); toast({ title: "✅ Staff added" }); },
      onError: () => toast({ title: "Username already exists", variant: "destructive" }),
    });
  };

  const handleUpdateRole = (id: number) => updateStaff.mutate({ id, data: { role: editRoleVal } }, {
    onSuccess: () => { invalidate(getListStaffQueryKey()); setEditRoleId(null); toast({ title: "✅ Role updated" }); },
  });

  const handleAssignTask = (e: React.FormEvent) => {
    e.preventDefault();
    const member = staff.find(s => s.id === Number(taskForm.staffId));
    if (!member) return;
    createTask.mutate({ data: { staffId: Number(taskForm.staffId), staffUsername: member.username, title: taskForm.title, description: taskForm.description, consequence: taskForm.consequence } }, {
      onSuccess: () => { invalidate(getListTasksQueryKey()); setTaskForm({ staffId: "", title: "", description: "", consequence: "" }); toast({ title: "✅ Task assigned" }); },
    });
  };

  const handleAddAnn = (e: React.FormEvent) => {
    e.preventDefault();
    createAnn.mutate({ type: annForm.type, title: annForm.title, content: annForm.content, pinned: annForm.pinned }, {
      onSuccess: () => { invalidate(["announcements"]); setAnnForm({ type: "public", title: "", content: "", pinned: false }); toast({ title: "✅ Announcement posted" }); },
    });
  };

  const handlePromoAction = (id: number, status: "approved" | "denied") => updatePromo.mutate({ id, status }, {
    onSuccess: () => { invalidate(["promotions"], getListStaffQueryKey()); toast({ title: status === "approved" ? "⬆️ Promotion approved! Role updated." : "❌ Promotion denied" }); },
  });

  const filteredCodes = codes.filter(c => (codeFilter === "all" || c.type === codeFilter) && (!codeSearch || c.title.toLowerCase().includes(codeSearch.toLowerCase())));
  const filteredTasks = tasks.filter(t => taskFilter === "all" || t.status === taskFilter);
  const filteredLeaves = leaves.filter(l => leaveFilter === "all" || l.status === leaveFilter);
  const filteredPromos = promotions.filter(p => promoFilter === "all" || p.status === promoFilter);
  const filteredAnns = announcements.filter(a => annFilter === "all" || a.type === annFilter);
  const sortedAnns = [...filteredAnns.filter(a => a.pinned === "true"), ...filteredAnns.filter(a => a.pinned !== "true")];
  const sortedStaff = [...staff].sort((a, b) => {
    if (staffSortBy === "name") return a.username.localeCompare(b.username);
    if (staffSortBy === "done") return b.tasksCompleted - a.tasksCompleted;
    if (staffSortBy === "failed") return b.tasksFailed - a.tasksFailed;
    const ra = (a.tasksCompleted + a.tasksFailed) > 0 ? a.tasksCompleted / (a.tasksCompleted + a.tasksFailed) : 0;
    const rb = (b.tasksCompleted + b.tasksFailed) > 0 ? b.tasksCompleted / (b.tasksCompleted + b.tasksFailed) : 0;
    return rb - ra;
  });

  const tabIcons: Record<OwnerTab, string> = { "Manage Codes": "📦", "Manage Staff": "👥", "Assign Tasks": "📋", "Leave Requests": "🏖️", Promotions: "⬆️", Announcements: "📢", Statistics: "📊" };
  const tabBadges: Partial<Record<OwnerTab, number>> = {
    "Leave Requests": leaves.filter(l => l.status === "pending").length || undefined,
    "Assign Tasks": tasks.filter(t => t.status === "pending").length || undefined,
    Promotions: promotions.filter(p => p.status === "pending").length || undefined,
  };

  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b border-border px-6 py-4 flex items-center justify-between sticky top-0 z-50 bg-background/95 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center font-black text-white text-sm">CZ</div>
          <div>
            <span className="font-bold text-base text-foreground">Owner <span className="text-primary">Panel</span></span>
            <p className="text-xs text-muted-foreground">{staff.length} staff · {codes.length} codes</p>
          </div>
        </div>
        <Btn variant="ghost" onClick={onLogout}>← Logout</Btn>
      </nav>

      <div className="max-w-6xl mx-auto px-6 py-6">
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
          {OWNER_TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`relative flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors ${tab === t ? "bg-primary text-white" : "border border-border text-muted-foreground hover:bg-muted"}`}>
              {tabIcons[t]} {t}
              {tabBadges[t] ? <span className={`ml-1 px-1.5 py-0.5 rounded-full text-xs font-bold ${tab === t ? "bg-white/20 text-white" : "bg-primary/20 text-primary"}`}>{tabBadges[t]}</span> : null}
            </button>
          ))}
        </div>

        {/* ── Manage Codes ── */}
        {tab === "Manage Codes" && (
          <div className="space-y-6">
            <form onSubmit={handleAddCode} className="bg-card border border-border rounded-xl p-5">
              <h3 className="font-bold text-foreground mb-4">➕ Add New Code</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                <select value={codeForm.type} onChange={e => setCodeForm(f => ({ ...f, type: e.target.value }))} className={inputCls}>
                  <option value="free">🆓 Free Code</option>
                  <option value="paid">⭐ Premium / Paid</option>
                </select>
                <input required placeholder="Title *" value={codeForm.title} onChange={e => setCodeForm(f => ({ ...f, title: e.target.value }))} className={inputCls} />
                <input placeholder="Emoji (e.g. 🔥)" value={codeForm.emoji} onChange={e => setCodeForm(f => ({ ...f, emoji: e.target.value }))} className={inputCls} />
                <input placeholder="Description" value={codeForm.description} onChange={e => setCodeForm(f => ({ ...f, description: e.target.value }))} className={inputCls} />
                {codeForm.type === "free"
                  ? <input placeholder="Code value *" value={codeForm.code} onChange={e => setCodeForm(f => ({ ...f, code: e.target.value }))} className={`sm:col-span-2 ${inputCls}`} />
                  : <input placeholder="Link (MediaFire / GitHub) *" value={codeForm.link} onChange={e => setCodeForm(f => ({ ...f, link: e.target.value }))} className={`sm:col-span-2 ${inputCls}`} />
                }
              </div>
              <Btn type="submit">Add Code</Btn>
            </form>
            <div>
              <div className="flex items-center gap-3 mb-3 flex-wrap">
                <h3 className="font-bold text-foreground">All Codes <span className="text-muted-foreground font-normal text-sm">({filteredCodes.length})</span></h3>
                <div className="ml-auto flex gap-2 items-center flex-wrap">
                  <input placeholder="Search…" value={codeSearch} onChange={e => setCodeSearch(e.target.value)} className={`w-36 py-1.5 ${inputCls}`} />
                  {(["all", "free", "paid"] as const).map(f => (
                    <button key={f} onClick={() => setCodeFilter(f)} className={`px-2.5 py-1 rounded text-xs font-semibold capitalize transition-colors ${codeFilter === f ? "bg-primary text-white" : "border border-border text-muted-foreground hover:bg-muted"}`}>{f === "paid" ? "Premium" : f}</button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                {filteredCodes.length === 0 && <div className="text-center py-8 bg-card border border-border rounded-xl text-muted-foreground">No codes found.</div>}
                {filteredCodes.map(c => (
                  <div key={c.id} className="flex items-center gap-3 p-3 bg-card border border-border rounded-xl">
                    <span className="text-xl">{c.emoji || (c.type === "free" ? "🆓" : "⭐")}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <span className="font-semibold text-sm text-foreground truncate">{c.title}</span>
                        <span className={`px-1.5 py-0.5 text-xs rounded border font-bold ${c.type === "free" ? "bg-green-500/10 text-green-400 border-green-500/20" : "bg-primary/10 text-primary border-primary/20"}`}>{c.type === "paid" ? "PREMIUM" : "FREE"}</span>
                      </div>
                      {c.description && <p className="text-xs text-muted-foreground truncate">{c.description}</p>}
                      {c.code && <p className="text-xs font-mono text-primary mt-0.5 truncate">{c.code}</p>}
                      {c.link && <p className="text-xs text-primary truncate mt-0.5">{c.link}</p>}
                      <p className="text-xs text-muted-foreground mt-0.5">Added {new Date(c.createdAt).toLocaleDateString()}</p>
                    </div>
                    <Btn variant="danger" className="py-1.5 text-xs" onClick={() => deleteCode.mutate({ id: c.id }, { onSuccess: () => { invalidate(getListCodesQueryKey()); toast({ title: "🗑 Code removed" }); } })}>Remove</Btn>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Manage Staff ── */}
        {tab === "Manage Staff" && (
          <div className="space-y-6">
            <form onSubmit={handleAddStaff} className="bg-card border border-border rounded-xl p-5">
              <h3 className="font-bold text-foreground mb-4">➕ Add Staff Member</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                <input required placeholder="Username *" value={staffForm.username} onChange={e => setStaffForm(f => ({ ...f, username: e.target.value }))} className={inputCls} />
                <input required type="password" placeholder="Password *" value={staffForm.password} onChange={e => setStaffForm(f => ({ ...f, password: e.target.value }))} className={inputCls} />
                <select value={staffForm.role} onChange={e => setStaffForm(f => ({ ...f, role: e.target.value }))} className={inputCls}>
                  {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <Btn type="submit">Add Staff</Btn>
            </form>
            <div>
              <h3 className="font-bold text-foreground mb-3">Staff Members ({staff.length})</h3>
              <div className="space-y-2">
                {staff.length === 0 && <div className="text-center py-8 bg-card border border-border rounded-xl text-muted-foreground">No staff yet.</div>}
                {staff.map(s => (
                  <div key={s.id} className="p-4 bg-card border border-border rounded-xl">
                    <div className="flex items-center gap-3 flex-wrap">
                      <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-black text-base flex-shrink-0">{s.username[0].toUpperCase()}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="font-bold text-sm text-foreground">{s.username}</span>
                          <RoleBadge role={s.role} />
                        </div>
                        <p className="text-xs text-muted-foreground">✅ {s.tasksCompleted} done · ❌ {s.tasksFailed} failed · Joined {new Date(s.createdAt).toLocaleDateString()}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {editRoleId === s.id ? (
                          <>
                            <select value={editRoleVal} onChange={e => setEditRoleVal(e.target.value)} className={`py-1 text-xs ${inputCls}`}>{ROLES.map(r => <option key={r} value={r}>{r}</option>)}</select>
                            <Btn className="py-1.5 text-xs" onClick={() => handleUpdateRole(s.id)}>Save</Btn>
                            <Btn variant="ghost" className="py-1.5 text-xs" onClick={() => setEditRoleId(null)}>✕</Btn>
                          </>
                        ) : (
                          <Btn variant="outline" className="py-1.5 text-xs" onClick={() => { setEditRoleId(s.id); setEditRoleVal(s.role); }}>Edit Role</Btn>
                        )}
                        <Btn variant="danger" className="py-1.5 text-xs" onClick={() => deleteStaff.mutate({ id: s.id }, { onSuccess: () => { invalidate(getListStaffQueryKey()); toast({ title: "🗑 Staff removed" }); } })}>Remove</Btn>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Assign Tasks ── */}
        {tab === "Assign Tasks" && (
          <div className="space-y-6">
            <form onSubmit={handleAssignTask} className="bg-card border border-border rounded-xl p-5">
              <h3 className="font-bold text-foreground mb-4">📋 Assign Task</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                <select required value={taskForm.staffId} onChange={e => setTaskForm(f => ({ ...f, staffId: e.target.value }))} className={inputCls}>
                  <option value="">Select staff member *</option>
                  {staff.map(s => <option key={s.id} value={s.id}>{s.username} — {s.role}</option>)}
                </select>
                <input required placeholder="Task title *" value={taskForm.title} onChange={e => setTaskForm(f => ({ ...f, title: e.target.value }))} className={inputCls} />
                <textarea required placeholder="Task description *" value={taskForm.description} onChange={e => setTaskForm(f => ({ ...f, description: e.target.value }))} rows={3} className={`sm:col-span-2 resize-none ${inputCls}`} />
                <input placeholder="Consequence if not done (e.g. Demotion)" value={taskForm.consequence} onChange={e => setTaskForm(f => ({ ...f, consequence: e.target.value }))} className={`sm:col-span-2 ${inputCls}`} />
              </div>
              <Btn type="submit">Assign Task</Btn>
            </form>
            <div>
              <div className="flex items-center gap-3 mb-3 flex-wrap">
                <h3 className="font-bold text-foreground">All Tasks <span className="text-muted-foreground font-normal text-sm">({filteredTasks.length})</span></h3>
                <div className="ml-auto flex gap-2">
                  {(["all", "pending", "done", "failed"] as const).map(f => (
                    <button key={f} onClick={() => setTaskFilter(f)} className={`px-2.5 py-1 rounded text-xs font-semibold capitalize transition-colors ${taskFilter === f ? "bg-primary text-white" : "border border-border text-muted-foreground hover:bg-muted"}`}>{f}</button>
                  ))}
                </div>
              </div>
              <div className="space-y-3">
                {filteredTasks.length === 0 && <div className="text-center py-8 bg-card border border-border rounded-xl text-muted-foreground">No tasks found.</div>}
                {filteredTasks.map(t => (
                  <div key={t.id} className="p-4 bg-card border border-border rounded-xl">
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="font-semibold text-sm text-foreground">{t.title}</span>
                          <StatusBadge status={t.status} />
                        </div>
                        <p className="text-xs text-muted-foreground mb-1">👤 <span className="text-foreground font-medium">{t.staffUsername}</span></p>
                        <p className="text-sm text-muted-foreground">{t.description}</p>
                        {t.consequence && <p className="text-xs text-red-400 mt-1.5">⚠️ Consequence: {t.consequence}</p>}
                        <p className="text-xs text-muted-foreground mt-1.5">Assigned {new Date(t.createdAt).toLocaleString()}</p>
                        {t.doneAt && <p className="text-xs text-green-400">✅ Completed {new Date(t.doneAt).toLocaleString()}</p>}
                      </div>
                      <div className="flex flex-col gap-2 flex-shrink-0">
                        {t.status === "pending" && <Btn variant="danger" className="py-1.5 text-xs" onClick={() => updateTask.mutate({ id: t.id, data: { status: "failed" } }, { onSuccess: () => { invalidate(getListTasksQueryKey()); toast({ title: "⚠️ Marked failed" }); } })}>Mark Failed</Btn>}
                        <Btn variant="ghost" className="py-1.5 text-xs" onClick={() => deleteTask.mutate({ id: t.id }, { onSuccess: () => { invalidate(getListTasksQueryKey()); toast({ title: "🗑 Deleted" }); } })}>Delete</Btn>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Leave Requests ── */}
        {tab === "Leave Requests" && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 flex-wrap">
              <h3 className="font-bold text-foreground">Leave Requests <span className="text-muted-foreground font-normal text-sm">({filteredLeaves.length})</span></h3>
              <div className="ml-auto flex gap-2">
                {(["all", "pending", "approved", "denied"] as const).map(f => (
                  <button key={f} onClick={() => setLeaveFilter(f)} className={`px-2.5 py-1 rounded text-xs font-semibold capitalize transition-colors ${leaveFilter === f ? "bg-primary text-white" : "border border-border text-muted-foreground hover:bg-muted"}`}>{f}</button>
                ))}
              </div>
            </div>
            {filteredLeaves.length === 0 && <div className="text-center py-12 bg-card border border-border rounded-xl text-muted-foreground">No leave requests found.</div>}
            {filteredLeaves.map(l => (
              <div key={l.id} className="p-4 bg-card border border-border rounded-xl">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-sm flex-shrink-0">{l.staffUsername[0].toUpperCase()}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-semibold text-sm text-foreground">{l.staffUsername}</span>
                      <StatusBadge status={l.status} />
                    </div>
                    <p className="text-sm text-muted-foreground">{l.reason}</p>
                    <p className="text-xs text-muted-foreground mt-1">Requested: {new Date(l.createdAt).toLocaleString()}</p>
                    {l.reviewedAt && <p className="text-xs text-muted-foreground">Reviewed: {new Date(l.reviewedAt).toLocaleString()}</p>}
                  </div>
                  {l.status === "pending" && (
                    <div className="flex gap-2 flex-shrink-0">
                      <button onClick={() => updateLeave.mutate({ id: l.id, data: { status: "approved" } }, { onSuccess: () => { invalidate(getListLeavesQueryKey()); toast({ title: "✅ Approved" }); } })} className="px-3 py-1.5 rounded-lg bg-green-500/10 text-green-400 text-xs font-semibold border border-green-500/20 hover:bg-green-500/20 transition-colors">✅ Approve</button>
                      <Btn variant="danger" className="py-1.5 text-xs" onClick={() => updateLeave.mutate({ id: l.id, data: { status: "denied" } }, { onSuccess: () => { invalidate(getListLeavesQueryKey()); toast({ title: "❌ Denied" }); } })}>❌ Deny</Btn>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Promotions ── */}
        {tab === "Promotions" && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 flex-wrap">
              <h3 className="font-bold text-foreground">Promotion Requests <span className="text-muted-foreground font-normal text-sm">({filteredPromos.length})</span></h3>
              <div className="ml-auto flex gap-2">
                {(["all", "pending", "approved", "denied"] as const).map(f => (
                  <button key={f} onClick={() => setPromoFilter(f)} className={`px-2.5 py-1 rounded text-xs font-semibold capitalize transition-colors ${promoFilter === f ? "bg-primary text-white" : "border border-border text-muted-foreground hover:bg-muted"}`}>{f}</button>
                ))}
              </div>
            </div>
            {filteredPromos.length === 0 && (
              <div className="text-center py-16 bg-card border border-border rounded-xl">
                <p className="text-3xl mb-3">⬆️</p>
                <p className="text-muted-foreground font-medium">No promotion requests yet.</p>
                <p className="text-xs text-muted-foreground mt-1">Staff can request promotions from their panel.</p>
              </div>
            )}
            {filteredPromos.map(p => (
              <div key={p.id} className={`p-4 bg-card border rounded-xl ${p.status === "pending" ? "border-yellow-500/30" : p.status === "approved" ? "border-green-500/30" : "border-border"}`}>
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-black text-base flex-shrink-0">{p.staffUsername[0].toUpperCase()}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <span className="font-bold text-sm text-foreground">{p.staffUsername}</span>
                      <StatusBadge status={p.status} />
                    </div>
                    <div className="flex items-center gap-3 mb-2">
                      <RoleBadge role={p.currentRole} />
                      <span className="text-muted-foreground text-sm">→</span>
                      <RoleBadge role={p.requestedRole} />
                    </div>
                    <p className="text-sm text-muted-foreground">"{p.reason}"</p>
                    <p className="text-xs text-muted-foreground mt-1.5">Requested {new Date(p.createdAt).toLocaleString()}</p>
                    {p.reviewedAt && <p className="text-xs text-muted-foreground">Reviewed {new Date(p.reviewedAt).toLocaleString()}</p>}
                  </div>
                  {p.status === "pending" && (
                    <div className="flex flex-col gap-2 flex-shrink-0">
                      <button onClick={() => handlePromoAction(p.id, "approved")} className="px-3 py-1.5 rounded-lg bg-green-500/10 text-green-400 text-xs font-semibold border border-green-500/20 hover:bg-green-500/20 transition-colors">⬆️ Approve</button>
                      <Btn variant="danger" className="py-1.5 text-xs" onClick={() => handlePromoAction(p.id, "denied")}>❌ Deny</Btn>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Announcements ── */}
        {tab === "Announcements" && (
          <div className="space-y-6">
            <form onSubmit={handleAddAnn} className="bg-card border border-border rounded-xl p-5">
              <h3 className="font-bold text-foreground mb-4">📢 Post Announcement</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                <select value={annForm.type} onChange={e => setAnnForm(f => ({ ...f, type: e.target.value }))} className={inputCls}>
                  <option value="public">🌍 Public — shown on homepage</option>
                  <option value="staff">🔒 Staff only — shown in staff panel</option>
                </select>
                <input required placeholder="Title *" value={annForm.title} onChange={e => setAnnForm(f => ({ ...f, title: e.target.value }))} className={inputCls} />
                <textarea required placeholder="Content *" value={annForm.content} onChange={e => setAnnForm(f => ({ ...f, content: e.target.value }))} rows={3} className={`sm:col-span-2 resize-none ${inputCls}`} />
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input type="checkbox" checked={annForm.pinned} onChange={e => setAnnForm(f => ({ ...f, pinned: e.target.checked }))} className="w-4 h-4 accent-primary" />
                  <span className="text-sm text-foreground">📌 Pin this announcement</span>
                </label>
              </div>
              <Btn type="submit">Post Announcement</Btn>
            </form>
            <div>
              <div className="flex items-center gap-3 mb-3 flex-wrap">
                <h3 className="font-bold text-foreground">All Announcements <span className="text-muted-foreground font-normal text-sm">({filteredAnns.length})</span></h3>
                <div className="ml-auto flex gap-2">
                  {(["all", "public", "staff"] as const).map(f => (
                    <button key={f} onClick={() => setAnnFilter(f)} className={`px-2.5 py-1 rounded text-xs font-semibold capitalize transition-colors ${annFilter === f ? "bg-primary text-white" : "border border-border text-muted-foreground hover:bg-muted"}`}>{f}</button>
                  ))}
                </div>
              </div>
              {sortedAnns.length === 0 && <div className="text-center py-8 bg-card border border-border rounded-xl text-muted-foreground">No announcements yet.</div>}
              <div className="space-y-3">
                {sortedAnns.map(a => (
                  <div key={a.id} className={`p-4 rounded-xl border ${a.pinned === "true" ? "bg-primary/5 border-primary/30" : "bg-card border-border"}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          {a.pinned === "true" && <span className="text-xs text-primary font-bold">📌 PINNED</span>}
                          <span className={`px-1.5 py-0.5 text-xs rounded border font-semibold ${a.type === "public" ? "bg-green-500/10 text-green-400 border-green-500/20" : "bg-orange-500/10 text-orange-400 border-orange-500/20"}`}>{a.type === "public" ? "🌍 Public" : "🔒 Staff"}</span>
                          <span className="font-bold text-sm text-foreground">{a.title}</span>
                        </div>
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap">{a.content}</p>
                        <p className="text-xs text-muted-foreground mt-2">{new Date(a.createdAt).toLocaleString()}</p>
                      </div>
                      <button onClick={() => deleteAnn.mutate(a.id, { onSuccess: () => { invalidate(["announcements"]); toast({ title: "🗑 Removed" }); } })} className="flex-shrink-0 px-2 py-1 rounded text-xs text-destructive border border-destructive/20 bg-destructive/5 hover:bg-destructive/20 transition-colors">🗑</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Statistics ── */}
        {tab === "Statistics" && (
          <div className="space-y-8">
            {stats && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: "Total Codes", value: stats.totalCodes, color: "text-primary", icon: "📦" },
                  { label: "Free Codes", value: stats.freeCodes, color: "text-green-400", icon: "🆓" },
                  { label: "Premium Codes", value: stats.paidCodes, color: "text-yellow-400", icon: "⭐" },
                  { label: "Total Staff", value: stats.totalStaff, color: "text-blue-400", icon: "👥" },
                  { label: "Tasks Done", value: stats.completedTasks, color: "text-green-400", icon: "✅" },
                  { label: "Tasks Pending", value: stats.pendingTasks, color: "text-yellow-400", icon: "⏳" },
                  { label: "Tasks Failed", value: stats.failedTasks, color: "text-red-400", icon: "❌" },
                  { label: "Leaves Pending", value: stats.pendingLeaves, color: "text-orange-400", icon: "🏖️" },
                ].map(s => (
                  <div key={s.label} className="bg-card border border-border rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-1"><span>{s.icon}</span><p className="text-xs text-muted-foreground">{s.label}</p></div>
                    <p className={`text-3xl font-black ${s.color}`}>{s.value}</p>
                  </div>
                ))}
              </div>
            )}
            <div>
              <div className="flex items-center gap-3 mb-4 flex-wrap">
                <h3 className="font-bold text-foreground text-lg">👥 Staff Overview</h3>
                <div className="ml-auto flex items-center gap-2 text-xs flex-wrap">
                  <span className="text-muted-foreground">Sort:</span>
                  {(["name", "done", "failed", "rate"] as const).map(s => (
                    <button key={s} onClick={() => setStaffSortBy(s)} className={`px-2.5 py-1 rounded capitalize font-semibold transition-colors ${staffSortBy === s ? "bg-primary text-white" : "border border-border text-muted-foreground hover:bg-muted"}`}>{s === "rate" ? "Success %" : s}</button>
                  ))}
                </div>
              </div>
              {sortedStaff.length === 0 && <div className="text-center py-12 bg-card border border-border rounded-xl text-muted-foreground">No staff yet.</div>}
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      {["#", "Staff Member", "Role", "✅ Done", "❌ Failed", "Total", "Success Rate", "Joined"].map(h => (
                        <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedStaff.map((s, i) => {
                      const total = s.tasksCompleted + s.tasksFailed;
                      const rate = total > 0 ? Math.round((s.tasksCompleted / total) * 100) : 0;
                      const rc = rate >= 80 ? "text-green-400" : rate >= 50 ? "text-yellow-400" : "text-red-400";
                      const bc = rate >= 80 ? "bg-green-500" : rate >= 50 ? "bg-yellow-500" : "bg-red-500";
                      return (
                        <tr key={s.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-3 text-xs text-muted-foreground font-mono">{i + 1}</td>
                          <td className="px-4 py-3"><div className="flex items-center gap-2"><div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-xs">{s.username[0].toUpperCase()}</div><span className="text-sm font-semibold text-foreground">{s.username}</span></div></td>
                          <td className="px-4 py-3"><RoleBadge role={s.role} /></td>
                          <td className="px-4 py-3 text-center text-sm font-bold text-green-400">{s.tasksCompleted}</td>
                          <td className="px-4 py-3 text-center text-sm font-bold text-red-400">{s.tasksFailed}</td>
                          <td className="px-4 py-3 text-center text-sm font-semibold text-foreground">{total}</td>
                          <td className="px-4 py-3"><div className="flex items-center gap-2 min-w-24"><div className="flex-1 h-1.5 rounded-full bg-muted"><div className={`h-full rounded-full ${bc}`} style={{ width: `${rate}%` }} /></div><span className={`text-xs font-bold ${rc} w-8 text-right`}>{rate}%</span></div></td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(s.createdAt).toLocaleDateString()}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Staff Panel ─── */
function StaffPanel({ staffMember: initialMember, onLogout }: { staffMember: StaffMember; onLogout: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: staff = [] } = useListStaff();
  const staffMember = staff.find(s => s.id === initialMember.id) ?? initialMember;
  const { data: tasks = [] } = useListTasks();
  const { data: leaves = [] } = useListLeaves();
  const { data: staffAnns = [] } = useAnnouncements("staff");
  const { data: myPromos = [] } = usePromotionRequests(staffMember.id);
  const [leaveReason, setLeaveReason] = useState("");
  const [showLeaveForm, setShowLeaveForm] = useState(false);
  const [showPromoForm, setShowPromoForm] = useState(false);
  const [taskFilter, setTaskFilter] = useState<"all" | "pending" | "done" | "failed">("all");
  const [promoRole, setPromoRole] = useState("");
  const [promoReason, setPromoReason] = useState("");
  const updateTask = useUpdateTask();
  const createLeave = useCreateLeave();
  const createPromo = useCreatePromotion();

  const myTasks = tasks.filter(t => t.staffId === staffMember.id);
  const myLeaves = leaves.filter(l => l.staffId === staffMember.id);
  const filteredTasks = myTasks.filter(t => taskFilter === "all" || t.status === taskFilter);
  const sortedAnns = [...staffAnns.filter(a => a.pinned === "true"), ...staffAnns.filter(a => a.pinned !== "true")];
  const hasPendingPromo = myPromos.some(p => p.status === "pending");

  const done = myTasks.filter(t => t.status === "done").length;
  const failed = myTasks.filter(t => t.status === "failed").length;
  const pending = myTasks.filter(t => t.status === "pending").length;
  const total = done + failed;
  const rate = total > 0 ? Math.round((done / total) * 100) : 0;
  const rateColor = rate >= 80 ? "text-green-400" : rate >= 50 ? "text-yellow-400" : total === 0 ? "text-muted-foreground" : "text-red-400";
  const barColor = rate >= 80 ? "bg-green-500" : rate >= 50 ? "bg-yellow-500" : total === 0 ? "bg-muted" : "bg-red-500";
  const grade = rate >= 90 ? "S" : rate >= 75 ? "A" : rate >= 55 ? "B" : rate >= 35 ? "C" : total === 0 ? "—" : "D";
  const gradeColor = rate >= 90 ? "text-green-400 border-green-500/30 bg-green-500/10" : rate >= 75 ? "text-blue-400 border-blue-500/30 bg-blue-500/10" : rate >= 55 ? "text-yellow-400 border-yellow-500/30 bg-yellow-500/10" : total === 0 ? "text-muted-foreground border-border bg-muted" : "text-red-400 border-red-500/30 bg-red-500/10";

  const availableRoles = ROLES.filter(r => r !== staffMember.role);

  const handleApplyLeave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!leaveReason.trim()) return;
    createLeave.mutate({ data: { staffId: staffMember.id, staffUsername: staffMember.username, reason: leaveReason } }, {
      onSuccess: () => { qc.invalidateQueries({ queryKey: getListLeavesQueryKey() }); setLeaveReason(""); setShowLeaveForm(false); toast({ title: "📤 Leave request submitted" }); },
    });
  };

  const handleRequestPromo = (e: React.FormEvent) => {
    e.preventDefault();
    if (!promoRole || !promoReason.trim()) return;
    createPromo.mutate({ staffId: staffMember.id, staffUsername: staffMember.username, currentRole: staffMember.role, requestedRole: promoRole, reason: promoReason }, {
      onSuccess: () => { qc.invalidateQueries({ queryKey: ["promotions"] }); setPromoRole(""); setPromoReason(""); setShowPromoForm(false); toast({ title: "⬆️ Promotion request sent to owner" }); },
      onError: (err: Error) => toast({ title: err.message || "Could not submit request", variant: "destructive" }),
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b border-border px-6 py-4 flex items-center justify-between sticky top-0 z-50 bg-background/95 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center text-primary font-black">{staffMember.username[0].toUpperCase()}</div>
          <div>
            <p className="font-bold text-sm text-foreground">{staffMember.username}</p>
            <RoleBadge role={staffMember.role} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowPromoForm(true)} disabled={hasPendingPromo} title={hasPendingPromo ? "You have a pending promotion request" : ""}
            className="px-3 py-2 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed">⬆️ Request Promotion</button>
          <button onClick={() => setShowLeaveForm(true)} className="px-3 py-2 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-muted transition-colors">🏖️ Apply Leave</button>
          <button onClick={onLogout} className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors">← Logout</button>
        </div>
      </nav>

      {showLeaveForm && (
        <Modal title="Apply for Leave" onClose={() => setShowLeaveForm(false)}>
          <p className="text-xs text-muted-foreground -mt-2 mb-3">Your request will be sent to the owner for review.</p>
          <form onSubmit={handleApplyLeave} className="flex flex-col gap-3">
            <textarea placeholder="Reason for leave…" value={leaveReason} onChange={e => setLeaveReason(e.target.value)} rows={4} required className={`resize-none w-full ${inputCls}`} autoFocus />
            <div className="flex gap-2">
              <button type="submit" className="flex-1 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90">Submit</button>
              <button type="button" onClick={() => setShowLeaveForm(false)} className="flex-1 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:bg-muted">Cancel</button>
            </div>
          </form>
        </Modal>
      )}

      {showPromoForm && (
        <Modal title="⬆️ Request Promotion" onClose={() => setShowPromoForm(false)}>
          <p className="text-xs text-muted-foreground -mt-2 mb-3">Select the role you're applying for and explain why you deserve it.</p>
          <form onSubmit={handleRequestPromo} className="flex flex-col gap-3">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Current role</p>
              <RoleBadge role={staffMember.role} />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Requested role *</p>
              <select required value={promoRole} onChange={e => setPromoRole(e.target.value)} className={`w-full ${inputCls}`}>
                <option value="">Select a role…</option>
                {availableRoles.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <textarea placeholder="Why do you deserve this promotion? *" value={promoReason} onChange={e => setPromoReason(e.target.value)} rows={4} required className={`resize-none w-full ${inputCls}`} />
            <div className="flex gap-2">
              <button type="submit" className="flex-1 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90">Submit Request</button>
              <button type="button" onClick={() => setShowPromoForm(false)} className="flex-1 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:bg-muted">Cancel</button>
            </div>
          </form>
        </Modal>
      )}

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-8">
        {/* Stats */}
        <div className="bg-card border border-border rounded-2xl p-6">
          <h2 className="font-bold text-foreground text-base mb-5">📊 My Statistics</h2>
          <div className="flex flex-col sm:flex-row gap-6">
            <div className="flex flex-col items-center gap-3 sm:w-36 flex-shrink-0">
              <div className="w-16 h-16 rounded-full bg-primary/20 border-2 border-primary/40 flex items-center justify-center text-primary font-black text-2xl">{staffMember.username[0].toUpperCase()}</div>
              <div className="text-center"><p className="font-bold text-sm text-foreground">{staffMember.username}</p><RoleBadge role={staffMember.role} /></div>
              <div className={`w-14 h-14 rounded-xl border-2 flex items-center justify-center font-black text-2xl ${gradeColor}`}>{grade}</div>
              <p className="text-xs text-muted-foreground text-center">Performance</p>
            </div>
            <div className="flex-1 space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-muted-foreground font-medium">Success Rate</span>
                  <span className={`text-sm font-black ${rateColor}`}>{total === 0 ? "No tasks yet" : `${rate}%`}</span>
                </div>
                <div className="h-2.5 rounded-full bg-muted overflow-hidden"><div className={`h-full rounded-full ${barColor} transition-all duration-500`} style={{ width: `${rate}%` }} /></div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: "Completed", value: done, icon: "✅", color: "text-green-400", bg: "bg-green-500/5 border-green-500/20" },
                  { label: "Pending", value: pending, icon: "⏳", color: "text-yellow-400", bg: "bg-yellow-500/5 border-yellow-500/20" },
                  { label: "Failed", value: failed, icon: "❌", color: "text-red-400", bg: "bg-red-500/5 border-red-500/20" },
                  { label: "Leaves", value: myLeaves.length, icon: "🏖️", color: "text-blue-400", bg: "bg-blue-500/5 border-blue-500/20" },
                ].map(s => (
                  <div key={s.label} className={`border rounded-xl p-3 text-center ${s.bg}`}>
                    <p className="text-base mb-0.5">{s.icon}</p>
                    <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground pt-1">
                <span>🗓 Joined: <span className="text-foreground font-medium">{new Date(staffMember.createdAt).toLocaleDateString()}</span></span>
                <span>📋 Total assigned: <span className="text-foreground font-medium">{myTasks.length}</span></span>
                <span>🏖 Approved leaves: <span className="text-foreground font-medium">{myLeaves.filter(l => l.status === "approved").length}</span></span>
              </div>
            </div>
          </div>
        </div>

        {/* My Promotion Requests */}
        {myPromos.length > 0 && (
          <div className="bg-card border border-border rounded-xl p-5">
            <h2 className="font-bold text-foreground mb-3">⬆️ My Promotion Requests</h2>
            <div className="space-y-2">
              {myPromos.map(p => (
                <div key={p.id} className={`p-3 rounded-lg border ${p.status === "pending" ? "border-yellow-500/30 bg-yellow-500/5" : p.status === "approved" ? "border-green-500/30 bg-green-500/5" : "border-border"}`}>
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex items-center gap-2"><RoleBadge role={p.currentRole} /><span className="text-muted-foreground">→</span><RoleBadge role={p.requestedRole} /></div>
                    <StatusBadge status={p.status} />
                    <span className="text-xs text-muted-foreground ml-auto">{new Date(p.createdAt).toLocaleDateString()}</span>
                  </div>
                  {p.status === "approved" && <p className="text-xs text-green-400 mt-1.5 font-semibold">🎉 Congratulations! Your role has been updated.</p>}
                  {p.status === "denied" && <p className="text-xs text-muted-foreground mt-1.5">Keep working hard and try again later.</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Staff Announcements */}
        {sortedAnns.length > 0 && (
          <div>
            <h2 className="font-bold text-foreground text-lg mb-3">📢 Staff Announcements</h2>
            <div className="space-y-3">{sortedAnns.map(a => <AnnouncementCard key={a.id} ann={a} />)}</div>
          </div>
        )}

        {pending > 0 && (
          <div className="p-4 bg-yellow-500/5 border border-yellow-500/20 rounded-xl">
            <p className="text-sm font-semibold text-yellow-400">⚠️ You have {pending} pending task{pending !== 1 ? "s" : ""} — complete them to avoid consequences.</p>
          </div>
        )}

        {/* Tasks */}
        <div>
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <h2 className="font-bold text-foreground text-lg">My Tasks</h2>
            <div className="ml-auto flex gap-2">
              {(["all", "pending", "done", "failed"] as const).map(f => (
                <button key={f} onClick={() => setTaskFilter(f)} className={`px-2.5 py-1 rounded text-xs font-semibold capitalize transition-colors ${taskFilter === f ? "bg-primary text-white" : "border border-border text-muted-foreground hover:bg-muted"}`}>{f}</button>
              ))}
            </div>
          </div>
          {filteredTasks.length === 0 && <div className="text-center py-12 bg-card border border-border rounded-xl text-muted-foreground">No tasks found.</div>}
          <div className="space-y-3">
            {filteredTasks.map(t => (
              <div key={t.id} className={`p-4 bg-card border rounded-xl ${t.status === "pending" ? "border-yellow-500/30" : t.status === "done" ? "border-green-500/30" : "border-red-500/30"}`}>
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-semibold text-sm text-foreground">{t.title}</span>
                      <StatusBadge status={t.status} />
                    </div>
                    <p className="text-sm text-muted-foreground">{t.description}</p>
                    {t.consequence && <p className="text-xs text-red-400 mt-1.5">⚠️ Consequence: <span className="font-semibold">{t.consequence}</span></p>}
                    <p className="text-xs text-muted-foreground mt-1.5">Assigned {new Date(t.createdAt).toLocaleString()}</p>
                    {t.doneAt && <p className="text-xs text-green-400">✅ Completed {new Date(t.doneAt).toLocaleString()}</p>}
                  </div>
                  {t.status === "pending" && (
                    <button onClick={() => updateTask.mutate({ id: t.id, data: { status: "done" } }, { onSuccess: () => { qc.invalidateQueries({ queryKey: getListTasksQueryKey() }); toast({ title: "✅ Task marked as complete!" }); } })}
                      className="flex-shrink-0 w-11 h-11 rounded-full bg-green-500/10 border-2 border-green-500/40 text-green-400 text-xl flex items-center justify-center hover:bg-green-500/25 hover:border-green-500/60 transition-all font-bold" title="Mark as done">✓</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Leave history */}
        <div>
          <h2 className="font-bold text-foreground text-lg mb-3">My Leave Requests</h2>
          {myLeaves.length === 0 && <div className="text-center py-8 bg-card border border-border rounded-xl text-muted-foreground">No leave requests yet.</div>}
          <div className="space-y-2">
            {myLeaves.map(l => (
              <div key={l.id} className="p-4 bg-card border border-border rounded-xl">
                <div className="flex items-start justify-between gap-3">
                  <div><div className="flex items-center gap-2 mb-1"><StatusBadge status={l.status} /></div><p className="text-sm text-muted-foreground">{l.reason}</p><p className="text-xs text-muted-foreground mt-1">{new Date(l.createdAt).toLocaleString()}</p></div>
                  {l.reviewedAt && <p className="text-xs text-muted-foreground flex-shrink-0">Reviewed {new Date(l.reviewedAt).toLocaleDateString()}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── App Shell ─── */
type AppView = { kind: "public" } | { kind: "owner" } | { kind: "staff"; member: StaffMember };

function AppShell() {
  const [view, setView] = useState<AppView>({ kind: "public" });
  if (view.kind === "owner") return <OwnerPanel onLogout={() => setView({ kind: "public" })} />;
  if (view.kind === "staff") return <StaffPanel staffMember={view.member} onLogout={() => setView({ kind: "public" })} />;
  return <PublicSite onOwnerLogin={() => setView({ kind: "owner" })} onStaffLogin={(m) => setView({ kind: "staff", member: m })} />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Switch><Route path="/" component={AppShell} /></Switch>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
