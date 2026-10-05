"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import axios from "axios";
import {
  Award,
  Gift,
  ShoppingBag,
  Sparkles,
  Star,
  Tag,
  Clock,
  ShieldCheck,
  Check,
  Globe,
  Store,
  ChevronRight,
} from "lucide-react";

type Language = "en" | "hi" | "mr" | "gu";

const translations = {
  en: {
    hello: "HELLO",
    member: "Member",
    points: "points available",
    toNextTier: "more spend to reach",
    congratsMaxTier: "Highest Loyalty Tier Unlocked",
    recentPurchases: "Recent Purchases",
    availableRewards: "Available Rewards & Coupons",
    achievements: "Customer Achievements",
    memberSince: "Member since",
    copyCode: "Copy Code",
    copied: "Copied!",
    digitalInvoices: "Digital Invoices",
    minSpend: "Min. spend",
    validTill: "Valid till",
    noPurchases: "No purchases recorded yet.",
    noRewards: "No active rewards right now. Check back soon!",
    noAchievements: "Shop more to unlock your first achievement badge!",
    pointsEarned: "points earned",
    securedBy: "Verified & Secured by BillFree Digital Platform",
  },
  hi: {
    hello: "नमस्ते",
    member: "सदस्य",
    points: "पॉइंट्स उपलब्ध",
    toNextTier: "अगले टियर के लिए आवश्यक खर्च",
    congratsMaxTier: "सर्वोच्च लॉयल्टी टियर अनलॉक हुआ",
    recentPurchases: "हाल की खरीदारी",
    availableRewards: "उपलब्ध रिवॉर्ड्स और कूपन",
    achievements: "आपकी उपलब्धियां",
    memberSince: "सदस्य बने",
    copyCode: "कोड कॉपी करें",
    copied: "कॉपी हो गया!",
    digitalInvoices: "डिजिटल इनवॉइस",
    minSpend: "न्यूनतम खरीद",
    validTill: "वैधता तिथि",
    noPurchases: "अभी तक कोई खरीदारी दर्ज नहीं की गई।",
    noRewards: "फिलहाल कोई सक्रिय रिवॉर्ड नहीं है।",
    noAchievements: "पहला बैज अनलॉक करने के लिए और खरीदारी करें!",
    pointsEarned: "पॉइंट्स अर्जित",
    securedBy: "BillFree डिजिटल प्लेटफ़ॉर्म द्वारा सत्यापित और सुरक्षित",
  },
  mr: {
    hello: "नमस्कार",
    member: "सभासद",
    points: "पॉइंट्स उपलब्ध",
    toNextTier: "पुढील टप्प्यासाठी आवश्यक खरेदी",
    congratsMaxTier: "सर्वोच्च लॉयल्टी स्तर अनलॉक",
    recentPurchases: "अलीकडील खरेदी",
    availableRewards: "उपलब्ध बक्षिसे आणि कूपन",
    achievements: "आपल्या उपलब्धी",
    memberSince: "सभासद पासून",
    copyCode: "कोड कॉपी करा",
    copied: "कॉपी केले!",
    digitalInvoices: "डिजिटल पावत्या",
    minSpend: "किमान खरेदी",
    validTill: "वैधता",
    noPurchases: "अद्याप कोणतीही खरेदी नोंदवलेली नाही.",
    noRewards: "सध्या कोणतीही ऑफर उपलब्ध नाही.",
    noAchievements: "पहिले बॅज मिळवण्यासाठी खरेदी करा!",
    pointsEarned: "पॉइंट्स मिळवले",
    securedBy: "BillFree डिजिटल प्लॅटफॉर्मद्वारे सुरक्षित आणि सत्यापित",
  },
  gu: {
    hello: "નમસ્તે",
    member: "સભ્ય",
    points: "પોઇન્ટ્સ ઉપલબ્ધ",
    toNextTier: "આગલા ટાયર માટે જરૂરી ખર્ચ",
    congratsMaxTier: "સર્વોચ્ચ વફાદારી સ્તર અનલૉક થયું",
    recentPurchases: "તાજેતરની ખરીદી",
    availableRewards: "ઉપલબ્ધ રિવોર્ડ્સ અને કૂપન્સ",
    achievements: "તમારી સિદ્ધિઓ",
    memberSince: "સભ્ય બન્યા",
    copyCode: "કોડ કૉપિ કરો",
    copied: "કૉપિ થઈ ગયું!",
    digitalInvoices: "ડિજિટલ બિલ",
    minSpend: "ન્યૂનતમ ખરીદી",
    validTill: "માન્યતા",
    noPurchases: "હજી સુધી કોઈ ખરીદી નોંધાઈ નથી.",
    noRewards: "હાલમાં કોઈ ઑફર ઉપલબ્ધ નથી.",
    noAchievements: "પહેલો બેજ મેળવવા માટે વધુ ખરીદી કરો!",
    pointsEarned: "પોઇન્ટ્સ પ્રાપ્ત થયા",
    securedBy: "BillFree ડિજિટલ પ્લેટફોર્મ દ્વારા પ્રમાણિત અને સુરક્ષિત",
  },
};

