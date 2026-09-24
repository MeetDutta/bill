"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { loyaltyApi } from "@/services/api";
import { Star, Plus, Search } from "lucide-react";

interface LoyaltyAccount {
  id: string;
  customer: string;
  customer_name: string;
  customer_phone: string;
  balance: number;
  total_earned: number;
  total_redeemed: number;
}

interface LoyaltyRule {
  id: string;
  name: string;
  rule_type: string;
  points: number;
  per_amount: number;
  is_active: boolean;
}

export default function LoyaltyPage() {
  const [accounts, setAccounts] = useState<LoyaltyAccount[]>([]);
  const [rules, setRules] = useState<LoyaltyRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [accountsRes, rulesRes] = await Promise.all([
          loyaltyApi.getAccounts(),
          loyaltyApi.getRules(),
        ]);
        setAccounts(accountsRes.data.results || []);
        setRules(rulesRes.data.results || []);
      } catch {
        setAccounts([]);
        setRules([]);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const filtered = accounts.filter(
    (a) =>
      a.customer_name?.toLowerCase().includes(search.toLowerCase()) ||
      a.customer_phone?.includes(search)
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Loyalty</h2>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Loyalty Rules</CardTitle>
          </CardHeader>
          <CardContent>
            {rules.length === 0 ? (
              <p className="text-muted-foreground">No rules configured</p>
            ) : (
              <div className="space-y-2">
                {rules.map((rule) => (
                  <div key={rule.id} className="flex items-center justify-between border-b pb-2">
                    <div>
                      <p className="font-medium">{rule.name}</p>
                      <p className="text-sm text-muted-foreground">{rule.rule_type}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">{rule.points} pts</p>
                      <p className="text-sm text-muted-foreground">per ₹{rule.per_amount}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quick Stats</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Accounts</span>
                <span className="font-bold">{accounts.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Points Outstanding</span>
                <span className="font-bold">
                  {accounts.reduce((sum, a) => sum + Number(a.balance), 0).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Points Earned</span>
                <span className="font-bold">
                  {accounts.reduce((sum, a) => sum + Number(a.total_earned), 0).toLocaleString()}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search customers..."
                className="pl-10"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground">Loading loyalty accounts...</p>
          ) : filtered.length === 0 ? (
            <div className="flex h-32 items-center justify-center text-muted-foreground">
              No loyalty accounts found
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b text-left text-sm font-medium text-muted-foreground">
                    <th className="pb-3 pr-4">Customer</th>
                    <th className="pb-3 pr-4">Phone</th>
                    <th className="pb-3 pr-4">Balance</th>
                    <th className="pb-3 pr-4">Earned</th>
                    <th className="pb-3">Redeemed</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((account) => (
                    <tr key={account.id} className="border-b">
                      <td className="py-3 pr-4 font-medium">{account.customer_name || "—"}</td>
                      <td className="py-3 pr-4">{account.customer_phone}</td>
                      <td className="py-3 pr-4">
                        <span className="flex items-center gap-1">
                          <Star className="h-4 w-4 text-yellow-500" />
                          {Number(account.balance).toLocaleString()}
                        </span>
                      </td>
                      <td className="py-3 pr-4">{Number(account.total_earned).toLocaleString()}</td>
                      <td className="py-3">{Number(account.total_redeemed).toLocaleString()}</td>
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
