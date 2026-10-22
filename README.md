# AI Workflow Builder Template

A template for building your own AI-driven workflow automation platform. Built on top of Workflow DevKit, this template provides a complete visual workflow builder with real integrations and code generation capabilities.

![AI Workflow Builder Screenshot](screenshot.png)

## Deploy Your Own

You can deploy your own version of the workflow builder to Vercel with one click:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.new/workflow-builder)

**What happens during deployment:**

- **Automatic Database Setup**: A Neon Postgres database is automatically created and connected to your project
- **Environment Configuration**: You'll be prompted to provide required environment variables (Better Auth credentials and AI Gateway API key)
- **Ready to Use**: After deployment, you can start building workflows immediately

## What's Included

- **Visual Workflow Builder** - Drag-and-drop interface powered by React Flow
- **Workflow DevKit Integration** - Built on top of Workflow DevKit for powerful execution capabilities
- **Real Integrations** - Connect to Resend (emails), Linear (tickets), Slack, PostgreSQL, and external APIs
- **Code Generation** - Convert workflows to executable TypeScript with `"use workflow"` directive
- **Execution Tracking** - Monitor workflow runs with detailed logs
- **Authentication** - Secure user authentication with Better Auth
- **AI-Powered** - Generate workflows from natural language descriptions using OpenAI
- **Database** - PostgreSQL with Drizzle ORM for type-safe database access
- **Modern UI** - Beautiful shadcn/ui components with dark mode support

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL database
- pnpm package manager

### Environment Variables

Create a `.env.local` file with the following:

```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/workflow_builder

# Better Auth
BETTER_AUTH_SECRET=your-secret-key
BETTER_AUTH_URL=http://localhost:3000

# AI Gateway (for AI workflow generation)
AI_GATEWAY_API_KEY=your-openai-api-key

# Email (optional). Without these, notifications stay in the app and invite
# links are shown to the admin to share by hand.
RESEND_API_KEY=your-resend-api-key
RESEND_FROM="Procmation <noreply@your-verified-domain.com>"

# Live notifications (optional). Without it, live updates only reach people
# connected to the same app instance, which is fine for a single container.
# Set it when you run several instances, e.g. REDIS_URL=redis://redis:6379
REDIS_URL=redis://localhost:6379

# Deadlines (optional). A Human Task can have a due time. Something has to call
# the deadline endpoint on a schedule (see below); it only answers to this secret.
CRON_SECRET=a-long-random-string
# Hours after the due time before the assignee's manager is told (default 24)
ESCALATION_GRACE_HOURS=24

# File attachments (optional). Any S3-compatible bucket: AWS S3, RustFS, R2...
# Without S3_BUCKET the attach buttons and file form fields stay off.
S3_BUCKET=procmation
S3_REGION=us-east-1
# For a self-hosted store such as RustFS (path-style addressing is then used)
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY_ID=procmation-dev
S3_SECRET_ACCESS_KEY=procmation-dev-secret
# Largest file in MB (default 25)
ATTACHMENT_MAX_MB=25
```

### Deadlines, reminders and escalation

Set "Due after" on a Human Task in the editor. When the task opens it gets a
deadline. Once it passes, the assignee gets one reminder (in the app and by email);
if the task is still open after the grace period, the assignee's manager is told
once and the step shows as escalated on the case page. Nothing repeats. Tasks
assigned to a department pool have no single person, so they are not reminded.

There is no timer inside the app. Call `/api/cron/deadlines` on a schedule, for
example every 15 minutes, with `Authorization: Bearer $CRON_SECRET`:

```bash
# system cron on a VPS
*/15 * * * * curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://your-host/api/cron/deadlines
```

On Vercel, set `CRON_SECRET` in the project and add a cron to `vercel.json`
(`{"crons":[{"path":"/api/cron/deadlines","schedule":"*/15 * * * *"}]}`); Vercel sends
the bearer header for you. Without `CRON_SECRET` the endpoint answers 503. Running it
more often than needed is safe, because each task is reminded and escalated once.

