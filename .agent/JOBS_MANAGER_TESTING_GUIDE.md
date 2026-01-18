# Jobs Manager Testing Guide

## Quick Start

### 1. Access the Jobs Manager
Navigate to: **`/admin/engine/jobs`**

### 2. Prerequisites
- You need at least one job running to see the UI in action
- Add jobs at: `/admin/engine/add`

---

## Feature Testing Checklist

### ✅ **Initial Load**
- [ ] Page loads without errors
- [ ] Loading skeleton appears briefly
- [ ] Jobs table appears after load
- [ ] Stats badges show correct counts
- [ ] All UI elements are visible

### ✅ **Stats Dashboard**
- [ ] **Running** badge shows running jobs (green dot)
- [ ] **Queued** badge shows queued jobs (amber dot)
- [ ] **Active** badge shows active jobs (blue dot)
- [ ] **Paused** badge shows paused jobs (gray dot)
- [ ] **Errors** badge shows jobs with errors (red dot)
- [ ] **Total** badge shows all jobs (slate dot)
- [ ] Counts update in real-time (every 2s)

### ✅ **Search Functionality**
- [ ] Type in search box
- [ ] Jobs filter in real-time
- [ ] Search matches URL
- [ ] Search matches username
- [ ] Search is case-insensitive
- [ ] "Showing X of Y jobs" updates correctly
- [ ] Clear search works

### ✅ **Status Filter**
- [ ] All status pills are visible
- [ ] Click pill to toggle selection
- [ ] Active pills have solid background
- [ ] Inactive pills have muted appearance
- [ ] Status dots change opacity when inactive
- [ ] Multiple statuses can be selected
- [ ] "Select All" button works
- [ ] "Select None" button works
- [ ] Buttons disable when at max/min
- [ ] Filtered count updates correctly
- [ ] Smooth transitions on toggle

### ✅ **Jobs Table**
- [ ] Table header is visible
- [ ] Table header stays sticky on scroll
- [ ] All columns display correctly
  - [ ] Job URL (with status dot)
  - [ ] Type badge
  - [ ] Status badge
  - [ ] Progress (found/uploaded/errors)
  - [ ] Interval editor
  - [ ] Last run timestamp
  - [ ] Actions dropdown
- [ ] Rows hover effect works
- [ ] Status dots are color-coded correctly

### ✅ **Job Actions**
Open the actions dropdown (⋮) for any job:

#### Pause/Resume
- [ ] "Pause" shows for running jobs
- [ ] "Resume" shows for paused jobs
- [ ] Click pause → job pauses
- [ ] Click resume → job resumes
- [ ] Status updates in table
- [ ] Toast notification appears

#### Run Now
- [ ] "Run Now" shows for non-running jobs
- [ ] Click → job starts
- [ ] Status changes to running/queued
- [ ] Toast says "Job started"

#### Force Run
- [ ] "Force Run" always available
- [ ] Click → job force starts
- [ ] Toast says "Job force started"

#### Stop
- [ ] "Stop" shows for running/active jobs
- [ ] Click → job stops
- [ ] Status updates

#### Reconcile
- [ ] "Reconcile" shows when runStatus === "stale"
- [ ] Click → stale run reconciles
- [ ] Toast says "Run reconciled"

#### Edit
- [ ] Click "Edit" → dialog opens
- [ ] URL input pre-filled
- [ ] Max items input pre-filled
- [ ] Type select pre-selected
- [ ] Can edit URL
- [ ] Can edit max items
- [ ] Can change type
- [ ] Click "Save" → updates job
- [ ] Dialog closes
- [ ] Table refreshes with new data
- [ ] Toast notification appears

#### Delete
- [ ] Click "Delete" → dialog opens
- [ ] URL shown in confirmation prompt
- [ ] Must type exact URL to enable delete
- [ ] Checkboxes for deletion options:
  - [ ] Delete from Database (default: checked)
  - [ ] Delete from R2 Storage (default: unchecked)
  - [ ] Delete related Users (default: unchecked)
- [ ] Warning shows if URL doesn't match
- [ ] Delete button disabled until URL matches
- [ ] Click "Delete" → job deleted
- [ ] Toast notification appears
- [ ] Job removed from table

### ✅ **Logs Expansion**
- [ ] Click expand chevron (▼) → logs accordion opens
- [ ] Chevron rotates 180deg
- [ ] Logs section appears below row
- [ ] Row background changes (muted)
- [ ] Controls are visible:
  - [ ] "Auto-follow" toggle
  - [ ] "Refresh" button
  - [ ] "Jump to latest" button
- [ ] Log table header visible
- [ ] Logs stream in real-time (if job running)
- [ ] Time formatted correctly
- [ ] Stage badges color-coded:
  - [ ] STARTING (gray)
  - [ ] FETCH (blue)
  - [ ] SCRAPE (amber)
  - [ ] COMPLETE (green)
  - [ ] WRITE/UPLOAD (cyan)
  - [ ] ERROR (red)
- [ ] Status icons:
  - [ ] ✓ for success (green)
  - [ ] ✗ for error (red)
  - [ ] ⏱ for pending (gray)
- [ ] Auto-follow scrolls to bottom
- [ ] Turning off auto-follow stops scrolling
- [ ] Manual scroll up disables auto-follow
- [ ] Scroll to bottom re-enables auto-follow
- [ ] "Jump to latest" button works
- [ ] "Refresh" button fetches latest logs
- [ ] Click chevron again → logs collapse

