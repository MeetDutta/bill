from django.db import migrations, models
import django.db.models.deletion
import uuid

class Migration(migrations.Migration):
    initial=True
    dependencies=[("organizations","0001_initial"),("customers","0003_alter_customer_customer_id"),("transactions","0002_initial")]
    operations=[
        migrations.CreateModel(name="Review",fields=[
            ("created_at",models.DateTimeField(auto_now_add=True,db_index=True)),("updated_at",models.DateTimeField(auto_now=True)),
            ("id",models.UUIDField(default=uuid.uuid4,editable=False,primary_key=True,serialize=False)),
            ("rating",models.PositiveSmallIntegerField(choices=[(1,"1"),(2,"2"),(3,"3"),(4,"4"),(5,"5")])),("comment",models.TextField(blank=True)),
            ("status",models.CharField(choices=[("private","Private"),("published","Published"),("resolved","Resolved")],default="private",max_length=20)),
            ("source",models.CharField(default="digital_bill",max_length=30)),
            ("customer",models.ForeignKey(on_delete=django.db.models.deletion.CASCADE,related_name="engagement_reviews",to="customers.customer")),
            ("organization",models.ForeignKey(on_delete=django.db.models.deletion.CASCADE,related_name="review_set",to="organizations.organization")),
            ("transaction",models.ForeignKey(blank=True,null=True,on_delete=django.db.models.deletion.SET_NULL,related_name="engagement_reviews",to="transactions.transaction"))],
            options={"ordering":["-created_at"],"indexes":[models.Index(fields=["organization","rating"],name="eng_review_org_rating"),models.Index(fields=["customer","created_at"],name="eng_review_cust_created")] }),
        migrations.CreateModel(name="Referral",fields=[
            ("created_at",models.DateTimeField(auto_now_add=True,db_index=True)),("updated_at",models.DateTimeField(auto_now=True)),
            ("id",models.UUIDField(default=uuid.uuid4,editable=False,primary_key=True,serialize=False)),
            ("referred_phone",models.CharField(max_length=20)),("referred_name",models.CharField(blank=True,max_length=150)),
            ("code",models.CharField(db_index=True,max_length=40)),("status",models.CharField(choices=[("pending","Pending"),("qualified","Qualified"),("rewarded","Rewarded"),("cancelled","Cancelled")],default="pending",max_length=20)),
            ("reward_points",models.DecimalField(decimal_places=2,default=0,max_digits=10)),("rewarded_at",models.DateTimeField(blank=True,null=True)),
            ("organization",models.ForeignKey(on_delete=django.db.models.deletion.CASCADE,related_name="referral_set",to="organizations.organization")),
            ("qualified_transaction",models.ForeignKey(blank=True,null=True,on_delete=django.db.models.deletion.SET_NULL,related_name="referral",to="transactions.transaction")),
            ("referrer",models.ForeignKey(on_delete=django.db.models.deletion.CASCADE,related_name="referrals_made",to="customers.customer"))],
            options={"ordering":["-created_at"],"constraints":[models.UniqueConstraint(fields=("organization","code"),name="unique_org_referral_code")]})
    ]
