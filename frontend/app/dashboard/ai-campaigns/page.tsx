"use client";
import {useState} from "react";
import {engagementApi} from "@/services/api";
import {Card,CardContent,CardHeader,CardTitle,CardDescription} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
import {Sparkles,Send,RefreshCw,CheckCircle2} from "lucide-react";

const goals=[["win_back","Bring back inactive customers","Customers with no purchase in 60+ days"],["vip","Reward VIP customers","Customers with ₹10,000+ lifetime spend"],["repeat","Increase repeat purchases","Customers with recent purchase history"],["birthday","Celebrate birthdays","Customers whose birthday is today"]];
export default function AICampaignPage(){
 const [goal,setGoal]=useState("win_back"); const [result,setResult]=useState<any>(null); const [loading,setLoading]=useState(false);
 const generate=async()=>{setLoading(true);try{setResult((await engagementApi.generateCampaign(goal)).data)}finally{setLoading(false)}};
 return <div className="mx-auto max-w-5xl space-y-6">
  <div><h1 className="text-2xl font-bold flex items-center gap-2"><Sparkles className="h-6 w-6 text-primary"/>AI Campaign Assistant</h1><p className="text-sm text-muted-foreground">Generate an evidence-based audience, offer and WhatsApp draft. Nothing is sent automatically.</p></div>
  <div className="grid gap-4 md:grid-cols-2">
   {goals.map(g=><button key={g[0]} onClick={()=>setGoal(g[0])} className={`rounded-xl border p-5 text-left transition ${goal===g[0]?"border-primary bg-primary/5 ring-1 ring-primary":"hover:border-primary/50"}`}><p className="font-semibold">{g[1]}</p><p className="mt-1 text-xs text-muted-foreground">{g[2]}</p></button>)}
  </div>
  <Button onClick={generate} disabled={loading} className="w-full md:w-auto">{loading?<><RefreshCw className="mr-2 h-4 w-4 animate-spin"/>Generating...</>:<><Sparkles className="mr-2 h-4 w-4"/>Generate campaign</>}</Button>
  {result&&<Card><CardHeader><CardTitle>{result.campaign_name}</CardTitle><CardDescription>{result.audience_count.toLocaleString()} customers match the selected goal.</CardDescription></CardHeader><CardContent className="space-y-5">
   <div className="grid gap-4 md:grid-cols-2"><div className="rounded-xl border p-4"><p className="text-xs text-muted-foreground">Recommended offer</p><p className="mt-1 text-lg font-bold">{result.offer}</p></div><div className="rounded-xl border p-4"><p className="text-xs text-muted-foreground">Audience</p><p className="mt-1 text-lg font-bold">{result.audience_count.toLocaleString()} customers</p></div></div>
   <div><p className="mb-2 text-sm font-semibold">WhatsApp preview</p><div className="whitespace-pre-wrap rounded-xl bg-muted p-5 text-sm">{result.whatsapp_message}</div></div>
   <div className="flex items-center gap-2 rounded-xl bg-amber-50 p-4 text-xs text-amber-800"><CheckCircle2 className="h-4 w-4"/>Merchant approval is required before sending.</div>
   <div className="flex gap-2"><Button><Send className="mr-2 h-4 w-4"/>Continue to campaign</Button><Button variant="outline" onClick={generate}>Regenerate</Button></div>
  </CardContent></Card>}
 </div>
}
