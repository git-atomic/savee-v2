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
    <div className="flex flex-col h-full w-full overflow-y-auto">
      <div className="flex flex-col border-t border-border bg-background min-h-full">
        <div className="flex flex-col p-6 lg:p-8 pb-8">
          <div className="mb-6 shrink-0">
            <h1 className="text-2xl font-bold tracking-tight">Metrics</h1>
            {/* <p className="text-muted-foreground text-sm mt-2">
              Comprehensive system metrics, database statistics, and storage analytics
            </p> */}
          </div>
          <div className="flex-1">
            <MetricsDashboard />
          </div>
        </div>
      </div>
    </div>
  );
}
