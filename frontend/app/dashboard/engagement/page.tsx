"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { engagementApi } from "@/services/api";
import type { EngagementDashboard, SegmentSummary } from "@/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight, Users, Star, Gift, Cake, Sparkles, RefreshCw } from "lucide-react";

export default function EngagementPage() {
  const [data,setData]=useState<EngagementDashboard|null>(null);
  const [segments,setSegments]=useState<SegmentSummary[]>([]);
  const [loading,setLoading]=useState(true);
  const load=async()=>{setLoading(true);try{const [a,b]=await Promise.all([engagementApi.dashboard(),engagementApi.segments()]);setData(a.data);setSegments(b.data);}finally{setLoading(false)}};
  useEffect(()=>{load()},[]);
  if(loading) return <div className="flex h-64 items-center justify-center text-muted-foreground">Loading customer intelligence...</div>;
  return <div className="space-y-6">
    <div className="flex items-center justify-between">
      <div><h1 className="text-2xl font-bold">Customer Engagement</h1><p className="text-sm text-muted-foreground">Turn billing activity into repeat customers and measurable growth.</p></div>
      <Button variant="outline" onClick={load}><RefreshCw className="mr-2 h-4 w-4"/>Refresh</Button>
    </div>
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {(data?.opportunities||[]).map(o=><Card key={o.key} className="transition hover:-translate-y-0.5 hover:shadow-md">
        <CardContent className="p-5"><div className="text-2xl">{o.icon}</div><p className="mt-3 text-sm font-semibold">{o.title}</p><p className="mt-1 text-3xl font-bold">{o.count}</p><p className="mt-1 text-xs text-muted-foreground">{o.action}</p><Link href={o.key==="vip"?"/dashboard/customers?segment=vip":"/dashboard/customers"} className="mt-4 inline-flex items-center text-xs font-semibold text-primary">Take action <ArrowRight className="ml-1 h-3 w-3"/></Link></CardContent>
      </Card>)}
    </div>
    <div className="grid gap-4 md:grid-cols-3">
      <Card><CardHeader><CardTitle className="text-base">Customer Health</CardTitle><CardDescription>Live customer base overview</CardDescription></CardHeader><CardContent className="grid grid-cols-2 gap-3">
        <Metric icon={<Users className="h-4 w-4"/>} label="Total" value={data?.customer_totals.total||0}/>
        <Metric icon={<Star className="h-4 w-4"/>} label="VIP" value={data?.customer_totals.vip||0}/>
        <Metric icon={<Gift className="h-4 w-4"/>} label="Inactive" value={data?.customer_totals.inactive||0}/>
        <Metric icon={<Cake className="h-4 w-4"/>} label="New · 30d" value={data?.customer_totals.new_30d||0}/>
      </CardContent></Card>
      <Card className="md:col-span-2"><CardHeader><CardTitle className="text-base">Smart Segments</CardTitle><CardDescription>Segments are calculated from actual customer data.</CardDescription></CardHeader><CardContent><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{segments.map(s=><div key={s.key} className="rounded-xl border p-4"><div className="flex items-center justify-between"><span className="font-semibold text-sm">{s.name}</span><span className="text-lg font-bold">{s.count}</span></div><p className="mt-1 text-xs text-muted-foreground">{s.description}</p></div>)}</div></CardContent></Card>
    </div>
    <Card><CardHeader><CardTitle className="text-base flex items-center gap-2"><Sparkles className="h-4 w-4"/>What should I do next?</CardTitle></CardHeader><CardContent className="grid gap-3 md:grid-cols-3"><Action href="/dashboard/ai-campaigns" title="Create a smart campaign" text="Generate an audience, offer and WhatsApp draft."/><Action href="/dashboard/customers" title="Review at-risk customers" text="Open customer profiles and take action."/><Action href="/dashboard/campaigns" title="Measure campaigns" text="Review delivery and campaign performance."/></CardContent></Card>
  </div>
}
function Metric({icon,label,value}:{icon:React.ReactNode;label:string;value:number}){return <div className="rounded-xl bg-muted/50 p-3"><div className="flex items-center gap-2 text-muted-foreground">{icon}<span className="text-xs">{label}</span></div><p className="mt-1 text-xl font-bold">{value.toLocaleString()}</p></div>}
function Action({href,title,text}:{href:string;title:string;text:string}){return <Link href={href} className="rounded-xl border p-4 transition hover:border-primary hover:bg-primary/5"><p className="font-semibold text-sm">{title}</p><p className="mt-1 text-xs text-muted-foreground">{text}</p></Link>}
