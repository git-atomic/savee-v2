import { fetchBlockById } from "@/lib/api";
import { BlockDetails } from "@/components/BlockDetails";
import { notFound } from "next/navigation";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function BlockPage({ params }: PageProps) {
  const { id } = await params;
  
  try {
    // Note: We need to use absolute URL for server-side fetch if it's not relative.
    // However, fetchBlockById uses relative /api/blocks/${id}.
    // For SSR, we should probably fetch directly from CMS if possible, 
    // or provide the full URL.
    
    // For now, let's assume fetchBlockById can be adapted or we use a server-side fetching logic.
    const CMS_URL = process.env.CMS_URL || "http://localhost:3000";
    const res = await fetch(`${CMS_URL}/api/blocks?externalId=${id}&limit=1`, { cache: 'no-store' });
    
    if (!res.ok) {
        return notFound();
    }
    
    const data = await res.json();
    
    if (!data.success || !data.blocks || data.blocks.length === 0) {
        return notFound();
    }

    const block = data.blocks[0];

    return (
      <div className="fixed inset-0 z-50 flex h-screen w-full bg-background">
        <BlockDetails block={block} isModal={false} />
      </div>
    );
  } catch (error) {
    console.error("Error fetching block:", error);
    return notFound();
  }
}
