import { DashboardClient } from "../components/DashboardClient";
import { dashboardConfig } from "../lib/contracts";

export default function DashboardPage() {
  return <DashboardClient config={dashboardConfig} />;
}

