"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { storeApi } from "@/services/api";
import type { Store as StoreType } from "@/types";
import { parseApiError } from "@/lib/utils";
import { Search, Plus, Store, Building2, Loader2 } from "lucide-react";

export default function StoresPage() {
  const [stores, setStores] = useState<StoreType[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const [formData, setFormData] = useState({
    name: "",
    code: "",
    city: "",
    phone: "",
    address_line1: "",
  });

  const fetchStores = async () => {
    try {
      const res = await storeApi.list();
      setStores(res.data.results || []);
    } catch {
      setStores([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStores();
  }, []);

  const handleCreateStore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.code.trim()) {
      setError("Store Name and Store Code are required.");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      await storeApi.create({
        name: formData.name.trim(),
        code: formData.code.trim().toUpperCase(),
        city: formData.city.trim() || "Main",
        phone: formData.phone.trim(),
        address_line1: formData.address_line1.trim(),
        status: "active",
      } as Partial<StoreType>);

      setOpen(false);
      setFormData({
        name: "",
        code: "",
        city: "",
        phone: "",
        address_line1: "",
      });
      await fetchStores();
    } catch (err: unknown) {
      setError(parseApiError(err, "Failed to create store. Store code must be unique."));
    } finally {
      setSubmitting(false);
    }
  };

  const filtered = stores.filter(
    (s) =>
      (s.name || "").toLowerCase().includes(search.toLowerCase()) ||
      (s.code || "").toLowerCase().includes(search.toLowerCase()) ||
      (s.city || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Stores</h2>
          <p className="text-sm text-muted-foreground">Manage your retail outlets, store codes, and locations.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Store
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <form onSubmit={handleCreateStore}>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-primary" />
                  Add New Store
                </DialogTitle>
                <DialogDescription>
                  Enter store details to add a new outlet branch.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                {error && (
                  <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
                    {error}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Store Name *</label>
                    <Input
                      placeholder="Downtown Outlet"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Store Code *</label>
                    <Input
                      placeholder="STR001"
                      value={formData.code}
                      onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-xs font-medium">City</label>
                    <Input
                      placeholder="Mumbai"
                      value={formData.city}
                      onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Phone</label>
                    <Input
                      placeholder="9876543210"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? "Saving..." : "Save Store"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search stores by name, code, or city..."
                className="pl-10"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground">Loading stores...</p>
          ) : filtered.length === 0 ? (
            <div className="flex h-32 items-center justify-center text-muted-foreground">
              <Store className="mr-2 h-4 w-4" />
              No stores found
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b text-left text-sm font-medium text-muted-foreground">
                    <th className="pb-3 pr-4">Store Name</th>
                    <th className="pb-3 pr-4">Store Code</th>
                    <th className="pb-3 pr-4">City</th>
                    <th className="pb-3 pr-4">Phone</th>
                    <th className="pb-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((store) => (
                    <tr key={store.id} className="border-b">
                      <td className="py-3 pr-4 font-medium">{store.name}</td>
                      <td className="py-3 pr-4 font-mono font-bold">{store.code}</td>
                      <td className="py-3 pr-4">{store.city || "—"}</td>
                      <td className="py-3 pr-4">{store.phone || "—"}</td>
                      <td className="py-3">
                        <span className="inline-flex rounded-full bg-green-100 px-2 py-1 text-xs font-semibold text-green-700">
                          {store.status || "Active"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