Notifications reach the browser over a server-sent events stream, with no polling.
They need a long-lived connection, so they work on a VPS or in Docker, not on
serverless hosting such as Vercel (there the bell updates when the page loads or
the menu is opened). If you run more than one app instance, add a Redis service
(for example the `redis:7` image) and set `REDIS_URL`; if Redis is down, notifications
are still saved and only the live push is missed.

Links in emails use `BETTER_AUTH_URL` (or `NEXT_PUBLIC_APP_URL`), so set it to the
public address of your deployment. The `RESEND_FROM` address must belong to a domain
verified in Resend.

Self-hosted deployments also keep the workflow engine's run state on disk, in
`.workflow-data` by default (set `WORKFLOW_EMBEDDED_DATA_DIR` to move it). Put that
directory on a persistent volume, or cases waiting on a task are lost when the
container is replaced.

### Reports and dashboard

Admins get a **Reports** page and a "This week" summary on the home page. Pick the
last 7, 30 or 90 days to see cases started, how they ended (approved, rejected,
completed, failed, cancelled), the approval rate, the average time to finish, cases
started per day, figures by process, the slowest steps (where cases wait longest)
and the workload of each person (waiting, overdue, done). "Active now" and "Overdue
tasks" are always the current state, whatever the range. Each table can be saved as
CSV. Days are counted in UTC.

### Audit log

Admins can open **Audit log** to see who changed what and when: cases (started,
status changes, cancelled, finished or failed), tasks (completed, reassigned,
reminded, escalated), processes, workflows (created, deleted), members, departments
and invitations. Everything lives in one append-only `audit_logs` table; a new kind
of record only needs a `resourceType` and action names (see `lib/audit.ts`), not a
new table. Entries are written in the background after the change commits, so the log never slows down or fails an action (a failed write is logged to the server console). The API offers no way to edit or delete entries. Entries store the actor's
and record's name at the time, so they stay readable after renames or deletions.
Workflow edits are not logged, because the editor saves automatically.

### Roles and permissions

Admins define roles in **Roles** (`/admin/roles`). A role is a named set of permissions:

| Permission | Allows |
| --- | --- |
| `reports.view` | Reports and dashboard |
| `audit.view` | Audit log |
| `cases.view_all` | Seeing every case, not only your own |
| `team.view` | Reading the cases and tasks of people who report to you |
| `processes.manage` | Processes, templates and the workflow editor |
| `members.manage` | Members, invitations, departments and profiles |
| `roles.manage` | Creating roles and giving them to people |

`Admin` (everything) and `Member` (starts cases, works on their own tasks) are built in and cannot be changed or deleted, so an admin can never be locked out. A role that someone holds, or an invitation uses, cannot be deleted. Inviting with a role other than Member, or changing someone's role, needs `roles.manage`. Every route checks the permission on the server; the screens only hide what you cannot use.

### Department pools

A task sent to a department waits in its pool, and everyone in that department sees it. Opening the task offers **Take this task**: the claim is atomic, so when two people try at once exactly one gets it and the other is told it is taken. Whoever holds it can **Put back in pool** (admins can do this for them). Claims and releases appear on the case timeline and in the audit log, and once someone holds a task the due-date reminders and escalation apply to them.

### Away and delegation

Anyone can open **Away** in the user menu and pick a person to cover for a date range. While it is active, new tasks meant for them (a named person, or the manager of a requester) go to the delegate instead, are marked as delegated on the case timeline, and are logged. Tasks that already exist keep their assignee, and ending a delegation does not take back what it already moved. It covers one hop only: a delegate who is also away does not pass tasks on again, and department pools are not affected. Delegations cannot overlap for the same person; members with `members.manage` can set one for someone else.

### Comments and mentions

Cases and their tasks have a comment thread. Anyone who can open the case can comment; authors can edit or delete their own comments and admins can delete any. Typing `@` offers only people who can see the case (the requester, task holders, department pool members, admins and roles with `cases.view_all`), and the server drops any other mention. Mentioned people get a bell notification and an email when mail is set up. Comments are audited.

