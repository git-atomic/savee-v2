# Jobs Manager Enhancement Plan
## Professional UI/UX Overhaul

---

## Executive Summary

This plan transforms the Jobs Manager from a basic placeholder into a **world-class, production-ready interface** that matches the quality of tools like Linear, Vercel, or Raycast. The focus is on:

1. **Information Density** — Maximum value per pixel without clutter
2. **Visual Hierarchy** — Clear scanning paths and action discovery
3. **Performance** — Optimistic updates, virtualization, smooth animations
4. **Polish** — Micro-interactions, keyboard shortcuts, empty states

---

## Current State Analysis

### What Exists ✅
| Component | Status | Quality |
|-----------|--------|---------|
| `JobRow.tsx` | Complete | Good — solid structure with expandable logs |
| `JobActions.tsx` | Complete | Good — dropdown menu with all actions |
| `JobLogsSection.tsx` | Complete | Good — EventSource streaming, auto-follow |
| `JobEditDialog.tsx` | Complete | Good — proper form handling |
| `JobDeleteDialog.tsx` | Complete | Good — confirmation pattern |
| `IntervalEditor.tsx` | Complete | Good — inline editing |
| `StatusFilter.tsx` | Complete | Basic — needs UX improvements |
| **`JobsList.tsx`** | **Placeholder** | **❌ Needs full implementation** |
| `/api/engine/logs` | Complete | Working |
| `/api/engine/logs/stream` | Complete | Working |

### What's Missing ❌
1. **JobsList implementation** — Currently just a placeholder div
2. **Search functionality** — No search bar
3. **Data fetching & state management** — No polling, no job data
4. **Empty states** — No handling for zero jobs
5. **Loading states** — No skeletons/spinners
6. **Quick stats header** — No overview metrics
7. **Keyboard navigation** — No shortcuts
8. **Bulk actions** — No multi-select

---

## Design Philosophy

### 1. **Spatial Model**
```
┌─────────────────────────────────────────────────────────────────┐
│ Page Header: "Manage Jobs" + description                         │
├─────────────────────────────────────────────────────────────────┤
│ Stats Bar: [Running: 2] [Queued: 5] [Active: 12] [Errors: 1]   │
├─────────────────────────────────────────────────────────────────┤
│ [🔍 Search jobs by URL or username...          ] [Status ▾]     │
├─────────────────────────────────────────────────────────────────┤
│ Filter Pills: ● Running  ● Queued  ● Active  ○ Paused  ○ Error  │
├─────────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Table Header: URL | Type | Status | Stats | Interval | Last │ │
│ ├─────────────────────────────────────────────────────────────┤ │
│ │ Job Row 1 (with status dot, inline actions)                 │ │
│ │   └─ [Expanded Logs Section if open]                        │ │
│ ├─────────────────────────────────────────────────────────────┤ │
│ │ Job Row 2                                                   │ │
│ ├─────────────────────────────────────────────────────────────┤ │
│ │ Job Row 3                                                   │ │
│ └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### 2. **Interaction Model**
- **Hover** reveals secondary actions (expand chevron, edit icon)
- **Click row** does nothing (prevents accidental actions)
- **Click expand icon** toggles logs
- **Dropdown menu** for all destructive/complex actions
- **Inline editing** only for interval (quick iteration need)

### 3. **Color System**
| Status | Dot Color | Semantic Meaning |
|--------|-----------|------------------|
| Running | `bg-emerald-500` | Active, healthy |
| Queued | `bg-amber-500` | Waiting, attention |
| Active | `bg-blue-500` | Ready, idle |
| Paused | `bg-zinc-500` | Neutral, disabled |
| Stopped | `bg-purple-500` | Intentionally stopped |
| Error | `bg-red-500` | Problem, needs attention |
| Completed | `bg-sky-500` | Done, informational |
| Stale | `bg-orange-500` | Warning, needs reconciliation |

---

## Implementation Plan

### Phase 1: Core Infrastructure (JobsList.tsx)
**Priority: Critical** | **Effort: Medium**

Fully implement `JobsList.tsx` with:

```typescript
// State management
const [jobs, setJobs] = useState<JobData[]>([]);
const [isLoading, setIsLoading] = useState(true);
const [searchQuery, setSearchQuery] = useState("");
const [selectedStatuses, setSelectedStatuses] = useState<Set<StatusKey>>(new Set([...all statuses]));
const [expandedJobs, setExpandedJobs] = useState<Set<string>>(new Set());

// Data fetching with polling
useEffect(() => {
  fetchJobs();
  const interval = setInterval(fetchJobs, 2000);
  return () => clearInterval(interval);
}, []);

