# Pages (`src/app/`)

App-local detail for the App Router pages. Parent: `apps/web/CLAUDE.md` (see it for the auth-header convention, the API client, and shared components). Routes are exactly: `/`, `/register`, `/login`, `/profile`, `/meetings/new`, `/meetings/[id]`.

All protected pages follow the same client-side guard: check `getAccessToken()` in a mount effect, `router.replace('/login')` when absent (and on a `401`, after `removeAccessToken()`). HeroUI `Form`s use `validationBehavior="aria"`, which does **not** block submission — so the submit-handler checks are load-bearing everywhere below.

## `/register`, `/login`

Public. Server `page.tsx` renders `<Logo>` + tagline; the `'use client'` form (`register-form.tsx` / `login-form.tsx`) does the work and cross-links to the other page. Mirror one when adding an auth screen.

## `/` (home, `home-view.tsx`)

Greeting (`Здравствуйте, ${email}` — email decoded from the JWT via `getUserEmailFromToken`), meeting count, the full meeting list a page at a time (`MEETINGS_PAGE_SIZE` = 10; HeroUI `Pagination` only when `pageCount > 1`) or an empty state, a "Создать встречу" CTA → `/meetings/new`, logout. Order is the API's `startTime asc`. Details:

- The `<ul>` carries `aria-label="Список встреч"` (HeroUI renders its own `<li>`s, otherwise indistinguishable to AT/tests).
- The CTA is **hidden while the empty state shows** (the empty state has its own invitation — one primary per context) but **stays on a load error** so a failed load doesn't strand the user.
- Page links are windowed by `paginationRange` (`pagination-range.ts`, capped at 7 slots) rather than one link per page.
- `loadPage` stamps each request (`requestIdRef`) and ignores responses from superseded ones, so fast paging can't land on a page the user didn't ask for last.
- A failure while paging keeps the list + pagination on screen and reports beside them; only the very first load has nothing to fall back on.
- `HomeView` keeps only state + composition; the presentation is colocated: `MeetingCard` (`meeting-card.tsx`), `MeetingsPagination` (`meetings-pagination.tsx`), `MeetingsEmptyState` (`meetings-empty-state.tsx`), and `CreateMeetingLink`/`CREATE_MEETING_HREF` (`create-meeting-link.tsx`, shared by the CTA and the empty state).

## `/profile` (`profile-view.tsx`)

Wears `PageShell`/`AppHeader`, reads the current user from `useCurrentUser` (not its own fetch — so the header chip and this page share one `GET /users/me`). Redirects to `/login` when the source resolves `unauthenticated`; a load error shows a «Попробовать снова» calling the source's `reload()`. Renders a card: `UserAvatar` + display name (`name`, else email, with a «Имя пока не задано — показан email» hint) + a **read-only** email `TextField` (`isReadOnly` — the email identifies the account, never editable). Three sub-forms, each mapping success back through the shared source's `setUser` so header + card + avatar refresh with no reload:

- **`profile-name-form.tsx`** — `PATCH`es via `updateProfileName()`, length check mirrors the API's 1..100. `401` bubbles via `onUnauthorized`; other failures show verbatim.
- **`avatar-upload.tsx`** — native `<input type="file">` styled as a button (`sr-only` input + `focus-within` ring, to keep keyboard access); `accept` = `.jpg,.jpeg,.png,.webp` + their explicit mimetypes (no `image/*` wildcard). Uploads immediately via `uploadAvatar()`; rejections show **verbatim from the API**, the previous avatar stays.
- **`password-change-form.tsx`** — current/new/confirm. The confirm-match and new-password length are checked **client-side** (`PASSWORD_MIN=8`, hand-synced with the backend `IsPassword`); then `changePassword()` (204). A wrong current password → `400` with `field: 'currentPassword'`, pinned to that input.

## `/meetings/new` (`create-meeting-view.tsx`)

Renders the shared `MeetingForm` (which owns all field validation — see `../components/CLAUDE.md`) with a file picker in its `children` slot, then `router.push` to the created meeting. **Order is forced**: the meeting is created first (files need its id), so a failed upload does **not** go to the form's error slot (which would read as "the meeting was not created", the opposite of true) but to its own notice with an "Открыть встречу" link. Files are uploaded serially after create. `datetime-local` (zone-less) → ISO for the API is handled inside `MeetingForm`. The create+upload orchestration (the serial loop, `upload`/`partialFailure` state, abort-on-unmount, 401 redirect) lives in the **`useCreateMeeting(files)`** hook (`use-create-meeting.ts`), exposing `createMeetingWithFiles`; the view is presentational.

## `/meetings/[id]` (`meeting-view.tsx`)

Server `page.tsx` awaits `params` (Next 15 hands them over as a Promise) and passes the id to the `'use client'` `meeting-view.tsx`, which fetches. **Four states** — `loading`, `ready`, **`missing`**, `error` — and `missing` is **not** an error: the API returns the same `404` for someone else's meeting as for one that never existed, so the page can't tell them apart. Auth is gated in a mount effect like the home view; a `401` clears the dead token before redirecting. On this page (beyond viewing):

- **Edit** — a "Редактировать" button switches to an inline edit mode that renders the same shared `MeetingForm` (`initial={meeting}`, `submitLabel="Сохранить"`); `onSubmit` calls `updateMeeting(id, values)`, sets the returned row, exits edit, shows a "Изменения сохранены" notice, and restores focus to the edit button.
- **Delete** — a `ConfirmDeleteDialog` (trigger "Удалить встречу", confirm "Да, удалить") calls `deleteMeeting(id)` then `router.push('/')`.
- **Files** — the `meeting-files.tsx` block below the details (lives here, not in `src/components/`): rendered once the meeting resolved, it owns its own loading/error state **separately** from the meeting and does **not** redirect on `401`/`404` (the meeting view owns the page-level outcome). Uses `format-file-size.ts` for display; download/upload go through `src/lib/api/meeting-files.ts` (see `../lib/CLAUDE.md`). The list + its actions (load/upload/download/delete, the download `Set`, abort-on-unmount, append-vs-reload) live in the **`useMeetingFiles(meetingId)`** hook (`use-meeting-files.ts`); a single file's row is `FileRow` (`file-row.tsx`); `meeting-files.tsx` is just composition.

The view/edit split: `MeetingView` is the state machine (`loading/missing/error/ready`) + edit toggle and owns `handleUpdate`; the read-only view (title, edit/delete actions, dates, description) is `MeetingDetails` (`meeting-details.tsx`).
