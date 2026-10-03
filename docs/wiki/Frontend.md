# Frontend

The Next.js 16 web app: its routes, how pages are protected and adapt to the user's role, how
components are organized, the proxy to the API, citation chips, error handling and accessibility.
Read this before adding or changing a page.

## Stack

Next.js 16 (App Router) with React 19, Tailwind CSS v4 and shadcn/ui components, TanStack Query for
data fetching, react-hook-form with the zod schemas from `@repo/contracts`, react-dropzone,
react-markdown with remark-gfm, and Better Auth for sign-in. Server Components render layouts and
page shells; interactive parts are client components under `components/`.

## Routes

| Route                    | Who                               | What                                                                                                                      |
| ------------------------ | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `/`                      | everyone                          | Redirects to `/documents`.                                                                                                |
| `/sign-in`               | signed out                        | One button per configured identity provider; readable messages for `?error=` codes (unverified email, disallowed domain). |
| `/onboarding`            | signed in, no active organization | Open one of your organizations, review pending invitations, or create an organization (when allowed).                     |
| `/invite/[id]`           | signed in                         | Accept or decline an invitation sent to your email address.                                                               |
| `/documents`             | members                           | Upload (if allowed), list with status, page and chunk counts, Ask and Delete.                                             |
| `/documents/[id]`        | members                           | Ask questions about one ready document.                                                                                   |
| `/compare`               | members                           | Compare two ready documents on a topic.                                                                                   |
| `/settings/organization` | owners, admins                    | Members and roles, invite links, leave, delete organization (owner).                                                      |
| `/settings/audit`        | owners, admins                    | The organization's audit log with an action filter.                                                                       |
| `/api/auth/*`            | Better Auth                       | Sign-in callbacks, sessions, organizations, JWKS (`/api/auth/jwks`), tokens.                                              |
| `/api/backend/*`         | proxy                             | Forwards allowlisted calls to the API (see below).                                                                        |
| `/api/health`            | public                            | 200 when the API is ready, 503 otherwise.                                                                                 |

Pages under the `(app)` route group share a server layout that loads the session and membership
once per request: without a session it redirects to `/sign-in?returnTo=<path>`, without an active
organization to `/onboarding`. Each page also calls `requireMember('<its path>')` so `returnTo` is
exact. Route handlers check the session themselves; `proxy.ts` is not used for auth. `returnTo` only
accepts same-site paths, so it can't become an open redirect.

## Permission-aware UI

The layout knows the caller's role, and pages use `can(role, permission)` from
[`lib/permissions.ts`]({{repo}}/blob/main/apps/web/lib/permissions.ts), built on `ROLE_PERMISSIONS`
from `@repo/contracts`: viewers don't see the upload area or Delete, members see Delete only for
their own uploads, and Settings appears only for owners and admins. This is a convenience: the API
enforces every permission itself.

## Component structure

```
app/                      routes (server components), loading.tsx and error.tsx per segment
components/ui/            shadcn/ui components (generated; don't edit by hand)
components/layout/        header, organization switcher, user menu, disclaimer footer
components/auth/          sign-in buttons, onboarding forms, invitation actions
components/documents/     dropzone, documents table, status badge, PDF viewer
components/answer/        markdown rendering, citation chips, source sheet
components/analysis/      ask and compare views, pending state, copy button, notices
components/settings/      organization settings, audit log
lib/api/                  typed API client, error mapping, query keys
lib/                      auth (server and client), env, session, permissions, citations
```

## The backend proxy

[`app/api/backend/[...path]/route.ts`]({{repo}}/blob/main/apps/web/app/api/backend/[...path]/route.ts)
and [`lib/backend-proxy.ts`]({{repo}}/blob/main/apps/web/lib/backend-proxy.ts) forward GET, POST
and DELETE to `BACKEND_URL`:

1. **Same-origin only.** A `Sec-Fetch-Site` other than `same-origin` or `none` is rejected with 403
   `ORIGIN_NOT_ALLOWED`; without that header, a non-GET request with an `Origin` other than
   `APP_URL` is rejected too. Other sites can't make a visitor's browser upload files or spend AI
   calls. The proxy never sends CORS headers.
2. **Allowlist.** Only `documents`, `analysis` and `audit-events`, with plain path segments;
   anything else is 404.
3. **Session.** No session: 401 `UNAUTHENTICATED`; no active organization: 403
   `NO_ACTIVE_ORGANIZATION`.