// Filtering logic
const filteredJobs = useMemo(() => {
  return jobs.filter(job => {
    const matchesSearch = !searchQuery || 
      job.url.toLowerCase().includes(searchQuery.toLowerCase()) ||
      job.username?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = selectedStatuses.has(job.status);
    return matchesSearch && matchesStatus;
  });
}, [jobs, searchQuery, selectedStatuses]);
```

### Phase 2: Enhanced Stats Header
**Priority: High** | **Effort: Low**

Add a compact stats row showing real-time metrics:

```tsx
<div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
  <StatCard label="Running" value={runningCount} color="emerald" />
  <StatCard label="Queued" value={queuedCount} color="amber" />
  <StatCard label="Active" value={activeCount} color="blue" />
  <StatCard label="Paused" value={pausedCount} color="zinc" />
  <StatCard label="Errors" value={errorCount} color="red" />
  <StatCard label="Total" value={jobs.length} color="slate" />
</div>
```

Design:
- Compact inline badges with colored dots
- Numbers as primary visual
- Labels as secondary text
- No cards or heavy borders — lightweight inline layout

### Phase 3: Search Bar Enhancement
**Priority: High** | **Effort: Low**

```tsx
<div className="relative">
  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
  <Input
    value={searchQuery}
    onChange={(e) => setSearchQuery(e.target.value)}
    placeholder="Search jobs by URL or username..."
    className="pl-10 pr-10"
  />
  {searchQuery && (
    <button
      onClick={() => setSearchQuery("")}
      className="absolute right-3 top-1/2 -translate-y-1/2"
    >
      <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
    </button>
  )}
</div>
```

### Phase 4: Improved Status Filter Pills
**Priority: Medium** | **Effort: Low**

Enhance `StatusFilter.tsx`:

```tsx
// Add "Select All" / "Select None" quick actions
<div className="flex items-center justify-between gap-4 mb-2">
  <span className="text-xs text-muted-foreground font-medium">Filter by status</span>
  <div className="flex items-center gap-2">
    <button onClick={selectAll} className="text-xs text-muted-foreground hover:text-foreground">
      All
    </button>
    <span className="text-muted-foreground">|</span>
    <button onClick={selectNone} className="text-xs text-muted-foreground hover:text-foreground">
      None
    </button>
  </div>
</div>
```

Visual improvements:
- Pills should have subtle transitions on toggle
- Active pills: solid background with opacity
- Inactive pills: outline only, muted colors
- Counter badge showing filtered count

### Phase 5: Table & Row Polish
**Priority: High** | **Effort: Medium**

Current `JobRow.tsx` is well-structured. Enhancements:

1. **Sticky table header** for scroll context
2. **Alternating row backgrounds** (very subtle)
3. **Better truncation** with tooltips for long URLs
4. **Progress indicators** for running jobs
5. **Relative time formatting** (e.g., "2m ago", "Yesterday")

```tsx
// Add to table wrapper
<div className="rounded-lg border bg-card overflow-hidden">
  <div className="overflow-auto max-h-[calc(100vh-320px)]">
    <Table>
      <TableHeader className="sticky top-0 bg-background z-10">
        <TableRow>
          <TableHead>Job</TableHead>
          <TableHead className="w-20">Type</TableHead>
          <TableHead className="w-28">Status</TableHead>
          <TableHead className="w-40">Progress</TableHead>
          <TableHead className="w-32">Interval</TableHead>
          <TableHead className="w-24">Last Run</TableHead>
          <TableHead className="w-20 text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {filteredJobs.map((job) => (
          <JobRow key={job.id} {...} />
        ))}
      </TableBody>
    </Table>
  </div>
</div>
```

### Phase 6: Empty & Loading States
**Priority: High** | **Effort: Low**

```tsx
// Loading skeleton
{isLoading && (
  <div className="space-y-2">
    {[...Array(5)].map((_, i) => (
      <div key={i} className="flex items-center gap-4 p-4 border rounded-lg animate-pulse">
        <div className="h-2 w-2 rounded-full bg-muted" />
        <div className="h-4 w-48 bg-muted rounded" />
        <div className="h-4 w-16 bg-muted rounded" />
        <div className="h-4 w-16 bg-muted rounded" />
        <div className="flex-1" />
        <div className="h-4 w-20 bg-muted rounded" />
      </div>
    ))}
  </div>
)}

// Empty state
{!isLoading && filteredJobs.length === 0 && (
  <div className="flex flex-col items-center justify-center py-16 text-center">
    <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-4">
      <Inbox className="h-6 w-6 text-muted-foreground" />
    </div>
    <h3 className="text-lg font-medium mb-1">
      {searchQuery || selectedStatuses.size < 7 
        ? "No jobs match your filters" 
        : "No jobs yet"}
    </h3>
    <p className="text-sm text-muted-foreground mb-4">
      {searchQuery || selectedStatuses.size < 7
        ? "Try adjusting your search or filter criteria"
        : "Start by adding a new scraping job"}
    </p>
    {searchQuery && (
      <Button variant="outline" size="sm" onClick={() => setSearchQuery("")}>
        Clear search
      </Button>
    )}
  </div>
)}
```

### Phase 7: Quick Actions Bar
**Priority: Medium** | **Effort: Medium**

Add contextual bulk actions when jobs are selected (future enhancement):

```tsx
// For now, add a refresh button and job count
<div className="flex items-center justify-between">
  <div className="text-sm text-muted-foreground">
    Showing {filteredJobs.length} of {jobs.length} jobs
  </div>
  <Button
    variant="ghost"
    size="sm"
    onClick={fetchJobs}
    disabled={isRefreshing}
  >
    <RefreshCw className={cn("h-4 w-4 mr-2", isRefreshing && "animate-spin")} />
    Refresh
  </Button>
