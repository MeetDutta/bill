from rest_framework import serializers
from .models import Review, Referral

class ReviewSerializer(serializers.ModelSerializer):
    customer_name=serializers.CharField(source="customer.full_name",read_only=True)
    class Meta:
        model=Review
        fields=["id","customer","customer_name","transaction","rating","comment","status","source","created_at"]
        read_only_fields=["id","organization","created_at"]

class ReferralSerializer(serializers.ModelSerializer):
    referrer_name=serializers.CharField(source="referrer.full_name",read_only=True)
    class Meta:
        model=Referral
        fields=["id","referrer","referrer_name","referred_phone","referred_name","code","status","reward_points","qualified_transaction","rewarded_at","created_at"]
        read_only_fields=["id","organization","created_at","rewarded_at"]
