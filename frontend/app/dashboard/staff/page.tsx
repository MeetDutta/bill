"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { userApi } from "@/services/api";
import type { User as UserType } from "@/types";
import { parseApiError, formatDate } from "@/lib/utils";
import {
  Users,
  UserPlus,
  Shield,
  Search,
  Mail,
  Phone,
  CheckCircle2,
  XCircle,
  Edit2,
  Lock,
  AlertCircle,
  Loader2,
  Filter,
  ShieldAlert,
  UserCheck,
} from "lucide-react";

const ROLE_LABELS: Record<string, { label: string; color: string; desc: string }> = {
  super_admin: {
    label: "Super Admin",
    color: "bg-purple-100 text-purple-800 border-purple-200",
    desc: "Complete platform & organization control",
  },
  org_admin: {
    label: "Admin / Owner",
    color: "bg-indigo-100 text-indigo-800 border-indigo-200",
    desc: "Full organization, financial & staff administration",
  },
  store_manager: {
    label: "Store Manager",
    color: "bg-blue-100 text-blue-800 border-blue-200",
    desc: "Store management, inventory & cashier supervision",
  },
  manager: {
    label: "Manager",
    color: "bg-blue-100 text-blue-800 border-blue-200",
    desc: "Store operations and sales oversight",
  },
  cashier: {
    label: "Cashier",
    color: "bg-emerald-100 text-emerald-800 border-emerald-200",
    desc: "Point of Sale billing, payments & invoices",
  },
  inventory: {
    label: "Inventory Staff",
    color: "bg-amber-100 text-amber-800 border-amber-200",
    desc: "Products, stock adjustments & supplier purchase orders",
  },
  staff: {
    label: "Staff (Legacy)",
    color: "bg-slate-100 text-slate-800 border-slate-200",
    desc: "General store operations",
  },
};

