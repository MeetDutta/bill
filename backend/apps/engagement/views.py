from datetime import timedelta
from decimal import Decimal
from django.db.models import Count, Sum, Avg
from django.utils import timezone
from rest_framework import generics
from rest_framework.response import Response
from rest_framework.views import APIView
from .models import Review, Referral
from .serializers import ReviewSerializer, ReferralSerializer
from apps.customers.models import Customer, CustomerTimeline
from apps.transactions.models import Transaction
from apps.loyalty.models import LoyaltyAccount
from apps.campaigns.models import Campaign

def score_customer(c):
    now=timezone.now()
    score=0
    reasons=[]
    if c.last_purchase_at:
        days=(now-c.last_purchase_at).days
        if days<=14: score+=35; reasons.append("Purchased recently")
        elif days<=30: score+=25; reasons.append("Purchased within the last month")
        elif days<=60: score+=12
        else: score+=2
    else:
        reasons.append("No purchase history")
    if c.total_purchases>=10: score+=25; reasons.append("Frequent buyer")
    elif c.total_purchases>=5: score+=18; reasons.append("Repeat customer")
    elif c.total_purchases>=2: score+=10
    if c.total_spend>=25000: score+=25; reasons.append("High lifetime spend")
    elif c.total_spend>=10000: score+=18; reasons.append("Strong customer value")
    elif c.total_spend>=3000: score+=8
    try:
        pts=float(c.loyalty_account.balance)
        if pts>500: score+=10; reasons.append("Active loyalty member")
        elif pts>0: score+=5
    except LoyaltyAccount.DoesNotExist: pass
    score=min(score,100)
    if score>=70: label="Highly Engaged"
    elif score>=45: label="Needs Attention"
    elif score>=20: label="At Risk"
    else: label="Inactive"
    return score,label,reasons[:5]

def customer_profile(c):
    score,label,reasons=score_customer(c)
    txs=list(Transaction.objects.filter(organization=c.organization,customer=c,status="completed").order_by("-transaction_date")[:10])
    timeline=list(CustomerTimeline.objects.filter(organization=c.organization,customer=c)[:20])
    try: loyalty=LoyaltyAccount.objects.get(organization=c.organization,customer=c)
    except LoyaltyAccount.DoesNotExist: loyalty=None
    last_days=(timezone.now()-c.last_purchase_at).days if c.last_purchase_at else None
    if last_days is None: action="Send a welcome / first-purchase campaign"
    elif last_days>60: action="Send a win-back offer"
    elif score>=70 and c.total_spend>=10000: action="Recognize this VIP customer"
    elif c.total_purchases<2: action="Encourage a second purchase"
    else: action="Send a personalized loyalty reminder"
    return {
        "customer":{"id":str(c.id),"customer_id":c.customer_id,"name":c.full_name,"phone":c.phone,"email":c.email,"city":c.city,"segment":c.segment,"created_at":c.created_at,"last_purchase_at":c.last_purchase_at,"total_purchases":c.total_purchases,"total_spend":str(c.total_spend),"average_order_value":str(c.average_order_value),"preferred_store":c.preferred_store.name if c.preferred_store else None,"portal_token":str(c.portal_token)},
        "engagement":{"score":score,"label":label,"reasons":reasons},
        "loyalty":None if not loyalty else {"balance":str(loyalty.balance),"total_earned":str(loyalty.total_earned),"total_redeemed":str(loyalty.total_redeemed),"total_expired":str(loyalty.total_expired)},
        "recommended_action":{"title":action,"reason":"Based on purchase recency, frequency, value and loyalty activity.","suggested_offer":"₹250 OFF above ₹1,499" if last_days and last_days>60 else "Reward points on the next purchase"},
        "transactions":[{"id":str(t.id),"invoice_number":t.invoice_number,"total":str(t.total),"date":t.transaction_date,"payment_method":t.payment_method,"items":t.item_count} for t in txs],
        "timeline":[{"id":str(e.id),"event_type":e.event_type,"reference_id":e.reference_id,"metadata":e.metadata,"created_at":e.created_at} for e in timeline],
    }

class Customer360View(APIView):
    def get(self,request,pk):
        c=Customer.objects.filter(organization=request.user.organization,pk=pk).first()
        if not c: return Response({"detail":"Customer not found."},status=404)
        return Response(customer_profile(c))

class CustomerScoreView(APIView):
    def get(self,request,pk):
        c=Customer.objects.filter(organization=request.user.organization,pk=pk).first()
        if not c: return Response({"detail":"Customer not found."},status=404)
        score,label,reasons=score_customer(c)
        return Response({"score":score,"label":label,"reasons":reasons})

