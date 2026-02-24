import { BlockDetails } from "@/components/BlockDetails";
import { notFound } from "next/navigation";

interface PageProps {
  params: Promise<{ id: string }>;
}

function extractBlockFromResponse(data: any, id: string) {
  const blocks = Array.isArray(data?.blocks)
    ? data.blocks
    : Array.isArray(data?.docs)
      ? data.docs
      : [];

  if (!Array.isArray(blocks) || blocks.length === 0) return null;

  const idLower = String(id).toLowerCase();
  return (
    blocks.find(
      (block: any) => String(block?.external_id || "").toLowerCase() === idLower
    ) ||
    blocks.find((block: any) => String(block?.id || "") === String(id)) ||
    null
  );
}

async function fetchBlock(id: string) {
  const cmsUrl = process.env.CMS_URL || "http://localhost:3000";
  try {
    const res = await fetch(`${cmsUrl}/api/blocks?externalId=${id}&limit=1`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = await res.json();
    let block = extractBlockFromResponse(data, id);

    if (!block && Array.isArray(data?.docs)) {
      const fallback = await fetch(
        `${cmsUrl}/api/blocks?where[external_id][equals]=${encodeURIComponent(
          id
        )}&limit=1`,
        { cache: "no-store" }
      );
      if (fallback.ok) {
        const fallbackData = await fallback.json();
        block = extractBlockFromResponse(fallbackData, id);
      }
    }
    return block;
  } catch (error) {
    console.error("Error fetching block:", error);
    return null;
  }
}

export default async function BlockModalPage({ params }: PageProps) {
  const { id } = await params;
  const block = await fetchBlock(id);
  if (!block) {
    return notFound();
  }

  return (
    <div className="fixed inset-0 z-50 flex h-screen w-full bg-background">
      <BlockDetails key={block.external_id || block.id} block={block} isModal={true} />
    </div>
  );
}
