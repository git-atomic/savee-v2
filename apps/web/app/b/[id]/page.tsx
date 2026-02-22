import { BlockDetails } from "@/components/BlockDetails";
import { notFound } from "next/navigation";

interface PageProps {
  params: Promise<{ id: string }>;
}

async function fetchBlock(id: string) {
  const cmsUrl = process.env.CMS_URL || "http://localhost:3000";
  try {
    const res = await fetch(`${cmsUrl}/api/blocks?externalId=${id}&limit=1`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.success || !Array.isArray(data.blocks) || data.blocks.length === 0) {
      return null;
    }
    return data.blocks[0];
  } catch (error) {
    console.error("Error fetching block:", error);
    return null;
  }
}

export default async function BlockPage({ params }: PageProps) {
  const { id } = await params;
  const block = await fetchBlock(id);
  if (!block) {
    return notFound();
  }

  return (
    <div className="w-full min-h-screen bg-background">
      <BlockDetails key={block.external_id || block.id} block={block} isModal={false} />
    </div>
  );
}
