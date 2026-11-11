from django.db import migrations, models
from django.db.models import Count


def deduplicate_tally_ledger_configs(apps, schema_editor):
    TallyLedgerConfig = apps.get_model("billing", "TallyLedgerConfig")
    dup_orgs = (
        TallyLedgerConfig.objects.values("organization_id")
        .annotate(cnt=Count("id"))
        .filter(cnt__gt=1)
    )
    for row in dup_orgs:
        configs = list(
            TallyLedgerConfig.objects.filter(organization_id=row["organization_id"]).order_by(
                "-updated_at", "created_at", "id"
            )
        )
        for extra in configs[1:]:
            extra.delete()


class Migration(migrations.Migration):

    dependencies = [
        ("billing", "0009_businessconfig_alternate_phone_and_more"),
    ]

    operations = [
        migrations.RunPython(deduplicate_tally_ledger_configs, migrations.RunPython.noop),
        migrations.AddConstraint(
            model_name="tallyledgerconfig",
            constraint=models.UniqueConstraint(
                fields=("organization",),
                name="unique_tally_ledger_config_per_org",
            ),
        ),
    ]

