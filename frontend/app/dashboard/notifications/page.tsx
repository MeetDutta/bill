"use client";

import React from "react";
import { NotificationCenter } from "@/components/notifications/NotificationCenter";

export default function DashboardNotificationsPage() {
  return <NotificationCenter userRole="admin" />;
}

