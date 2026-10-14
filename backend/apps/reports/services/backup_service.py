import json
import logging
import os
import hashlib
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict

from django.conf import settings
from .alert_service import OperationalAlertService

logger = logging.getLogger(__name__)

BACKUP_DIR = Path(settings.BASE_DIR) / "backups"
MANIFEST_FILE = BACKUP_DIR / "backup_manifest.json"


class BackupService:
    """
    Manages and monitors PostgreSQL backup status, integrity metadata,
    retention policies, and restoration readiness drill results.
    """

    @classmethod
    def get_manifest(cls) -> Dict[str, Any]:
        if not BACKUP_DIR.exists():
            BACKUP_DIR.mkdir(parents=True, exist_ok=True)

        if not MANIFEST_FILE.exists():
            default_manifest = {
                "last_backup": None,
                "last_verified_restoration": None,
                "backups": [],
                "retention_days": 7,
            }
            with open(MANIFEST_FILE, "w") as f:
                json.dump(default_manifest, f, indent=2)
            return default_manifest

        try:
            with open(MANIFEST_FILE, "r") as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"Error reading backup manifest: {e}")
            return {"last_backup": None, "last_verified_restoration": None, "backups": [], "retention_days": 7}

    @classmethod
    def save_manifest(cls, manifest: Dict[str, Any]) -> None:
        if not BACKUP_DIR.exists():
            BACKUP_DIR.mkdir(parents=True, exist_ok=True)
        with open(MANIFEST_FILE, "w") as f:
            json.dump(manifest, f, indent=2)

    @classmethod
    def record_backup(
        cls,
        filename: str,
        size_bytes: int,
        status: str = "success",
        database_name: str = "digitalbill_db",
        checksum: str = "",
        error_message: str = "",
        organization=None,
    ) -> Dict[str, Any]:
        manifest = cls.get_manifest()
        now_iso = datetime.now(timezone.utc).isoformat()

        record = {
            "filename": filename,
            "timestamp": now_iso,
            "size_bytes": size_bytes,
            "status": status,
            "database_name": database_name,
            "checksum": checksum,
            "error_message": error_message,
        }

        manifest["backups"].insert(0, record)
        # Keep last 50 backup records in manifest
        manifest["backups"] = manifest["backups"][:50]

        if status == "success":
            manifest["last_backup"] = record
        else:
            if organization:
                OperationalAlertService.emit_alert(
                    organization=organization,
                    alert_type="BACKUP_FAILED",
                    severity="CRITICAL",
                    title="Automated PostgreSQL Backup Failed",
                    description=f"Backup failure: {error_message or 'Unknown error'}",
                    entity_type="backup",
                    entity_id=filename,
                    recommended_action="Inspect database logs and disk capacity immediately.",
                )

        cls.save_manifest(manifest)
        return record

    @classmethod
    def record_restoration_drill(
        cls,
        backup_filename: str,
        duration_seconds: float,
        status: str = "verified",
        verified_counts: Dict[str, int] = None,
        error_message: str = "",
        organization=None,
    ) -> Dict[str, Any]:
        manifest = cls.get_manifest()
        now_iso = datetime.now(timezone.utc).isoformat()

        record = {
            "backup_filename": backup_filename,
            "timestamp": now_iso,
            "duration_seconds": duration_seconds,
            "status": status,
            "verified_records": verified_counts or {},
            "error_message": error_message,
        }

        if status == "verified":
            manifest["last_verified_restoration"] = record
        else:
            if organization:
                OperationalAlertService.emit_alert(
                    organization=organization,
                    alert_type="RESTORE_DRILL_FAILED",
                    severity="CRITICAL",
                    title="Backup Restoration Drill Failed",
                    description=f"Restoration drill error: {error_message}",
                    entity_type="backup",
                    entity_id=backup_filename,
                    recommended_action="Validate backup archive format and PostgreSQL compatibility.",
                )

        cls.save_manifest(manifest)
        return record

    @classmethod
    def get_backup_status(cls, organization=None) -> Dict[str, Any]:
        manifest = cls.get_manifest()
        last_backup = manifest.get("last_backup")
        last_restore = manifest.get("last_verified_restoration")

        # Evaluate health
        health = "healthy"
        warning_msg = ""

        if not last_backup:
            health = "warning"
            warning_msg = "No automated backup records found."
        else:
            try:
                backup_time = datetime.fromisoformat(last_backup["timestamp"])
                age_hours = (datetime.now(timezone.utc) - backup_time).total_seconds() / 3600
                if age_hours > 24:
                    health = "warning"
                    warning_msg = f"Last backup is {age_hours:.1f} hours old (>24h)."
            except Exception:
                pass

        if not last_restore:
            if health == "healthy":
                health = "warning"
            warning_msg = (warning_msg + " Restoration drill has not yet been verified.").strip()

        # Calculate local storage
        total_size = 0
        if BACKUP_DIR.exists():
            for f in BACKUP_DIR.glob("*.dump"):
                try:
                    total_size += f.stat().st_size
                except Exception:
                    pass

        return {
            "health": health,
            "warning": warning_msg,
            "last_backup": last_backup,
            "last_verified_restoration": last_restore,
            "retention_days": manifest.get("retention_days", 7),
            "total_backup_files": len(manifest.get("backups", [])),
            "disk_usage_bytes": total_size,
            "history": manifest.get("backups", [])[:10],
        }

    @classmethod
    def verify_backup_checksum(cls, filepath: str, expected_sha256: str) -> bool:
        p = Path(filepath)
        if not p.exists():
            return False
        h = hashlib.sha256()
        with open(p, "rb") as f:
            while chunk := f.read(65536):
                h.update(chunk)
        return h.hexdigest().lower() == expected_sha256.lower()
