"use client";

import { Suspense } from "react";
import { SearchBlocksList } from "@/components/SearchBlocksList";
import { MasonrySkeleton } from "@/components/MasonrySkeleton";
import { useMasonryColumns } from "@/hooks/use-masonry-columns";

function SearchContent() {
  return <SearchBlocksList />;
}

export default function SearchPage() {
  const columns = useMasonryColumns();
  
  return (
    <Suspense
      fallback={
        <div
          className="min-h-screen"
          style={{
            paddingTop: "var(--page-margin)",
            paddingBottom: "var(--page-margin)",
            paddingLeft: "var(--page-margin)",
            paddingRight: "var(--page-margin)",
          }}
        >
          <MasonrySkeleton
            columns={columns}
            count={columns * 6}
            blocks={undefined}
          />
        </div>
      }
    >
      <SearchContent />
    </Suspense>
  );
}
