import { getPayload } from "payload";
import configPromise from "@payload-config";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { JobsList } from "@/components/engine/manage-jobs/JobsList";

export default async function JobsPage() {
  const payload = await getPayload({ config: configPromise });
  const { user } = await payload.auth({ headers: await headers() });

  if (!user) {
    redirect("/admin/login?redirect=%2Fadmin%2Fengine%2Fjobs");
  }

  return (
    <div className="flex flex-col h-full w-full overflow-hidden">
      <div className="flex flex-col flex-1 border-t border-border overflow-hidden bg-background min-w-0">
        <div className="flex flex-col h-full p-6 gap-6">
          <div className="shrink-0">
            <h1 className="text-2xl font-bold">Manage Jobs</h1>
            <p className="text-muted-foreground text-sm mt-1">
              View and manage all scraping jobs
            </p>
          </div>
          <div className="flex-1 min-h-0 overflow-hidden">
            <JobsList />
          </div>
        </div>
      </div>
    </div>
  );
}