4. **Token.** A 5-minute JWT is minted for the session (`auth.api.getToken`) and sent as
   `Authorization: Bearer`. Only `content-type` and `accept` are forwarded; `cookie`, `host`,
   `origin` and hop-by-hop headers never are.
5. **Streaming.** The body is streamed (multipart uploads included) and the browser's abort signal
   is passed on, so cancelling a question cancels the API call.
6. **Request id.** A valid incoming `x-request-id` is kept, otherwise generated; it's sent upstream
   and returned.
7. The API's status, body and safe headers (`content-type`, `retry-after`, `www-authenticate`…)
   come back unchanged. An unreachable API is 503.

## Data fetching

All calls go through [`lib/api/client.ts`]({{repo}}/blob/main/apps/web/lib/api/client.ts): one typed
function per endpoint, responses validated with the contract schemas. Uploads use
`XMLHttpRequest` for progress events. The documents list polls every 3 seconds while any document
is processing and stops when none are; mutations invalidate the `documents` queries. Switching
organization clears every cached query.

## Answers and citation chips

Answers are rendered by `MarkdownAnswer` with react-markdown and remark-gfm; raw HTML is never
enabled because answers can echo document text. Before rendering, `linkCitations` rewrites
citations such as `[chunk 3, p. 12]` or `[A: chunk 2, p. 7]` into `#cite-…` links, and a custom
link renderer shows them as chips that open a sheet with the excerpt, its pages and similarity.
A short note after a citation, as in `[B: chunk 5, p. 2 (partial)]`, is kept in the chip label.
Unknown refs stay plain text. The exact "not found" sentence is shown as a neutral notice, and
truncated answers carry a warning. See [Prompt design](Prompt-Design#the-citation-contract).

## Viewing the original PDF

When a document has a stored file (`hasFile`), **View** in the documents list (and the filename)
opens its Ask page with `?page=1`, and on wide screens the Ask page opens the PDF by default.
`PdfViewer` sits next to the thread and the page then uses the full width (the layout's `main`
drops its max width when a child is marked `data-wide`). **View document** / **Hide document**
toggles it. The viewer is an iframe of `/api/backend/documents/:id/file#page=N`, rendered by
the browser's own PDF viewer. The source sheet of a citation has **Show p. N in the document**,
which opens the viewer at that page; the iframe is remounted for each request because viewers
don't reliably follow a changed `#page` fragment. The iframe isn't sandboxed: browsers refuse to
run their PDF viewer in a sandboxed frame, and the response is a same-origin, `nosniff`
`application/pdf`. On the Compare page, citation sheets and the excerpt lists link to the cited page
of each PDF in a new tab.

## Errors and reference ids

`ApiError` carries the status, `errorCode`, the request id and a message chosen by error code first
and status second (the table is on [API reference](API-Reference#errors)).

- `UNAUTHENTICATED` redirects to `/sign-in?returnTo=<current page>`; `NO_ACTIVE_ORGANIZATION` to
  `/onboarding`.
- Mutations (upload, delete) show a toast; forms and queries show an inline message.
- Every error shows **"Reference: <request id>"**, which finds the trace in NestJS Observe and the
  audit entry (see [Observability](Observability#finding-a-trace-from-a-reference-id)).
- A network failure says "Can't reach the server."
- `error.tsx` boundaries show the Next.js error digest as the reference.

## Accessibility and UX

- Every control has a label; focus rings are visible; status and progress use live regions.
- When an answer arrives, focus moves to it.
- Long operations (10–60 s) show a skeleton with elapsed seconds and a Cancel button.
- Ctrl/Cmd+Enter submits questions.
- Light and dark themes follow the system and can be toggled from the user menu.
- Layouts work down to 375 px; tables scroll horizontally.
- The footer disclaimer is always visible: AI-generated analysis of retrieved excerpts, not legal
  advice. The app never logs document content, questions or answers.

## Adding a page

1. Create `app/(app)/<route>/page.tsx` as a server component and start with
   `await requireMember('/<route>')`; check `can(member.role, …)` if the page is restricted.
2. Put interactive parts in a client component under `components/<area>/`.
3. Add an API client function in `lib/api/client.ts` and a query key in `lib/api/keys.ts` for any new
   endpoint; if it's a new path prefix, add it to the proxy's allowlist and test it.
4. Add `loading.tsx` and `error.tsx` next to the page.
5. Handle errors with `useApiErrorHandler()` and show `ErrorMessage` inline.
6. Add the route to the table above and link it from the header if users should find it.