export default function CustomerMiniPortal() {
  const params = useParams();
  const token = params?.token as string;

  const [portalData, setPortalData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lang, setLang] = useState<Language>("en");
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const t = translations[lang];

  useEffect(() => {
    if (!token) return;
    const fetchPortal = async () => {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";
        const res = await axios.get(`${apiUrl}/customer-portal/${token}/`);
        setPortalData(res.data);
      } catch (err: unknown) {
        setError("Invalid or expired customer portal link.");
      } finally {
        setLoading(false);
      }
    };
    fetchPortal();
  }, [token]);

  const handleCopy = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2500);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-950 text-white flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-slate-400 font-medium text-sm">Opening customer portal...</p>
        </div>
      </div>
    );
  }

  if (error || !portalData) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-slate-900 rounded-2xl p-8 text-center border border-slate-800">
          <div className="w-14 h-14 bg-rose-500/10 text-rose-500 rounded-full flex items-center justify-center mx-auto mb-4 font-bold text-2xl">
            !
          </div>
          <h2 className="text-xl font-bold mb-2">Portal Unavailable</h2>
          <p className="text-slate-400 text-sm mb-4">
            {error || "This link could not be loaded. Please request a fresh bill link."}
          </p>
        </div>
      </div>
    );
  }

  const { customer, business, loyalty, achievements, recent_orders, available_rewards } = portalData;
  const currentTier = loyalty?.current_tier || { name: "Bronze", slug: "bronze", color: "#cd7f32" };
  const nextTier = loyalty?.next_tier;
  const progressPct = loyalty?.progress_percentage || 0;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-16 font-sans">
      {/* Top Bar with Language Selector */}
      <header className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md sticky top-0 z-20 px-4 py-3">
        <div className="max-w-xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Store className="h-4 w-4 text-indigo-400" />
            <span className="font-bold text-sm tracking-tight">{business.name}</span>
          </div>

          {/* Language Switcher */}
          <div className="flex items-center gap-1 bg-slate-800/80 rounded-full p-1 border border-slate-700/60 text-xs">
            <Globe className="h-3 w-3 text-slate-400 ml-1.5" />
            <button
              onClick={() => setLang("en")}
              className={`px-2 py-0.5 rounded-full font-medium transition-all ${
                lang === "en" ? "bg-indigo-600 text-white shadow-sm" : "text-slate-400 hover:text-white"
              }`}
            >
              EN
            </button>
            <button
              onClick={() => setLang("hi")}
              className={`px-2 py-0.5 rounded-full font-medium transition-all ${
                lang === "hi" ? "bg-indigo-600 text-white shadow-sm" : "text-slate-400 hover:text-white"
              }`}
            >
              हिंदी
            </button>
            <button
              onClick={() => setLang("mr")}
              className={`px-2 py-0.5 rounded-full font-medium transition-all ${
                lang === "mr" ? "bg-indigo-600 text-white shadow-sm" : "text-slate-400 hover:text-white"
              }`}
            >
              मराठी
            </button>
            <button
              onClick={() => setLang("gu")}
              className={`px-2 py-0.5 rounded-full font-medium transition-all ${
                lang === "gu" ? "bg-indigo-600 text-white shadow-sm" : "text-slate-400 hover:text-white"
              }`}
            >
              ગુજ
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-xl mx-auto px-4 pt-6 space-y-6">
        {/* Customer Welcome Header */}
        <div className="rounded-3xl bg-gradient-to-br from-indigo-900/50 via-slate-900 to-slate-900 border border-indigo-500/20 p-6 shadow-xl relative overflow-hidden">
          <div className="relative z-10">
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase tracking-widest font-bold text-indigo-400">
                {t.hello} {customer.name?.toUpperCase()} 👋
              </span>
            </div>

            <div className="mt-4 flex items-baseline justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border shadow-sm"
                    style={{
                      borderColor: currentTier.color || "#818cf8",
                      color: currentTier.color || "#818cf8",
                      backgroundColor: `${currentTier.color}15` || "#818cf815",
                    }}
                  >
                    <Award className="h-3.5 w-3.5" />
                    {currentTier.name} {t.member}
                  </span>
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-4xl font-black text-white">
                    {Number(loyalty?.points_balance || 0).toLocaleString()}
                  </span>
                  <span className="text-xs text-slate-400 font-medium">{t.points}</span>
                </div>
              </div>

              <div className="text-right">
                <span className="text-xs text-slate-400 block">{t.memberSince}</span>
                <span className="text-xs font-semibold text-slate-200">{customer.member_since}</span>
              </div>
            </div>

            {/* Loyalty Tier Progress Bar */}
            <div className="mt-6 pt-4 border-t border-slate-800">
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-slate-400 font-medium">
                  {nextTier
                    ? `₹${Number(loyalty.spend_needed_for_next_tier || 0).toLocaleString("en-IN")} ${t.toNextTier} ${nextTier.name}`
                    : t.congratsMaxTier}
                </span>
                <span className="font-bold text-indigo-400">{progressPct}%</span>
              </div>
              <div className="h-2.5 rounded-full bg-slate-800 overflow-hidden border border-slate-700/50">
                <div
                  className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-amber-400 transition-all duration-700"
                  style={{ width: `${Math.min(100, Math.max(5, progressPct))}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Gamification Achievements Section */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold tracking-tight uppercase text-slate-400 flex items-center gap-1.5">
              <Star className="h-4 w-4 text-amber-400" />
              {t.achievements} ({achievements?.length || 0})
            </h2>
          </div>

          {achievements && achievements.length > 0 ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {achievements.map((ach: any, i: number) => (
                <div
                  key={ach.code || i}
                  className="rounded-2xl border border-slate-800 bg-slate-900/80 p-3.5 flex flex-col justify-between hover:border-indigo-500/40 transition-colors shadow-sm"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-7 h-7 rounded-full bg-amber-400/10 text-amber-400 flex items-center justify-center shrink-0">
                      <Sparkles className="h-3.5 w-3.5" />
                    </div>
                    <span className="text-[10px] font-bold uppercase text-amber-400">
                      {ach.badge_tier}
                    </span>
                  </div>
                  <div>
                    <h3 className="font-bold text-xs text-white leading-tight">{ach.title}</h3>
                    <p className="text-[11px] text-slate-400 mt-1 line-clamp-2">{ach.description}</p>
                  </div>
                  <span className="mt-3 text-[10px] text-slate-500 font-mono">
                    {ach.unlocked_at}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-800 p-6 text-center text-xs text-slate-500">
              {t.noAchievements}
            </div>
          )}
        </section>

        {/* Available Rewards & Active Coupons */}
        <section className="space-y-3">
          <h2 className="text-sm font-bold tracking-tight uppercase text-slate-400 flex items-center gap-1.5">
            <Gift className="h-4 w-4 text-emerald-400" />
            {t.availableRewards}
          </h2>

          {available_rewards && available_rewards.length > 0 ? (
            <div className="space-y-3">
              {available_rewards.map((r: any, i: number) => (
                <div
                  key={r.code || i}
                  className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-sm hover:border-emerald-500/30 transition-all"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
                      <Tag className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-white">{r.title}</span>
                        <span className="rounded bg-emerald-500/20 text-emerald-300 px-2 py-0.5 text-[11px] font-mono font-bold">
                          {r.discount_type === "percentage" ? `${r.discount_value}% OFF` : `₹${r.discount_value} OFF`}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">{r.description}</p>
                      <p className="text-[11px] text-slate-500 mt-1 font-mono">
                        {t.minSpend}: ₹{r.min_order} · {t.validTill}: {r.expires_at}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => handleCopy(r.code)}
                    className="shrink-0 flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-mono font-bold border border-slate-700 text-white transition-all active:scale-95"
                  >
                    {copiedCode === r.code ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-400" />
                        <span className="text-emerald-400">{t.copied}</span>
                      </>
                    ) : (
                      <>
                        <span>{r.code}</span>
                        <span className="text-slate-400 text-[10px]">({t.copyCode})</span>
                      </>
                    )}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-800 p-6 text-center text-xs text-slate-500">
              {t.noRewards}
            </div>
          )}
        </section>

        {/* Recent Purchases & Invoices */}
        <section className="space-y-3">
          <h2 className="text-sm font-bold tracking-tight uppercase text-slate-400 flex items-center gap-1.5">
            <ShoppingBag className="h-4 w-4 text-indigo-400" />
            {t.recentPurchases}
          </h2>

          {recent_orders && recent_orders.length > 0 ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden divide-y divide-slate-800/80">
              {recent_orders.map((order: any, i: number) => (
                <div key={order.invoice_number || i} className="p-4 flex items-center justify-between">
                  <div>
                    <div className="font-mono text-sm font-bold text-white">
                      {order.invoice_number}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                      <span>{order.date}</span>
                      <span>·</span>
                      <span className="text-indigo-400 font-medium">
                        +{order.points_earned} {t.pointsEarned}
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-base font-extrabold text-white">
                      ₹{Number(order.total).toLocaleString("en-IN")}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-800 p-6 text-center text-xs text-slate-500">
              {t.noPurchases}
            </div>
          )}
        </section>

        {/* Footer Security Badge */}
        <footer className="pt-6 pb-4 text-center">
          <div className="inline-flex items-center gap-1.5 text-xs text-slate-500">
            <ShieldCheck className="h-4 w-4 text-indigo-400" />
            <span>{t.securedBy}</span>
          </div>
        </footer>
      </main>
    </div>
  );
}
