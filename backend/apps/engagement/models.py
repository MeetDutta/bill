from django.db import models
from common.models import TenantModel, TimeStampedModel, UUIDModel

class Review(UUIDModel, TenantModel, TimeStampedModel):
    RATING_CHOICES=[(i,str(i)) for i in range(1,6)]
    customer=models.ForeignKey("customers.Customer",on_delete=models.CASCADE,related_name="engagement_reviews")
    transaction=models.ForeignKey("transactions.Transaction",on_delete=models.SET_NULL,null=True,blank=True,related_name="engagement_reviews")
    rating=models.PositiveSmallIntegerField(choices=RATING_CHOICES)
    comment=models.TextField(blank=True)
    status=models.CharField(max_length=20,choices=[("private","Private"),("published","Published"),("resolved","Resolved")],default="private")
    source=models.CharField(max_length=30,default="digital_bill")
    class Meta:
        ordering=["-created_at"]
        indexes=[models.Index(fields=["organization","rating"]),models.Index(fields=["customer","created_at"])]

class Referral(UUIDModel, TenantModel, TimeStampedModel):
    STATUS_CHOICES=[("pending","Pending"),("qualified","Qualified"),("rewarded","Rewarded"),("cancelled","Cancelled")]
    referrer=models.ForeignKey("customers.Customer",on_delete=models.CASCADE,related_name="referrals_made")
    referred_phone=models.CharField(max_length=20)
    referred_name=models.CharField(max_length=150,blank=True)
    code=models.CharField(max_length=40,db_index=True)
    status=models.CharField(max_length=20,choices=STATUS_CHOICES,default="pending")
    reward_points=models.DecimalField(max_digits=10,decimal_places=2,default=0)
    qualified_transaction=models.ForeignKey("transactions.Transaction",on_delete=models.SET_NULL,null=True,blank=True,related_name="referral")
    rewarded_at=models.DateTimeField(null=True,blank=True)
    class Meta:
        ordering=["-created_at"]
        constraints=[models.UniqueConstraint(fields=["organization","code"],name="unique_org_referral_code")]
