> ⚠️ **SUPERSEDED / HISTORICAL — do not use as current truth.**
> This is the *original* project summary from the discarded Next.js/Supabase
> codebase. It is kept only as a source of roadmap ideas. All current,
> authoritative decisions live in `CLAUDE.md` and `PROJECT_SPEC.md`. Where this
> document disagrees with those (auth, stack, deployment, table naming, API
> layer), those files win. See `PROJECT_SPEC.md` §9 for the audit that retired it.

# AddiApp Project Summary

## Overview

**AddiApp** is a modern web application being built using a current
React ecosystem with an emphasis on maintainability, scalability, and
modern development practices.

## Technology Stack

### Frontend

-   Next.js (App Router)
-   React
-   TypeScript
-   Tailwind CSS

### Backend

-   Next.js Route Handlers / API Routes
-   Supabase (database)

### Database

-   Supabase PostgreSQL

### Authentication

-   Currently evaluating/Auth.js (NextAuth) with a custom login and
    registration UI.
-   Long-term preference is to control the UI rather than using a hosted
    authentication screen.
-   Access can be restricted to specific users using Auth.js callbacks.

### Deployment

-   GitHub for source control
-   Vercel for hosting and continuous deployment

## Project Structure

The project uses the modern `src/` layout:

``` text
src/
├── app/
├── components/
├── lib/
│   └── supabase.ts
├── types/
│   └── addiapp.ts
└── ...
```

Important files:

-   `src/lib/supabase.ts`
-   `src/types/addiapp.ts`
-   `src/app/page.tsx`
-   `src/app/api/...`

## Naming Conventions

The application has been renamed from a generic Todo example.

Changes include:

-   `Todo` → `AddiApp`
-   `todo.ts` → `addiapp.ts`
-   `todos` table → `addiapps`
-   Variables renamed accordingly

## Development Decisions

The following choices were made during project setup:

  Setting                       Choice
  ----------------------------- --------------------
  ESLint                        Yes
  src directory                 Yes
  App Router                    Yes
  Turbopack                     Yes
  Default import alias (@/\*)   Yes (kept default)

## GitHub & Deployment Workflow

Development workflow:

1.  Develop locally.
2.  Commit changes.
3.  Push to GitHub.
4.  Vercel automatically deploys.

Vercel configuration:

-   Framework: Next.js
-   Root directory: project root (leave blank)
-   Build command: `npm run build`
-   Output: auto-detected

## Environment Variables

Local:

-   `.env.local` (never committed)

Typical variables:

-   `NEXT_PUBLIC_SUPABASE_URL`
-   `NEXT_PUBLIC_SUPABASE_ANON_KEY`
-   `NEXTAUTH_SECRET`
-   `NEXTAUTH_URL`
-   `GITHUB_ID`
-   `GITHUB_SECRET`

## Database

Current application data:

### addiapps

Suggested fields:

-   id
-   title
-   completed
-   inserted_at

Possible future table:

### users

Suggested fields:

-   id
-   name
-   email
-   hashed_password
-   created_at

## Authentication Direction

Current preferred direction:

-   Auth.js
-   Custom Tailwind login page
-   Custom Tailwind registration page
-   Credentials Provider
-   User records stored in the database
-   Passwords stored using bcrypt hashes
-   Auth.js manages sessions

Future options:

-   Google login
-   GitHub login
-   Role-based authorization
-   User-specific AddiApp records

## Design Direction

Preferred UI:

-   Tailwind CSS
-   Modern card layouts
-   Responsive design
-   Clean minimal interface

Design tools considered:

-   Figma (preferred)
-   Penpot
-   Framer
-   Builder.io
-   Locofy

## Future Roadmap

Potential additions:

-   User-specific AddiApps
-   Categories
-   Tags
-   Due dates
-   Priorities
-   Recurring tasks
-   Attachments
-   Notifications
-   Dark mode
-   Search
-   Filtering
-   Drag & drop ordering
-   PWA support
-   Offline mode
-   Audit history
-   Sharing/collaboration
-   AI-assisted task management

## Current Status

Completed:

-   Project created
-   Next.js configured
-   TypeScript configured
-   Tailwind configured
-   GitHub connected
-   Vercel deployment working
-   Supabase connected
-   Basic CRUD sample created

In Progress:

-   Authentication
-   Custom login/registration pages
-   User management

## Notes

-   `.env.local` should remain excluded from Git.
-   Environment variables should be configured separately in Vercel.
-   The project follows modern Next.js App Router conventions.