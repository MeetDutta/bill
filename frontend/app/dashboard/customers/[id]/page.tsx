"use client";

import { useEffect,useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { engagementApi } from "@/services/api";
import type { Customer360 } from "@/types";
import { Card,CardContent,CardHeader,CardTitle,CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Sparkles, MessageCircle, ShoppingBag, Clock, Star, Gift } from "lucide-react";

export default function Customer360Page(){
 const params=useParams(); const id=params?.id as string; const [d,setD]=useState<Customer360|null>(null); const [loading,setLoading]=useState(true);
 useEffect(()=>{if(id) engagementApi.customer360(id).then(r=>setD(r.data)).finally(()=>setLoading(false))},[id]);
 if(loading)return <div className="p-8 text-muted-foreground">Loading customer profile...</div>;
 if(!d)return <div className="p-8">Customer not found.</div>;
 const c=d.customer;
 return <div className="space-y-6">
  <Link href="/dashboard/customers" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="mr-2 h-4 w-4"/>Back to customers</Link>
  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
   <div><p className="text-xs uppercase tracking-wider text-muted-foreground">{c.customer_id}</p><h1 className="text-3xl font-bold">{c.name}</h1><p className="text-sm text-muted-foreground">{c.phone}{c.email?` · ${c.email}`:""}</p></div>
   <div className="flex gap-2"><Button><MessageCircle className="mr-2 h-4 w-4"/>WhatsApp</Button><Button variant="outline">Create offer</Button></div>
  </div>
  <div className="grid gap-4 md:grid-cols-4">
   <Stat title="Engagement" value={`${d.engagement.score}/100`} sub={d.engagement.label}/>
   <Stat title="Lifetime spend" value={`₹${Number(c.total_spend).toLocaleString("en-IN")}`} sub={`${c.total_purchases} purchases`}/>
   <Stat title="Avg. order" value={`₹${Number(c.average_order_value).toLocaleString("en-IN")}`} sub="Actual purchase history"/>
   <Stat title="Loyalty" value={d.loyalty?Number(d.loyalty.balance).toLocaleString():"0"} sub="points available"/>
  </div>
  <div className="grid gap-4 lg:grid-cols-3">
   <Card className="lg:col-span-2"><CardHeader><CardTitle className="text-base">Recommended next action</CardTitle><CardDescription>{d.recommended_action.reason}</CardDescription></CardHeader><CardContent><div className="rounded-xl border bg-primary/5 p-5"><div className="flex items-center gap-2 font-semibold"><Sparkles className="h-4 w-4 text-primary"/>{d.recommended_action.title}</div><p className="mt-2 text-sm text-muted-foreground">Suggested offer: <span className="font-semibold text-foreground">{d.recommended_action.suggested_offer}</span></p><div className="mt-4 flex gap-2"><Link href="/dashboard/ai-campaigns"><Button size="sm">Create campaign</Button></Link><Button size="sm" variant="outline">Send WhatsApp</Button></div></div><div className="mt-4 flex flex-wrap gap-2">{d.engagement.reasons.map(r=><span key={r} className="rounded-full bg-muted px-3 py-1 text-xs">{r}</span>)}</div></CardContent></Card>
   <Card><CardHeader><CardTitle className="text-base">Loyalty wallet</CardTitle></CardHeader><CardContent>{d.loyalty?<><p className="text-3xl font-bold">{Number(d.loyalty.balance).toLocaleString()} <span className="text-sm font-medium">pts</span></p><div className="mt-4 h-2 rounded-full bg-muted"><div className="h-2 rounded-full bg-primary" style={{width:`${Math.min(100,Number(d.loyalty.balance)/10)}%`}}/></div><p className="mt-2 text-xs text-muted-foreground">{Math.max(0,1000-Number(d.loyalty.balance))} points to next milestone</p></>:<p className="text-sm text-muted-foreground">No loyalty account yet.</p>}</CardContent></Card>
  </div>
  <div className="grid gap-4 lg:grid-cols-2">
   <Card><CardHeader><CardTitle className="text-base flex items-center gap-2"><ShoppingBag className="h-4 w-4"/>Recent purchases</CardTitle></CardHeader><CardContent><div className="space-y-3">{d.transactions.map(t=><div key={t.id} className="flex justify-between border-b pb-3 last:border-0"><div><p className="text-sm font-semibold">{t.invoice_number}</p><p className="text-xs text-muted-foreground">{new Date(t.date).toLocaleDateString("en-IN")} · {t.items} items</p></div><p className="font-semibold">₹{Number(t.total).toLocaleString("en-IN")}</p></div>)}{!d.transactions.length&&<p className="text-sm text-muted-foreground">No completed purchases yet.</p>}</div></CardContent></Card>
   <Card><CardHeader><CardTitle className="text-base flex items-center gap-2"><Clock className="h-4 w-4"/>Customer timeline</CardTitle></CardHeader><CardContent><div className="space-y-3">{d.timeline.map(e=><div key={e.id} className="flex gap-3"><div className="mt-1 h-2 w-2 rounded-full bg-primary"/><div><p className="text-sm font-medium capitalize">{e.event_type.replaceAll("_"," ")}</p><p className="text-xs text-muted-foreground">{new Date(e.created_at).toLocaleString("en-IN")}</p></div></div>)}{!d.timeline.length&&<p className="text-sm text-muted-foreground">No timeline events yet.</p>}</div></CardContent></Card>
  </div>
 </div>
}
function Stat({title,value,sub}:{title:string;value:string;sub:string}){return <Card><CardContent className="p-5"><p className="text-xs text-muted-foreground">{title}</p><p className="mt-1 text-2xl font-bold">{value}</p><p className="mt-1 text-xs text-muted-foreground">{sub}</p></CardContent></Card>}