export default function StaffManagementPage() {
  const [users, setUsers] = useState<UserType[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  // Create Modal State
  const [createOpen, setCreateOpen] = useState(false);
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState("");
  const [createForm, setCreateForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    role: "cashier",
    password: "",
    is_active: true,
  });

  // Edit Modal State
  const [editOpen, setEditOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserType | null>(null);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState("");
  const [editForm, setEditForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    role: "cashier",
    is_active: true,
    password: "",
  });

  // General Notification / Error
  const [actionMessage, setActionMessage] = useState("");
  const [actionError, setActionError] = useState("");

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setActionError("");
    try {
      const res = await userApi.list({
        search: search.trim() || undefined,
        role: roleFilter !== "all" ? roleFilter : undefined,
        is_active: statusFilter === "active" ? true : statusFilter === "inactive" ? false : undefined,
      });
      setUsers(res.data.results || []);
    } catch (err) {
      setActionError(parseApiError(err, "Failed to load staff records. Ensure you have administrator permissions."));
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [search, roleFilter, statusFilter]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleOpenCreate = () => {
    setCreateForm({
      first_name: "",
      last_name: "",
      email: "",
      phone: "",
      role: "cashier",
      password: "",
      is_active: true,
    });
    setCreateError("");
    setCreateOpen(true);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.first_name.trim() || !createForm.email.trim() || !createForm.password.trim()) {
      setCreateError("First Name, Email, and Password (min 8 chars) are required.");
      return;
    }
    if (createForm.password.length < 8) {
      setCreateError("Password must be at least 8 characters.");
      return;
    }

    setCreateSubmitting(true);
    setCreateError("");
    try {
      await userApi.create(createForm);
      setActionMessage(`Staff account for ${createForm.first_name} created successfully.`);
      setCreateOpen(false);
      fetchUsers();
    } catch (err) {
      setCreateError(parseApiError(err, "Failed to create staff account."));
    } finally {
      setCreateSubmitting(false);
    }
  };

  const handleOpenEdit = (u: UserType) => {
    setEditingUser(u);
    setEditForm({
      first_name: u.first_name || "",
      last_name: u.last_name || "",
      email: u.email || "",
      phone: u.phone || "",
      role: u.role || "staff",
      is_active: u.is_active ?? true,
      password: "",
    });
    setEditError("");
    setEditOpen(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    setEditSubmitting(true);
    setEditError("");
    try {
      const payload: Partial<UserType> & { password?: string } = {
        first_name: editForm.first_name.trim(),
        last_name: editForm.last_name.trim(),
        phone: editForm.phone.trim(),
        role: editForm.role,
        is_active: editForm.is_active,
      };
      if (editForm.password.trim()) {
        if (editForm.password.length < 8) {
          setEditError("Password must be at least 8 characters.");
          setEditSubmitting(false);
          return;
        }
        payload.password = editForm.password.trim();
      }

      await userApi.update(editingUser.id, payload);
      setActionMessage(`Updated staff details for ${editForm.first_name}.`);
      setEditOpen(false);
      fetchUsers();
    } catch (err) {
      setEditError(parseApiError(err, "Failed to update staff account."));
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleToggleStatus = async (u: UserType) => {
    const newStatus = !u.is_active;
    const actionName = newStatus ? "activate" : "deactivate";
    if (!confirm(`Are you sure you want to ${actionName} ${u.first_name} ${u.last_name}?`)) {
      return;
    }

    setActionError("");
    setActionMessage("");
    try {
      await userApi.update(u.id, { is_active: newStatus });
      setActionMessage(`Account for ${u.first_name} has been ${actionName}d.`);
      fetchUsers();
    } catch (err) {
      setActionError(parseApiError(err, `Failed to ${actionName} account.`));
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Users className="h-6 w-6 text-primary" />
            Staff Management & Access Control
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage organization team members, assign operational roles, and enforce security policies.
          </p>
        </div>
        <Button onClick={handleOpenCreate} className="gap-2 shadow-sm">
          <UserPlus className="h-4 w-4" />
          Add Staff Member
        </Button>
      </div>

      {/* Global Action Messages */}
      {actionMessage && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            <span>{actionMessage}</span>
          </div>
          <button onClick={() => setActionMessage("")} className="text-xs font-semibold hover:underline">
            Dismiss
          </button>
        </div>
      )}

      {actionError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
            <span>{actionError}</span>
          </div>
          <button onClick={() => setActionError("")} className="text-xs font-semibold hover:underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
            <div className="relative sm:col-span-6">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search staff by name, email, phone..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>

            <div className="sm:col-span-3">
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="all">All Roles</option>
                <option value="org_admin">Admin / Owner</option>
                <option value="store_manager">Store Manager</option>
                <option value="cashier">Cashier</option>
                <option value="inventory">Inventory Staff</option>
                <option value="staff">Staff (General)</option>
              </select>
            </div>

            <div className="sm:col-span-3">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="all">All Statuses</option>
                <option value="active">Active Only</option>
                <option value="inactive">Inactive Only</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Staff Directory Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center justify-between">
            <span>Staff Directory ({users.length})</span>
            {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </CardTitle>
          <CardDescription>
            Active team accounts assigned to your organization. Privileges are strictly validated server-side.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50 border-y border-border text-xs uppercase font-medium text-muted-foreground">
                <tr>
                  <th className="py-3 px-4">Staff Member</th>
                  <th className="py-3 px-4">Contact</th>
                  <th className="py-3 px-4">Role & Scope</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Created Date</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading && users.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-muted-foreground">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-primary" />
                      Loading staff records...
                    </td>
                  </tr>
                ) : users.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-muted-foreground">
                      <UserCheck className="h-8 w-8 mx-auto mb-2 text-muted-foreground/60" />
                      <p className="font-medium text-foreground">No staff members found</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Try modifying search filters or add a new team account.
                      </p>
                    </td>
                  </tr>
                ) : (
                  users.map((u) => {
                    const roleInfo = ROLE_LABELS[u.role] || {
                      label: u.role,
                      color: "bg-slate-100 text-slate-800 border-slate-200",
                      desc: "General Staff",
                    };
                    return (
                      <tr key={u.id} className="hover:bg-muted/30 transition-colors">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <div className="h-9 w-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm shrink-0">
                              {(u.first_name?.[0] || "U").toUpperCase()}
                            </div>
                            <div>
                              <div className="font-semibold text-foreground">
                                {u.first_name} {u.last_name}
                              </div>
                              <div className="text-xs text-muted-foreground">{u.email}</div>
                            </div>
                          </div>
                        </td>

                        <td className="py-3 px-4">
                          <div className="space-y-0.5">
                            {u.phone ? (
                              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <Phone className="h-3 w-3 text-muted-foreground" />
                                <span>{u.phone}</span>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground/60">No phone</span>
                            )}
                          </div>
                        </td>

                        <td className="py-3 px-4">
                          <div>
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${roleInfo.color}`}
                            >
                              <Shield className="h-3 w-3" />
                              {roleInfo.label}
                            </span>
                            <div className="text-[11px] text-muted-foreground mt-0.5">{roleInfo.desc}</div>
                          </div>
                        </td>

                        <td className="py-3 px-4">
                          {u.is_active ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                              <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                              Active
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200">
                              <XCircle className="h-3 w-3 text-rose-600" />
                              Inactive
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-4 text-xs text-muted-foreground">
                          {u.created_at ? formatDate(u.created_at) : "N/A"}
                        </td>

                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleOpenEdit(u)}
                              className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
                              title="Edit Staff"
                            >
                              <Edit2 className="h-3.5 w-3.5 mr-1" />
                              Edit
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleToggleStatus(u)}
                              className={`h-8 px-2 text-xs font-medium ${
                                u.is_active
                                  ? "text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                                  : "text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                              }`}
                            >
                              {u.is_active ? "Deactivate" : "Activate"}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* CREATE STAFF MODAL */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-primary" />
              Create Staff Account
            </DialogTitle>
            <DialogDescription>
              Add a new staff member to your organization and grant specific functional permissions.
            </DialogDescription>
          </DialogHeader>

          {createError && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
              <span>{createError}</span>
            </div>
          )}

          <form onSubmit={handleCreateSubmit} className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-foreground">First Name *</label>
                <Input
                  required
                  placeholder="e.g. Ramesh"
                  value={createForm.first_name}
                  onChange={(e) => setCreateForm({ ...createForm, first_name: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-foreground">Last Name</label>
                <Input
                  placeholder="e.g. Patel"
                  value={createForm.last_name}
                  onChange={(e) => setCreateForm({ ...createForm, last_name: e.target.value })}
                  className="mt-1"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-foreground">Email Address *</label>
              <Input
                required
                type="email"
                placeholder="ramesh@example.com"
                value={createForm.email}
                onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                className="mt-1"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-foreground">Phone Number</label>
              <Input
                placeholder="+91 9876543210"
                value={createForm.phone}
                onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })}
                className="mt-1"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-foreground">System Role & Permissions *</label>
              <select
                value={createForm.role}
                onChange={(e) => setCreateForm({ ...createForm, role: e.target.value })}
                className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="cashier">Cashier — Billing, POS, payments & customer checkout</option>
                <option value="inventory">Inventory Staff — Stock intake, adjustments & supplier POs</option>
                <option value="store_manager">Store Manager — Store management, reports & supervision</option>
                <option value="org_admin">Admin / Owner — Full organization & financial authority</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-foreground">Initial Password * (min 8 chars)</label>
              <Input
                required
                type="password"
                placeholder="••••••••"
                value={createForm.password}
                onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                className="mt-1"
              />
            </div>

            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="create_is_active"
                checked={createForm.is_active}
                onChange={(e) => setCreateForm({ ...createForm, is_active: e.target.checked })}
                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
              />
              <label htmlFor="create_is_active" className="text-xs font-medium text-foreground cursor-pointer">
                Account Active (Staff can immediately log in)
              </label>
            </div>

            <DialogFooter className="pt-3">
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)} disabled={createSubmitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={createSubmitting} className="gap-2">
                {createSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                Create Account
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* EDIT STAFF MODAL */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit2 className="h-5 w-5 text-primary" />
              Edit Staff Member
            </DialogTitle>
            <DialogDescription>
              Update details, assigned role, or reset password for {editingUser?.first_name} {editingUser?.last_name}.
            </DialogDescription>
          </DialogHeader>

          {editError && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
              <span>{editError}</span>
            </div>
          )}

          <form onSubmit={handleEditSubmit} className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-foreground">First Name *</label>
                <Input
                  required
                  value={editForm.first_name}
                  onChange={(e) => setEditForm({ ...editForm, first_name: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-foreground">Last Name</label>
                <Input
                  value={editForm.last_name}
                  onChange={(e) => setEditForm({ ...editForm, last_name: e.target.value })}
                  className="mt-1"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-foreground">Email Address</label>
              <Input
                disabled
                value={editForm.email}
                className="mt-1 bg-muted/50 cursor-not-allowed text-muted-foreground"
              />
              <p className="text-[11px] text-muted-foreground mt-0.5">Email address serves as unique login identity.</p>
            </div>

            <div>
              <label className="text-xs font-medium text-foreground">Phone Number</label>
              <Input
                value={editForm.phone}
                onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                className="mt-1"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-foreground">System Role *</label>
              <select
                value={editForm.role}
                onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
                className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="cashier">Cashier</option>
                <option value="inventory">Inventory Staff</option>
                <option value="store_manager">Store Manager</option>
                <option value="org_admin">Admin / Owner</option>
                <option value="staff">Staff (Legacy)</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-foreground">Reset Password (Optional)</label>
              <Input
                type="password"
                placeholder="Leave blank to keep existing password"
                value={editForm.password}
                onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                className="mt-1"
              />
            </div>

            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="edit_is_active"
                checked={editForm.is_active}
                onChange={(e) => setEditForm({ ...editForm, is_active: e.target.checked })}
                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
              />
              <label htmlFor="edit_is_active" className="text-xs font-medium text-foreground cursor-pointer">
                Account Active
              </label>
            </div>

            <DialogFooter className="pt-3">
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)} disabled={editSubmitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={editSubmitting} className="gap-2">
                {editSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                Save Changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
