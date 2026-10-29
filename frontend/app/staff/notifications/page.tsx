"use client";

import React from "react";
import { NotificationCenter } from "@/components/notifications/NotificationCenter";

export default function StaffNotificationsPage() {
  return <NotificationCenter userRole="staff" />;
}

