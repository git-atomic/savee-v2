# Jobs Manager UI Structure

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Page Header (from page.tsx)                                                │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ Manage Jobs                                                          │   │
│  │ View and manage all scraping jobs                                   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │  JobsList Component                                                    │ │
│  │                                                                         │ │
│  │  Stats Row                                                             │ │
│  │  ┌────────┬────────┬────────┬────────┬────────┬────────┐              │ │
│  │  │● Run:2 │● Que:5 │● Act:12│○ Pau:0 │● Err:1 │• Tot:20│              │ │
│  │  └────────┴────────┴────────┴────────┴────────┴────────┘              │ │
│  │                                                                         │ │
│  │  Search & Controls                                                     │ │
│  │  ┌────────────────────────────────────────────────────┬─────────┐     │ │
│  │  │ 🔍 Search jobs by URL or username...               │ Refresh │     │ │
│  │  └────────────────────────────────────────────────────┴─────────┘     │ │
│  │                                                                         │ │
│  │  Filter Section                                                        │ │
│  │  Filter by status                     Showing 15 of 20 jobs           │ │
│  │  ┌──────┬──────┬──────┬──────┬──────┬──────┬──────┐                  │ │
│  │  │●Run  │●Que  │●Act  │○Pau  │○Stop │●Err  │●Comp │                  │ │
│  │  └──────┴──────┴──────┴──────┴──────┴──────┴──────┘                  │ │
│  │  [Select All] • [Select None]                                         │ │
│  │                                                                         │ │
│  │  Jobs Table                                                            │ │
│  │  ┌───────────────────────────────────────────────────────────────┐    │ │
│  │  │ Job              │Type│Status│Progress│Interval│LastRun│Actions│    │ │
│  │  ├───────────────────────────────────────────────────────────────┤    │ │
│  │  │ ● savee.it...    │Home│●Run  │123/50/2│60s    │2m ago │ ⋮ ▼  │    │ │
│  │  │ ● savee.it/pop   │Pop │●Que  │0/0/0   │30s ⚡ │5m ago │ ⋮    │    │ │
│  │  │ ● savee.it/user  │User│●Act  │45/45/0 │—      │1h ago │ ⋮    │    │ │
│  │  │ ○ savee.it/test  │Home│○Pau  │10/8/1  │120s   │Never  │ ⋮    │    │ │
│  │  │ ● savee.it/err   │User│●Err  │5/0/5   │60s    │Just   │ ⋮    │    │ │
│  │  │   └─ [Expanded Logs Section]                                │    │ │
│  │  │      ┌─────────────────────────────────────────────────────┐ │    │ │
│  │  │      │ Logs            [Auto-follow] [Refresh] [Jump ↓]   │ │    │ │
│  │  │      ├─────────────────────────────────────────────────────┤ │    │ │
│  │  │      │ Time    │Stage│URL           │Status│Duration       │ │    │ │
│  │  │      ├─────────────────────────────────────────────────────┤ │    │ │
│  │  │      │12:34:56 │FETCH│savee.it/item │  ✓   │250ms         │ │    │ │
│  │  │      │12:34:57 │SCRPE│savee.it/item │  ✓   │1.2s          │ │    │ │
│  │  │      │12:34:58 │UPLD │image.jpg     │  ✓   │800ms         │ │    │ │
│  │  │      └─────────────────────────────────────────────────────┘ │    │ │
│  │  ├───────────────────────────────────────────────────────────────┤    │ │
│  │  │ ... more jobs ...                                            │    │ │
│  │  └───────────────────────────────────────────────────────────────┘    │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  Dialogs (Portaled)                                                         │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐            │
│  │ Edit Job Dialog │  │Delete Confirm   │  │More dialogs...  │            │
│  │ • URL input     │  │• Type URL       │  │                 │            │
│  │ • Max items     │  │• Checkboxes     │  │                 │            │
│  │ • Type select   │  │• Safety checks  │  │                 │            │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘            │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Component Hierarchy