class SegmentsView(APIView):
    def get(self,request):
        org=request.user.organization
        qs=Customer.objects.filter(organization=org,is_active=True)
        now=timezone.now()
        inactive=qs.filter(last_purchase_at__lt=now-timedelta(days=60)).count()
        at_risk=qs.filter(last_purchase_at__lt=now-timedelta(days=30),last_purchase_at__gte=now-timedelta(days=60)).count()
        vip=qs.filter(total_spend__gte=10000).count()
        frequent=qs.filter(total_purchases__gte=5).count()
        new=qs.filter(created_at__gte=now-timedelta(days=30)).count()
        birthday=qs.filter(date_of_birth__month=now.month,date_of_birth__day=now.day).count()
        return Response([
            {"key":"vip","name":"VIP Customers","count":vip,"description":"Customers with ₹10,000+ lifetime spend"},
            {"key":"frequent","name":"Frequent Buyers","count":frequent,"description":"Customers with 5+ purchases"},
            {"key":"at_risk","name":"At Risk","count":at_risk,"description":"No purchase in 30–60 days"},
            {"key":"inactive","name":"Inactive","count":inactive,"description":"No purchase in 60+ days"},
            {"key":"new","name":"New Customers","count":new,"description":"Joined in the last 30 days"},
            {"key":"birthday","name":"Birthdays Today","count":birthday,"description":"Customers celebrating today"},
        ])

class EngagementDashboardView(APIView):
    def get(self,request):
        org=request.user.organization
        qs=Customer.objects.filter(organization=org,is_active=True)
        now=timezone.now()
        inactive_qs=qs.filter(last_purchase_at__lt=now-timedelta(days=60))
        vip_qs=qs.filter(total_spend__gte=10000)
        birthdays=qs.filter(date_of_birth__month=now.month,date_of_birth__day=now.day)
        rewards=0
        try: rewards=LoyaltyAccount.objects.filter(organization=org,balance__gt=0).count()
        except Exception: pass
        reviews=Review.objects.filter(organization=org)
        return Response({
            "opportunities":[
                {"key":"at_risk","icon":"🔥","title":"Customers ready for re-engagement","count":inactive_qs.count(),"action":"Create win-back campaign"},
                {"key":"vip","icon":"💎","title":"VIP customers","count":vip_qs.count(),"action":"Recognize VIP customers"},
                {"key":"birthday","icon":"🎂","title":"Birthdays today","count":birthdays.count(),"action":"Send birthday offer"},
                {"key":"rewards","icon":"🎁","title":"Active loyalty accounts","count":rewards,"action":"Promote rewards"},
            ],
            "customer_totals":{"total":qs.count(),"vip":vip_qs.count(),"inactive":inactive_qs.count(),"new_30d":qs.filter(created_at__gte=now-timedelta(days=30)).count()},
            "reviews":{"count":reviews.count(),"average":round(float(reviews.aggregate(v=Avg("rating"))["v"] or 0),2)},
            "campaigns":{"active":Campaign.objects.filter(organization=org,status__in=["scheduled","sending"]).count()},
        })

class ReviewListCreateView(generics.ListCreateAPIView):
    serializer_class=ReviewSerializer
    def get_queryset(self): return Review.objects.filter(organization=self.request.user.organization).select_related("customer")
    def perform_create(self,serializer): serializer.save(organization=self.request.user.organization)

class ReferralListCreateView(generics.ListCreateAPIView):
    serializer_class=ReferralSerializer
    def get_queryset(self): return Referral.objects.filter(organization=self.request.user.organization).select_related("referrer")
    def perform_create(self,serializer): serializer.save(organization=self.request.user.organization)

class CampaignAssistantView(APIView):
    def post(self,request):
        goal=request.data.get("goal","win_back")
        org=request.user.organization
        qs=Customer.objects.filter(organization=org,is_active=True)
        now=timezone.now()
        if goal=="win_back": audience=qs.filter(last_purchase_at__lt=now-timedelta(days=60)); offer="₹250 OFF above ₹1,499"; title="Come Back & Save"
        elif goal=="vip": audience=qs.filter(total_spend__gte=10000); offer="VIP bonus reward"; title="VIP Appreciation"
        elif goal=="repeat": audience=qs.filter(total_purchases__gte=1,last_purchase_at__gte=now-timedelta(days=90)); offer="Bonus loyalty points"; title="Your Next Reward"
        elif goal=="birthday": audience=qs.filter(date_of_birth__month=now.month,date_of_birth__day=now.day); offer="Birthday reward"; title="Happy Birthday"
        else: audience=qs; offer="Special customer offer"; title="Customer Appreciation"
        return Response({"goal":goal,"audience_count":audience.count(),"campaign_name":title,"offer":offer,"whatsapp_message":"Hi {{customer_name}} 👋\n\nWe have a special offer for you: "+offer+".\n\nWe'd love to see you again!","requires_merchant_approval":True})
