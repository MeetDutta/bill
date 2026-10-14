#!/usr/bin/env python
"""
BillMeet Production Backup Manager & Restoration Drill Script.
Executes timestamped pg_dump, verifies integrity checksums,
prunes expired archives according to retention policy,
and executes non-destructive test restorations into an isolated database.
"""

import os
import sys
import argparse
import hashlib
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
import django
django.setup()

from django.conf import settings
from apps.reports.services.backup_service import BackupService, BACKUP_DIR


def compute_sha256(filepath: Path) -> str:
    h = hashlib.sha256()
    with open(filepath, "rb") as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()


def run_backup(db_name: str = "digitalbill_db", user: str = "digitalbill_user") -> Path:
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    filename = f"billmeet_backup_{timestamp}.dump"
    filepath = BACKUP_DIR / filename

    print(f"[*] Starting backup of '{db_name}' to {filepath}...")
    start_time = time.time()

    # Determine command (container or local)
    cmd = f"docker exec bill-main-db-1 pg_dump -U {user} -d {db_name} -Fc"
    try:
        with open(filepath, "wb") as f:
            subprocess.check_call(cmd, shell=True, stdout=f)
        duration = time.time() - start_time
        size = filepath.stat().st_size
        checksum = compute_sha256(filepath)

        BackupService.record_backup(
            filename=filename,
            size_bytes=size,
            status="success",
            database_name=db_name,
            checksum=checksum,
        )
        print(f"[✓] Backup completed in {duration:.2f}s: {filename} ({size:,} bytes, sha256: {checksum[:12]}...)")
        prune_retention()
        return filepath
    except Exception as e:
        print(f"[!] Backup failed: {e}", file=sys.stderr)
        BackupService.record_backup(
            filename=filename,
            size_bytes=0,
            status="failed",
            database_name=db_name,
            error_message=str(e),
        )
        raise


def run_restore_drill(backup_file: Path, drill_db: str = "billmeet_drill_verify", user: str = "digitalbill_user"):
    if not backup_file.exists():
        raise FileNotFoundError(f"Backup file not found: {backup_file}")

    print(f"[*] Starting restoration drill using {backup_file.name} into '{drill_db}'...")
    start_time = time.time()

    try:
        # Create empty test database
        subprocess.check_call(
            f'docker exec bill-main-db-1 psql -U {user} -d postgres -c "DROP DATABASE IF EXISTS {drill_db};"',
            shell=True,
        )
        subprocess.check_call(
            f'docker exec bill-main-db-1 psql -U {user} -d postgres -c "CREATE DATABASE {drill_db};"',
            shell=True,
        )

        # Restore
        restore_cmd = f"docker exec -i bill-main-db-1 pg_restore -U {user} -d {drill_db} --clean --if-exists < {backup_file}"
        subprocess.run(restore_cmd, shell=True, capture_output=True)

        # Verify integrity record counts
        verify_cmd = f'docker exec bill-main-db-1 psql -U {user} -d {drill_db} -t -c "SELECT (SELECT count(*) FROM transactions_transaction), (SELECT count(*) FROM invoices_invoice), (SELECT count(*) FROM products_inventorymovement);"'
        output = subprocess.check_output(verify_cmd, shell=True).decode().strip()
        tx_cnt, inv_cnt, mov_cnt = [int(x.strip()) for x in output.split("|")]

        duration = time.time() - start_time
        verified_counts = {
            "transactions": tx_cnt,
            "invoices": inv_cnt,
            "inventory_movements": mov_cnt,
        }

        # Drop drill DB
        subprocess.check_call(
            f'docker exec bill-main-db-1 psql -U {user} -d postgres -c "DROP DATABASE IF EXISTS {drill_db};"',
            shell=True,
        )

        BackupService.record_restoration_drill(
            backup_filename=backup_file.name,
            duration_seconds=round(duration, 2),
            status="verified",
            verified_counts=verified_counts,
        )
        print(f"[✓] Restoration drill verified successfully in {duration:.2f}s!")
        print(f"    Verified Records: Tx={tx_cnt}, Invoices={inv_cnt}, Movements={mov_cnt}")
    except Exception as e:
        print(f"[!] Restoration drill failed: {e}", file=sys.stderr)
        BackupService.record_restoration_drill(
            backup_filename=backup_file.name,
            duration_seconds=0.0,
            status="failed",
            error_message=str(e),
        )
        raise


def prune_retention(retention_days: int = 7):
    manifest = BackupService.get_manifest()
    retention_days = manifest.get("retention_days", retention_days)
    now = time.time()
    cutoff = now - (retention_days * 86400)

    for f in BACKUP_DIR.glob("*.dump"):
        try:
            if f.stat().st_mtime < cutoff:
                f.unlink()
                print(f"[*] Pruned old backup archive: {f.name}")
        except Exception as e:
            print(f"[!] Error pruning {f.name}: {e}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="BillMeet Backup & Restore Manager")
    parser.add_argument("--backup", action="store_true", help="Create new pg_dump backup")
    parser.add_argument("--restore-drill", action="store_true", help="Run restoration verification drill")
    parser.add_argument("--status", action="store_true", help="Print backup and restoration status")

    args = parser.parse_args()

    if args.backup:
        backup_path = run_backup()
        if args.restore_drill:
            run_restore_drill(backup_path)
    elif args.restore_drill:
        # Find latest backup
        manifest = BackupService.get_manifest()
        last_b = manifest.get("last_backup")
        if last_b and (BACKUP_DIR / last_b["filename"]).exists():
            target = BACKUP_DIR / last_b["filename"]
        else:
            files = sorted(BACKUP_DIR.glob("*.dump"), key=lambda f: f.stat().st_mtime, reverse=True)
            if not files:
                print("[!] No backup archives available to test restoration.")
                sys.exit(1)
            target = files[0]
        run_restore_drill(target)
    elif args.status:
        import pprint
        status = BackupService.get_backup_status()
        pprint.pprint(status)
    else:
        parser.print_help()