### ✅ **Interval Editor**
- [ ] Interval input shows current value
- [ ] Can type new interval
- [ ] On blur → saves to API
- [ ] Toast notification appears
- [ ] "Adaptive" toggle shows current state
- [ ] Toggle adaptive → saves immediately
- [ ] Effective interval shows (if different)
- [ ] Backoff multiplier shows (if > 1)
- [ ] Font size small (10px) for secondary info

### ✅ **Empty States**

#### No jobs at all
- [ ] Inbox icon visible
- [ ] Message: "No jobs yet"
- [ ] Subtitle: "Start by adding a new scraping job..."
- [ ] No action buttons

#### No jobs match filters
- [ ] Inbox icon visible
- [ ] Message: "No jobs match your filters"
- [ ] Subtitle: "Try adjusting your search query..."
- [ ] "Clear search" button (if search active)
- [ ] "Reset filters" button (if filters active)
- [ ] Buttons work and restore jobs

### ✅ **Loading States**
- [ ] Initial load shows 5 skeleton rows
- [ ] Skeletons pulse animation
- [ ] Layout doesn't shift when jobs load
- [ ] Manual refresh shows spinner in button
- [ ] Spinner rotates during refresh
- [ ] Button disables during refresh

### ✅ **Real-Time Updates**
- [ ] Jobs auto-refresh every 2 seconds
- [ ] No jank or flicker during refresh
- [ ] Search filter persists during refresh
- [ ] Status filter persists during refresh
- [ ] Expanded logs stay open during refresh
- [ ] Processing state prevents double-clicks
- [ ] Stats badges update automatically

### ✅ **Error Handling**
- [ ] API failures show toast error
- [ ] Toast is red/destructive variant
- [ ] Error message is helpful
- [ ] Failed action doesn't break UI
- [ ] Can retry after error

### ✅ **Performance**
- [ ] No lag when typing in search
- [ ] Filtering happens instantly (<50ms)
- [ ] Toggling status pills is smooth
- [ ] Expanding/collapsing logs is smooth
- [ ] No memory leaks (check DevTools)
- [ ] Polling doesn't spike CPU

### ✅ **Responsive Design**
- [ ] Works on desktop (1920px+)
- [ ] Works on laptop (1366px)
- [ ] Works on tablet (768px)
- [ ] Stats badges wrap nicely
- [ ] Search bar full-width on mobile
- [ ] Table scrolls horizontally if needed
- [ ] Filter pills wrap on small screens
- [ ] No horizontal overflow

### ✅ **Dark Mode**
- [ ] Switch to dark mode
- [ ] All colors invert correctly
- [ ] Status dots still visible
- [ ] Borders still visible
- [ ] Text contrast good
- [ ] No white flashes
- [ ] Hover states work

### ✅ **Accessibility**
- [ ] Can tab through all interactive elements
- [ ] Focus indicators visible
- [ ] Enter key activates buttons
- [ ] Screen reader announces actions
- [ ] Status badges have semantic meaning
- [ ] Table has proper headers

---

## Common Issues & Solutions

### Issue: "No jobs yet" but I added jobs
**Solution**: Check if jobs were added successfully. Visit `/admin/engine/add` and verify.

### Issue: Search doesn't work
**Solution**: Make sure you're typing in jobs that exist. Try clearing and re-typing.

### Issue: Status filter not working
**Solution**: Check if any status pills are selected. Try "Select All" first.

### Issue: Logs don't stream
**Solution**: 
1. Check if job has a runId
2. Verify `/api/engine/logs/stream` endpoint works
3. Check browser console for errors

### Issue: Actions don't work
**Solution**:
1. Check browser console for errors
2. Verify API endpoints are running
3. Check if user is authenticated

### Issue: Table doesn't scroll
**Solution**: The table should scroll within its container. Check parent div has `overflow: hidden`.

---

## Browser Test Matrix

| Browser | Version | Status |
|---------|---------|--------|
| Chrome  | Latest  | ✅ Should work |
| Firefox | Latest  | ✅ Should work |
| Safari  | Latest  | ✅ Should work |
| Edge    | Latest  | ✅ Should work |

---

## API Endpoints Used

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/engine/jobs` | GET | Fetch all jobs |
| `/api/engine/control` | POST | Job actions (pause/resume/stop/run) |
| `/api/engine/jobs/:id` | PATCH | Edit job settings |
| `/api/engine/jobs/:id` | DELETE | Delete job |
| `/api/engine/runs/:id/reconcile` | POST | Reconcile stale run |
| `/api/engine/logs` | GET | Fetch log snapshot |
| `/api/engine/logs/stream` | GET | Stream logs (SSE) |

---

## Keyboard Shortcuts (Future)

Not implemented yet, but planned:
- `Cmd/Ctrl + K` → Focus search
- `/` → Focus search
- `Esc` → Clear search
- `Cmd/Ctrl + R` → Refresh jobs
- `Space` → Toggle selected job expansion

---

## Performance Benchmarks

Expected performance:
- Initial load: < 500ms
- Search filter: < 50ms
- Status toggle: < 100ms
- Polling interval: 2000ms (2s)
- Logs stream: < 100ms latency

---

## Next Steps After Testing

1. **If everything works**: Ship it! 🚀
2. **If issues found**: Document them, prioritize, fix
3. **Optional enhancements**:
   - Add keyboard shortcuts
   - Add bulk selection
   - Add export to CSV
   - Add advanced filters
   - Add job templates
   - Add performance charts

---

## Support

If you encounter issues:
1. Check browser console for errors
2. Check network tab for failed requests
3. Verify API endpoints are working
4. Check if data is being returned correctly
5. Review component props and state in React DevTools

Happy testing! 🎉