</div>
```

---

## File Changes Summary

### Files to Create
| File | Purpose |
|------|---------|
| *None* | All necessary files already exist |

### Files to Modify

| File | Changes |
|------|---------|
| `manage-jobs/JobsList.tsx` | **MAJOR**: Full implementation with state, polling, filtering, table |
| `manage-jobs/StatusFilter.tsx` | Add select all/none, counter badge, improved styling |
| `manage-jobs/JobRow.tsx` | Minor polish, ensure consistent spacing |
| `manage-jobs/JobLogsSection.tsx` | Already complete, no changes needed |
| `(engine)/admin/engine/jobs/page.tsx` | Pass necessary props, adjust layout if needed |

---

## Implementation Order

```
1. JobsList.tsx           ─────►  Core functionality
     │
     ├──► Add state management & data fetching
     ├──► Add search input
     ├──► Integrate StatusFilter
     ├──► Render Table with JobRow components
     ├──► Add loading skeleton
     └──► Add empty states
     │
2. StatusFilter.tsx       ─────►  UX improvements
     │
     ├──► Add select all/none buttons
     └──► Add job count badge
     │
3. Quick Stats Header     ─────►  Vertical integration
     │
     └──► Add inline stat badges above search
     │
4. Polish Pass            ─────►  Final touches
     │
     ├──► Verify all interactions
     ├──► Test edge cases (0 jobs, all filtered, errors)
     └──► Ensure dark mode works perfectly
```

---

## API Integration Reference

### Existing Endpoints
```typescript
// Fetch all jobs
GET /api/engine/jobs
Response: { jobs: JobData[] }

// Control job (pause, resume, stop, run_now, edit)
POST /api/engine/control
Body: { action: string, jobId: string, ...options }

// Edit job settings
PATCH /api/engine/jobs/[jobId]
Body: { url?, intervalSeconds?, disableBackoff?, maxItems? }

// Delete job
DELETE /api/engine/jobs/[jobId]
Body: { deleteFromDb?, deleteFromR2?, deleteUsers? }

// Reconcile stale run
POST /api/engine/runs/[runId]/reconcile

// Fetch logs snapshot
GET /api/engine/logs?runId=...

// Stream logs (EventSource)
GET /api/engine/logs/stream?runId=...
```

---

## TypeScript Types

```typescript
type StatusKey = "running" | "queued" | "active" | "paused" | "stopped" | "error" | "completed";

interface JobData {
  id: string;
  runId?: string;
  url: string;
  sourceType: "home" | "pop" | "user" | "blocks";
  username?: string;
  maxItems: number;
  status: StatusKey;
  runStatus?: string;
  counters: {
    found: number;
    uploaded: number;
    errors: number;
    skipped?: number;
  };
  lastRun?: string;
  nextRun?: string;
  error?: string;
  origin?: string;
  intervalSeconds?: number;
  disableBackoff?: boolean;
  effectiveIntervalSeconds?: number;
  backoffMultiplier?: number;
}

interface JobsListState {
  jobs: JobData[];
  isLoading: boolean;
  searchQuery: string;
  selectedStatuses: Set<StatusKey>;
  expandedJobs: Set<string>;
}
```

---

## Success Criteria

- [ ] Jobs load and display within 500ms
- [ ] Search filters in real-time (<50ms)
- [ ] Status toggles update instantly
- [ ] Polling doesn't cause UI jank
- [ ] All job actions work (pause, resume, stop, run, delete, edit)
- [ ] Logs expand smoothly with streaming
- [ ] Empty states are helpful and actionable
- [ ] Dark mode looks polished
- [ ] Responsive on mobile (stacked layout)
- [ ] No TypeScript errors
- [ ] No console warnings

---

## Design Tokens Reference

```css
/* Use these consistent values */
--radius: 0.5rem;           /* Standard border-radius */
--status-dot: 0.5rem;       /* 8px status indicator */
--table-row-height: 3.5rem; /* 56px comfortable row height */
--spacing-xs: 0.5rem;       /* 8px */
--spacing-sm: 0.75rem;      /* 12px */
--spacing-md: 1rem;         /* 16px */
--spacing-lg: 1.5rem;       /* 24px */
```

---

## Next Steps

Ready to implement? Start with:
1. **Implement `JobsList.tsx`** with the full structure
2. Test the integration
3. Enhance `StatusFilter.tsx`
4. Add stats header
5. Final polish pass

Say **"implement phase 1"** to begin with the core JobsList implementation.