```
page.tsx (Server Component)
└─ JobsList.tsx (Client Component) ─────────────────────┐
   │                                                      │
   ├─ StatBadge × 6 (inline)                            │
   │  ├─ Running: 2                                      │
   │  ├─ Queued: 5                                       │
   │  ├─ Active: 12                                      │
   │  ├─ Paused: 0                                       │
   │  ├─ Errors: 1                                       │
   │  └─ Total: 20                                       │
   │                                                      │
   ├─ Search Input (lucide icons)                        │
   │                                                      │
   ├─ StatusFilter.tsx                                   │
   │  ├─ Status pills (7 statuses)                       │
   │  └─ Select All/None buttons                         │
   │                                                      │
   ├─ LoadingSkeleton (conditional)                      │
   │  └─ 5× skeleton rows                                │
   │                                                      │
   ├─ EmptyState (conditional)                           │
   │  ├─ Icon + message                                  │
   │  └─ Action buttons                                  │
   │                                                      │
   └─ Table (shadcn)                                     │
      ├─ TableHeader (sticky)                            │
      └─ TableBody                                       │
         └─ JobRow.tsx × N ─────────────────────────────┤
            │                                             │
            ├─ Job URL + status dot                      │
            ├─ Type badge                                 │
            ├─ Status badge                               │
            ├─ Stats (found/uploaded/errors)              │
            ├─ IntervalEditor.tsx                         │
            ├─ Last run timestamp                         │
            │                                             │
            ├─ JobActions.tsx (dropdown)                  │
            │  ├─ Pause/Resume                            │
            │  ├─ Run Now/Force Run                       │
            │  ├─ Stop                                    │
            │  ├─ Reconcile (if stale)                    │
            │  ├─ View/Hide Logs                          │
            │  ├─ Edit                                    │
            │  └─ Delete                                  │
            │                                             │
            ├─ JobLogsSection.tsx (if expanded) ─────────┤
            │  ├─ Controls (auto-follow, refresh, jump)  │
            │  ├─ Table header (time/stage/url/status)   │
            │  └─ Log entries (SSE streaming)             │
            │                                             │
            ├─ JobEditDialog.tsx ────────────────────────┤
            │  ├─ URL input                               │
            │  ├─ Max items input                         │
            │  └─ Type select                             │
            │                                             │
            └─ JobDeleteDialog.tsx ──────────────────────┘
               ├─ URL confirmation input
               ├─ Deletion options (DB/R2/Users)
               └─ Safety warnings
```

## State Flow

```
┌──────────────────────────────────────────────────────────────┐
│  JobsList.tsx (State Manager)                                │
│                                                               │
│  State:                                                       │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ jobs: JobData[]                  ← API              │    │
│  │ isLoading: boolean               ← Initial load     │    │
│  │ isRefreshing: boolean            ← Manual refresh   │    │
│  │ searchQuery: string              ← User input       │    │
│  │ selectedStatuses: Set<StatusKey> ← Filter pills     │    │
│  │ expandedJobs: Set<string>        ← Toggle state     │    │
│  │ processingJobs: Set<string>      ← Optimistic UI    │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                               │
│  Effects:                                                     │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ useEffect(() => {                                    │    │
│  │   fetchJobs();                    // Initial load    │    │
│  │   setInterval(fetchJobs, 2000);   // Auto-refresh    │    │
│  │ }, []);                                              │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                               │
│  Computed:                                                    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ stats = useMemo(() => calculate(jobs))               │    │
│  │ filteredJobs = useMemo(() => filter(jobs, ...))      │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                               │
│  Actions:                                                     │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ handlePause/Resume/Stop/Delete/RunNow/ForceRun       │    │
│  │   → setProcessingJobs(add jobId)                     │    │
│  │   → await fetch(action)                              │    │
│  │   → await fetchJobs()                                │    │
│  │   → setProcessingJobs(remove jobId)                  │    │
│  │   → toast(result)                                    │    │
│  └─────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────┘
```

## Data Flow

```
API                    JobsList                Child Components
─────                  ──────────              ────────────────

/api/engine/jobs
      │
      ├─────────────► jobs[]
                        │
                        ├──► stats (computed)
                        │      └──► StatBadge × 6
                        │
                        ├──► searchQuery
                        │      └──► Input
                        │
                        ├──► selectedStatuses
                        │      └──► StatusFilter
                        │
                        └──► filteredJobs
                               └──► JobRow × N
                                      │
                                      ├──► job data (display)
                                      ├──► JobActions
                                      ├──► JobLogsSection
                                      ├──► JobEditDialog
                                      └──► JobDeleteDialog

User Actions           Handler                API Call
────────────           ───────                ────────

Click "Pause"
      │
      ├─────────────► handlePause(jobId)
                        │
                        ├──► setProcessing(+jobId)
                        ├──► POST /api/engine/control
                        ├──► fetchJobs()
                        ├──► setProcessing(-jobId)
                        └──► toast(result)

Click "Delete"
      │
      ├─────────────► JobDeleteDialog.open
                        │
                        └──► (on confirm)
                               │
                               └──► DELETE /api/engine/jobs/:id
```

## Legend

```
● = Active/enabled state
○ = Inactive/disabled state
⋮ = Menu icon (MoreVertical)
▼ = Expand chevron
⚡ = Adaptive backoff enabled
✓ = Success status
✗ = Error status
⏳ = Pending status
```