### File attachments

People can attach files to a case, and a start form or task form can have a **File** field. Files live in an S3-compatible bucket: the browser uploads straight to it with a short-lived presigned URL, the server checks the stored size, and downloads are short-lived signed links handed out only to people who can open the case. Downloads always save as a file rather than opening in the browser. Uploads and removals are audited. Files chosen in a form belong to the person who picked them until the form is submitted, and a file can be used by one submission only.

For local development, `docker compose --profile storage up -d` starts [RustFS](https://github.com/rustfs/rustfs). Create the bucket named in `S3_BUCKET` in its console at `http://localhost:9001`, then use the values in the env block above. Because browsers upload directly, the bucket must allow your app's origin for `PUT` (CORS); the compose service sets `RUSTFS_CORS_ALLOWED_ORIGINS` for `http://localhost:3000`, and for a real deployment set it to your app's URL or add the equivalent CORS rule on your bucket. Abandoned uploads (a file picked in a form that was never submitted) stay in the bucket until you remove them; a lifecycle rule on the `attachments/` prefix is the simplest cleanup.

### Search, filters and the team view

My cases and My team have a search box and filters: status, priority, date range and overdue. Search matches the title, case number, requester name and what was typed into forms. The same filters work on `GET /api/bpma/cases` (`q`, `status`, `priority`, `processId`, `from`, `to`, `overdue=true`).

Roles with `team.view` get a **My team** page listing the cases and open tasks of people who report to them, directly or through other managers (set under Members). A manager can open those cases but only to read: no comments, cancelling or attaching, and assignees are not changed. The built-in Member role does not have `team.view`; choose which roles do under Roles.

### Process versions

Publishing a process freezes a **version** (v1, v2, …): the workflow, its start form, name and description as they were. New cases always start from the latest published version and stay on it, so editing the workflow or the start form never changes work already running. Edits are a draft until you publish: the process shows an **Unpublished changes** badge and a **Publish changes** button creates the next version (optionally with a note). Publishing with nothing new reuses the latest version, and unpublishing only stops new cases from starting. Versions are listed at `GET /api/processes/:id/versions` and read in full at `GET /api/processes/:id/versions/:n`, and each publish is audited. Processes published before versions existed were given a v1 from their state at upgrade time.

### Starting point

As an admin, the home page offers a leave request template that creates a ready-to-use
workflow (manager approval) and publishes it. Each requester needs a manager set on the
Members page.

### Installation

```bash
# Install dependencies
pnpm install

# Run database migrations
pnpm db:push

# Start development server
pnpm dev
```

Visit [http://localhost:3000](http://localhost:3000) to get started.

## Workflow Types

### Trigger Nodes

- Webhook
- Schedule
- Manual
- Database Event

### Action Nodes

<!-- PLUGINS:START - Do not remove. Auto-generated by discover-plugins -->
- **AI Gateway**: Generate Text, Generate Image
- **Blob**: Put Blob, List Blobs
- **Clerk**: Get User, Create User, Update User, Delete User
- **fal.ai**: Generate Image, Generate Video, Upscale Image, Remove Background, Image to Image
- **Firecrawl**: Scrape URL, Search Web
- **GitHub**: Create Issue, List Issues, Get Issue, Update Issue
- **Linear**: Create Ticket, Find Issues
- **Perplexity**: Search Web, Ask Question, Research Topic
- **Resend**: Send Email
- **Slack**: Send Slack Message
- **Stripe**: Create Customer, Get Customer, Create Invoice
- **Superagent**: Guard, Redact
- **v0**: Create Chat, Send Message
- **Webflow**: List Sites, Get Site, Publish Site
<!-- PLUGINS:END -->

## Code Generation

Workflows can be converted to executable TypeScript code with the `"use workflow"` directive:

```typescript
export async function welcome(email: string, name: string, plan: string) {
  "use workflow";

  const { subject, body } = await generateEmail({
    name,
    plan,
  });

  const { status } = await sendEmail({
    to: email,
    subject,
    body,
  });

  return { status, subject, body };
}
```

### Generate Code for a Workflow

```bash
# Via API
GET /api/workflows/{id}/generate-code
```

The generated code includes:

- Type-safe TypeScript
- Real integration calls
- Error handling
- Execution logging

## API Endpoints

### Workflow Management

- `GET /api/workflows` - List all workflows
- `POST /api/workflows` - Create a new workflow
- `GET /api/workflows/{id}` - Get workflow by ID
- `PUT /api/workflows/{id}` - Update workflow
- `DELETE /api/workflows/{id}` - Delete workflow

### Workflow Execution

- `POST /api/workflows/{id}/execute` - Execute a workflow
- `GET /api/workflows/{id}/executions` - Get execution history
- `GET /api/workflows/executions/{executionId}/logs` - Get detailed execution logs

### Code Generation

- `GET /api/workflows/{id}/generate-code` - Generate TypeScript code
- `POST /api/workflows/{id}/generate-code` - Generate with custom options

### AI Generation

- `POST /api/ai/generate-workflow` - Generate workflow from prompt

## Database Schema

### Tables

- `user` - User accounts
- `session` - User sessions
- `workflows` - Workflow definitions
- `workflow_executions` - Execution history
- `workflow_execution_logs` - Detailed node execution logs

## Development

### Scripts

```bash
# Development
pnpm dev

# Build
pnpm build

# Type checking
pnpm type-check

# Linting
pnpm check

# Formatting
pnpm fix

# Database
pnpm db:generate  # Generate migrations
pnpm db:push      # Push schema to database
pnpm db:studio    # Open Drizzle Studio
```

## Integrations

### Resend (Email)

Send transactional emails with Resend's API.

```typescript
import { sendEmail } from "@/lib/integrations/resend";

await sendEmail({
  to: "user@example.com",
  subject: "Welcome!",
  body: "Welcome to our platform",
});
```

### Linear (Tickets)

Create and manage Linear issues.

```typescript
import { createTicket } from "@/lib/integrations/linear";

await createTicket({
  title: "Bug Report",
  description: "Something is broken",
  priority: 1,
});
```

### PostgreSQL

Direct database access for queries and updates.

```typescript
import { queryData } from "@/lib/integrations/database";

await queryData("users", { email: "user@example.com" });
```

### External APIs

Make HTTP requests to any API.

```typescript
import { callApi } from "@/lib/integrations/api";

await callApi({
  url: "https://api.example.com/endpoint",
  method: "POST",
  body: { data: "value" },
});
```

### Firecrawl (Web Scraping)

Scrape websites and search the web with Firecrawl.

```typescript
import {
  firecrawlScrapeStep,
  firecrawlSearchStep,
} from "@/lib/steps/firecrawl";

// Scrape a URL
const scrapeResult = await firecrawlScrapeStep({
  url: "https://example.com",
  formats: ["markdown"],
});

// Search the web
const searchResult = await firecrawlSearchStep({
  query: "AI workflow builders",
  limit: 5,
});
```

## Tech Stack

- **Framework**: Next.js 16 with React 19
- **Workflow Engine**: Workflow DevKit
- **UI**: shadcn/ui with Tailwind CSS
- **State Management**: Jotai
- **Database**: PostgreSQL with Drizzle ORM
- **Authentication**: Better Auth
- **Code Editor**: Monaco Editor
- **Workflow Canvas**: React Flow
- **AI**: OpenAI GPT-5
- **Type Checking**: TypeScript
- **Code Quality**: Ultracite (formatter + linter)

## About Workflow DevKit

This template is built on top of Workflow DevKit, a powerful workflow execution engine that enables:

- Native TypeScript workflow definitions with `"use workflow"` directive
- Type-safe workflow execution
- Automatic code generation from visual workflows
- Built-in logging and error handling
- Serverless deployment support

Learn more about Workflow DevKit at [useworkflow.dev](https://useworkflow.dev)

## License

Apache 2.0
