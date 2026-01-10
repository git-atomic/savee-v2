import { getPayload } from "payload";
import configPromise from "@payload-config";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { MetricsDashboard } from "@/components/engine/metrics/MetricsDashboard";

export default async function MetricsPage() {
  const payload = await getPayload({ config: configPromise });
  const { user } = await payload.auth({ headers: await headers() });

  if (!user) {
    redirect("/admin/login?redirect=%2Fadmin%2Fengine%2Fmetrics");
  }

  return (
    <div className="flex flex-col h-full w-full p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Metrics</h1>
        <p className="text-muted-foreground text-sm mt-1">
          System metrics and job statistics
        </p>
      </div>
      <MetricsDashboard />
    </div>
  );
}








