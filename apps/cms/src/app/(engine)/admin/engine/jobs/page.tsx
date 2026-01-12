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
    <div className="flex flex-col h-full w-full overflow-y-auto">
      <div className="flex flex-col border-t border-border bg-background min-h-full">
        <div className="flex flex-col p-8 pb-8">
          <div className="mb-6 shrink-0">
            <h1 className="text-2xl font-bold tracking-tight">Manage Jobs</h1>
            {/* <p className="text-muted-foreground text-sm mt-2">
              View and manage all scraping jobs
            </p> */}
          </div>
          <div className="flex-1">
            <JobsList />
          </div>
        </div>
      </div>
    </div>
  );
}
