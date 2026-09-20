# AGENT.md — Twitter Bookmark Organizer

This document defines the product requirements, engineering constraints, architecture decisions, development workflow, and collaboration style for this project.

Read this document in full before making architectural or implementation decisions.

If anything in this document conflicts with the existing codebase, do not silently choose one. Explain the conflict, identify the relevant tradeoffs, and propose what should be preserved, migrated, or removed.

---

# 1. Project Overview

This is a personal Twitter/X bookmark archiving and organization application.

The application periodically retrieves the user's X bookmarks, permanently archives the content and media, and provides a searchable interface for organizing the archive into custom categories.

The long-term goal is to make the application feel like a personal library of things worth keeping, rather than simply another Twitter bookmark viewer.

## Core capabilities

* Automatically scrape X bookmarks on a recurring schedule.
* Permanently archive tweet content and media.
* Prevent duplicate bookmarks.
* Organize bookmarks into user-created categories.
* Search and filter archived bookmarks.
* Optionally use AI to suggest categories.
* Preserve archived content even if the original tweet is deleted.
* Support multiple users with strict data isolation.
* Allow each user to connect their own X account/session.
* Provide clear visibility into scraping/sync status.

This is a small private application intended for friends/family rather than a commercial SaaS product.

---

# 2. Existing Implementation

There is a previous unfinished implementation in this repository.

The previous implementation used:

* Firestore
* A plain Node scraping script
* Puppeteer/Playwright
* A simpler/single-user architecture

The new implementation uses:

* MongoDB
* Express + TypeScript
* Nuxt 4 + TypeScript
* BullMQ + Redis
* Cloudinary
* Custom JWT authentication
* Multi-user data isolation

This is a genuine architectural migration, but NOT a reason to discard the existing implementation.

## Before writing new code

First inspect the previous implementation and classify its important parts.

### Reusable as-is

Code that already solves a problem correctly and can be retained with minimal changes.

### Adaptable

Code whose underlying logic is valuable but whose implementation needs to change because of the new architecture.

Examples:

* Firestore data access → MongoDB repositories
* Raw scheduled script → BullMQ worker
* Single-user assumptions → user-scoped architecture

### Obsolete

Code that directly conflicts with the new architecture.

Examples:

* Firebase Auth
* Firestore-specific repositories
* Raw cron scheduling
* Single-user assumptions

### Risky

Code that may work under normal conditions but needs review before reuse.

Examples:

* X selectors
* login/session handling
* media downloading
* bookmark pagination
* incremental scraping
* retry behavior

Do not rewrite working scraping logic merely because a cleaner implementation is possible.

---

# 3. Technology Stack

## Frontend

* Nuxt 4
* TypeScript
* Tailwind CSS
* Nuxt UI where appropriate
* Vue composables
* Responsive design

## Backend

* Node.js
* Express
* TypeScript

## Database

* MongoDB
* Mongoose unless a strong technical reason exists to use another MongoDB ODM/driver

## Background Jobs

* BullMQ
* Redis

## Scraping

Use the same browser automation library already used by the previous implementation:

* Playwright OR
* Puppeteer

Do not switch libraries unless there is a documented technical reason.

Use the existing working scraping logic wherever practical.

A stealth plugin may be retained where technically appropriate.

## Media

* Cloudinary

Do not replace Cloudinary with S3 or local persistent media storage without explicit approval.

## Authentication

* Custom JWT authentication
* Short-lived access token
* Refresh token
* httpOnly secure cookie for refresh token
* Refresh-token revocation/versioning

No third-party authentication provider.

---

# 4. Decision Hierarchy

When requirements conflict, use this priority order:

1. Explicit instructions from the user in the current conversation
2. Decisions explicitly marked as fixed in this document
3. Security and data-integrity requirements
4. Existing working behavior that is intentionally being preserved
5. DESIGN.md for visual/UI decisions
6. Existing repository conventions
7. Claude's engineering judgment

If a conflict cannot be resolved safely, stop and explain it before implementing.

Never silently choose between conflicting requirements.

---

# 5. Fixed Architectural Decisions

The following decisions have already been made.

Do not re-litigate them unless a genuine technical blocker is discovered.

* MongoDB instead of Firestore
* BullMQ + Redis instead of raw cron
* Cloudinary instead of S3/local persistent media storage
* Nuxt 4 + TypeScript frontend
* Express + TypeScript backend
* Custom JWT authentication
* Multi-user architecture from day one
* Invite-based/private accounts rather than public signup
* Permanent archival of tweet content/media
* Archived data remains available even if the original tweet disappears
* Each user's X session is isolated from other users
* Scraping runs approximately every 72 hours
* Scraping is incremental rather than repeatedly processing the entire bookmark history
* Existing scraper jitter should be preserved where appropriate
* AI categorization is separate from the scraping job
* AI categorization is suggestion-first by default

---

# 6. Open Technical Decisions

These should be investigated during the architecture/planning phase rather than assumed.

* Exact MongoDB schema and indexes
* Exact incremental scraping cursor/state
* Playwright vs Puppeteer details if the existing implementation is ambiguous
* Session encryption/storage mechanism
* BullMQ repeatable-job configuration
* Job retry/backoff configuration
* Cloudinary folder/tag structure
* Embedding provider/model
* Embedding storage strategy
* AI categorization threshold
* How AI-generated category suggestions are represented
* Search implementation and indexing strategy
* Media processing/failure recovery
* Scraper health monitoring/notification strategy

Do not introduce unnecessary infrastructure merely because it is technically possible.

---

# 7. Multi-User Architecture

This application is multi-user from day one.

Every user-owned resource must be scoped by `userId`.

At minimum:

* Tweets
* Categories
* Scraping state
* X sessions
* Jobs
* AI categorization state
* Media namespace

A user must never be able to query, modify, or delete another user's data through the application API.

Do not rely only on frontend filtering for isolation.

The backend must enforce ownership.

Where appropriate, database queries should include `userId` as part of their filtering criteria.

---

# 8. X Session Security

Each user connects their own X account.

Authenticated browser session information such as cookies/storage state is sensitive credential-adjacent data.

Treat it as a secret.

Requirements:

* Encrypt session data at rest.
* Never expose session data to the frontend.
* Never include session data in normal logs.
* Never commit session data to git.
* Never place session data in normal application responses.
* Tie the session to the owning user.
* Detect invalid/expired sessions.
* Only trigger login when the existing session is no longer valid.

Do not log in on every scrape.

Persistent authenticated sessions are intentional.

---

# 9. Scraping Architecture

Scraping must run through BullMQ workers.

It should NOT be implemented as a bare cron script.

Each user's scraping lifecycle should be isolated.

Conceptually:

```text
User
  ↓
Scheduled BullMQ job
  ↓
User-specific scraping worker
  ↓
Persistent X session
  ↓
Incremental bookmark extraction
  ↓
Deduplication
  ↓
Media archival
  ↓
MongoDB persistence
```

## Scheduling

Target cadence:

Approximately every 72 hours.

The implementation should support:

* retries
* appropriate backoff
* failure visibility
* manual triggering where useful
* per-user job identification

Avoid silent failures.

---

# 10. Incremental Scraping

The scraper must not reprocess the entire bookmark history every 72 hours.

Track enough state to safely determine where the previous successful scrape stopped.

Potential state includes:

* last successful scrape timestamp
* last known bookmark ID
* bookmark creation timestamp/cursor
* session status
* consecutive failure count

The exact state model should be determined during architecture planning.

## Important

Deduplication must still be enforced at the database level.

Do not assume that a scraper cursor alone guarantees correctness.

A suitable uniqueness strategy should ensure that the same user's tweet cannot be archived twice.

Conceptually:

`userId + tweetId`

should be treated as the bookmark identity.

The system should prioritize avoiding missed bookmarks over avoiding harmless duplicate processing.

---

# 11. Scraper Reliability

The scraper must fail loudly when something goes wrong.

Examples:

* X DOM changes
* selectors stop matching
* authentication expires
* bookmark loading fails
* media download fails
* Cloudinary upload fails
* unexpected page state occurs

Never interpret:

> "0 bookmarks found"

as a successful scrape without verifying that the scraper actually reached a valid bookmark state.

Logs should clearly distinguish:

* successful scrape with zero new bookmarks
* successful scrape with new bookmarks
* authentication failure
* selector failure
* network failure
* media failure
* database failure

---

# 12. Scraper Jitter

The existing implementation already contains randomized delays/jitter between scraping actions.

Preserve that logic where possible.

Do not remove jitter simply because it makes the code less aesthetically simple.

Do not redesign the scraping behavior unnecessarily.

---

# 13. Tweet Data Model

Initial model:

```text
Tweet
├── tweetId
├── userId
├── author
│   ├── name
│   ├── handle
│   └── avatar
├── text
├── media
│   ├── images
│   └── videos
├── links
├── originalUrl
├── tweetCreatedAt
├── archivedAt
├── categoryId
├── categorizationSource
└── ...
```

Requirements:

* `tweetId` comes from X.
* Author avatar should be archived rather than relying only on X's URL.
* Tweet media must be uploaded to Cloudinary.
* Original X URLs may be retained as metadata but are not the source of truth for archived media.
* Archived content remains available after deletion from X.
* `categoryId` may be null.
* `categorizationSource` must distinguish:

  * manual
  * ai
  * uncategorized

The exact schema should be refined during architecture planning.

---

# 14. Cloudinary

Cloudinary is the permanent media store.

Do not rely on X CDN URLs as the application's permanent media source.

Media should be namespaced per user using an appropriate folder/tag strategy.

For example:

```text
twitter-organizer/{userId}/tweets/{tweetId}/...
```

The exact structure should be decided during implementation.

Do not expose unnecessary Cloudinary credentials to the client.

---

# 15. Categories

Categories belong to users.

A category should contain at minimum:

```text
name
userId
createdBy
```

Where `createdBy` distinguishes:

* manual
* ai

Categories should not be globally shared.

Potential future capability:

* category embeddings for similarity-based categorization

Do not implement embeddings merely because they are mentioned here. Determine whether they provide sufficient value during the AI architecture phase.

---

# 16. AI Categorization

AI categorization is a separate background workflow.

Do not couple AI categorization directly to scraping.

Suggested flow:

```text
New uncategorized tweet
        ↓
Compare against existing categories
        ↓
Similarity sufficiently strong?
    ↙               ↘
  Yes                No
  ↓                   ↓
Suggest category     LLM evaluation
                      ↓
             Existing category?
                 ↙        ↘
               Yes         No
                ↓           ↓
            Suggest       Suggest new category
```

The default behavior is:

**AI suggests, human confirms.**

AI should not silently move bookmarks between categories.

A future setting may allow:

`Trust AI / Auto-apply`

but this must not be the default.

---

# 17. Human Categorization Protection

If a user is actively changing a bookmark's category, the AI worker must not overwrite their work.

Use a lightweight lock or recent-human-edit timestamp.

The AI worker should skip/lock bookmarks that were manually touched recently.

The exact duration should be determined during implementation.

---

# 18. Video Understanding

Do not assume the AI model can meaningfully understand arbitrary video.

For categorization, use:

* tweet text
* author/context
* link information
* alt text
* optionally a thumbnail/frame

Full video understanding is out of scope unless explicitly requested later.

---

# 19. Authentication

Authentication must use:

* short-lived access tokens
* refresh tokens
* httpOnly secure refresh cookie
* token revocation/versioning

Do not store long-lived authentication tokens in localStorage.

The application renders untrusted scraped content, so authentication and XSS resistance must be treated as important security concerns.

---

# 20. Security

Treat all scraped tweet content as untrusted input.

Never render tweet HTML directly unless it has been explicitly sanitized.

Be especially careful with:

* tweet text
* links
* author names
* handles
* media metadata
* alt text
* external URLs

Avoid introducing XSS vulnerabilities through archived content.

Other areas requiring attention:

* authentication
* authorization
* refresh token handling
* session encryption
* Cloudinary credentials
* Redis access
* MongoDB access
* environment variables
* request validation
* rate limiting where appropriate

---

# 21. Frontend

Frontend technology:

* Nuxt 4
* TypeScript
* Tailwind CSS
* Nuxt UI where appropriate

The frontend should prioritize:

* fast browsing
* search
* filtering
* category navigation
* readable tweet content
* media viewing
* clear AI suggestions
* responsive behavior

Do not implement final visual styling until `DESIGN.md` is available.

Structural frontend work may proceed before the final visual system exists.

---

# 22. Design System

`docs/DESIGN.md` is authoritative for frontend visual decisions.

Read it before making significant UI decisions.

Do not invent a new visual language for individual pages.

All pages should feel like parts of the same product.

If a design decision is not covered by `DESIGN.md`, use the existing visual language rather than introducing a new one.

---

# 23. Development Workflow

Development should happen in coherent milestones rather than one giant implementation.

## Phase 1 — Understand

Inspect the relevant code and requirements.

Do not make assumptions about the existing implementation before reading it.

## Phase 2 — Plan

For non-trivial work, explain:

* what will change
* what will be reused
* what will be created
* what could break
* how it will be verified
* important alternatives
* important tradeoffs

For major architectural work, do not modify the code yet.

## Phase 3 — Approval

For significant architectural changes, wait for user approval.

Small implementation decisions that fall clearly within an approved architecture do not require approval one by one.

## Phase 4 — Implement

Make the smallest coherent set of changes necessary for the approved milestone.

## Phase 5 — Verify

Run relevant:

* tests
* type checks
* lint
* build
* integration checks
* manual verification where appropriate

## Phase 6 — Explain and Report

After implementation, provide a concise but useful summary:

```text
What changed:
...

Important decisions:
...

Why:
...

Verification:
...

Remaining issues:
...
```

---

# 24. Learning-Oriented Collaboration

The user is using this project not only to build a useful application, but also to learn from the implementation.

Claude should therefore explain meaningful engineering decisions.

The goal is:

**Build the application while helping the user understand how and why it works.**

Do not reduce explanations to generic textbook definitions.

Explain concepts in the context of this project.

For example, instead of:

> "BullMQ is a Redis-based queueing library."

Prefer:

> "We're using BullMQ because the scraper should not run inside an Express request. Scraping can take several minutes and may fail independently of the API request. The API can enqueue the work, while a separate worker processes it and BullMQ gives us retries and job visibility."

---

# 25. What Should Be Explained

Explain important decisions, especially when:

* choosing between architectural approaches
* introducing a new dependency
* changing an existing implementation
* deciding not to reuse existing code
* changing a database schema
* designing authentication/security
* designing the scraping architecture
* designing background jobs
* making a performance tradeoff
* making a reliability tradeoff
* introducing an abstraction/design pattern
* making an unfamiliar engineering decision
* encountering an important technical limitation
* making a decision that may not be obvious from the resulting code

For significant decisions, briefly explain:

1. What was chosen
2. Why it was chosen
3. What alternatives were considered
4. Why the chosen approach fits this project
5. Important tradeoffs

Example:

> **Decision: Use a compound unique index on `userId + tweetId`.**
>
> This prevents the same user from accidentally storing the same tweet twice while still allowing different users to archive the same tweet independently.
>
> An application-level duplicate check alone isn't sufficient because two jobs could pass the check simultaneously. The database constraint provides the final guarantee.
>
> **Tradeoff:** Tweet IDs are only unique within a user's archive, which is intentional for the multi-user architecture.

---

# 26. What Does NOT Need Explanation

Do not narrate routine actions such as:

* opening files
* searching for a function
* reading an obvious configuration
* installing an already-approved dependency
* formatting code
* renaming a variable
* making mechanical edits
* running ordinary tests
* fixing an obvious TypeScript error
* describing every tool call

Do not provide a running commentary such as:

> "I'm opening this file now."

> "Now I'm going to search for this function."

> "I found the function."

Instead, explain the reasoning when the action represents an important engineering decision.

---

# 27. Explanation Depth

Keep explanations proportional to the complexity of the decision.

### Small decision

One or two sentences may be enough.

### Important implementation decision

Use a short explanation containing:

* decision
* reasoning
* tradeoff

### Major architectural decision

Explain:

* the problem
* the proposed approach
* alternatives
* tradeoffs
* project-specific reasoning
* consequences

The user may explicitly ask for deeper explanation at any time.

If the user says:

> "Explain this at a junior backend engineer level."

adapt the explanation accordingly.

If the user says:

> "I understand this already, keep it brief."

do not over-explain.

---

# 28. User Questions During Implementation

If the user asks:

> "Why did you do this?"

Explain the actual implementation that was chosen.

Include relevant:

* reasoning
* alternatives
* tradeoffs
* project-specific considerations

If the original decision was questionable, say so honestly.

Do not change the implementation merely because the user asked for an explanation.

If the user asks to change the decision, treat that as a new implementation request.

---

# 29. Scope Control

Work only on the requested milestone.

Do not:

* refactor unrelated code
* redesign unrelated components
* introduce libraries without justification
* rewrite working systems unnecessarily
* add speculative features
* change fixed architecture decisions
* clean up unrelated files simply because they are imperfect

If a larger problem is discovered:

1. Document it.
2. Explain its impact.
3. Determine whether it blocks the current task.
4. Fix it only if necessary for the current task.
5. Otherwise defer it.

---

# 30. Token and Context Efficiency

The user has a limited budget for this project.

Optimize for high-quality work per token.

However, token efficiency must NOT come at the expense of understanding important engineering decisions.

Prefer:

* planning before implementation
* reading existing code before rewriting it
* batching related changes
* coherent milestones
* targeted verification
* reusing working code
* concise explanations of important decisions
* explaining reasoning rather than narrating actions

Avoid:

* repeated explanations of the same context
* long generic tutorials unrelated to the current implementation
* narrating every tool call
* unnecessary file rewrites
* repeated tiny changes that could be done together
* speculative refactors
* unnecessary dependency additions
* re-reading large unrelated sections of the repository

The desired balance is:

**high-quality engineering + understandable reasoning + efficient token usage.**

---

# 31. Definition of Done

A feature is complete only when:

1. The requested behavior is implemented.
2. Relevant tests exist or have been updated.
3. TypeScript/build/lint checks pass where applicable.
4. The feature has a clear verification procedure.
5. No known errors are silently ignored.
6. Any remaining limitations are explicitly reported.
7. Important architectural decisions made during the implementation have been explained to the user.

"Code has been written" does not mean "feature is complete."

---

# 32. Verification Philosophy

Never declare success merely because code was generated.

Verification should be appropriate to the feature.

Examples:

### Database change

Verify:

* schema
* indexes
* queries
* isolation
* duplicate behavior

### Authentication

Verify:

* login
* access token
* refresh
* logout/revocation
* expired token
* unauthorized access

### Scraper

Verify:

* valid session
* bookmark extraction
* pagination
* incremental stopping
* duplicate handling
* failure handling

### Queue

Verify:

* job creation
* worker execution
* retries
* failure state
* user isolation
* duplicate job prevention where appropriate

### Frontend

Verify:

* functionality
* responsive behavior
* loading states
* error states
* accessibility
* visual consistency

---

# 33. First Task When Starting This Project

When first asked to begin development, do NOT immediately modify the codebase.

First perform an audit.

The first task should be:

> Read this document and inspect the existing repository. Do not modify files. Audit the previous implementation and produce a migration assessment.

The assessment should identify:

1. Existing architecture
2. Reusable scraper code
3. Existing authentication/session logic
4. Existing bookmark extraction logic
5. Existing media handling
6. Existing data model
7. Existing Firestore dependencies
8. Existing scheduling logic
9. Single-user assumptions
10. Security concerns
11. Broken/incomplete areas
12. Proposed migration strategy
13. Areas that should be deleted
14. Areas that should be preserved
15. Architectural questions requiring approval
16. Potential risks in the migration

The audit should explain **why** each major recommendation is being made.

Do not implement anything during this first audit.

Only after reviewing the assessment should implementation begin.

---

# 34. Recommended Implementation Milestones

Unless the user specifies a different order, prefer approximately this sequence:

## Milestone 0 — Existing Code Audit

Understand and classify the previous implementation.

## Milestone 1 — Target Architecture

Define:

* project structure
* MongoDB models
* authentication architecture
* job architecture
* scraper lifecycle
* media lifecycle
* user isolation

## Milestone 2 — Backend Foundation

Set up:

* Express
* TypeScript
* configuration
* MongoDB
* Redis/BullMQ
* environment validation
* shared backend infrastructure

## Milestone 3 — Authentication

Implement:

* users
* invite-based registration
* login
* access tokens
* refresh tokens
* revocation
* authorization middleware

## Milestone 4 — Bookmark Data Layer

Implement:

* tweet schema
* categories
* indexes
* repositories/services
* user isolation
* deduplication

## Milestone 5 — Scraper Migration

Reuse and adapt:

* browser automation
* session handling
* selectors
* bookmark extraction
* jitter
* incremental scraping

## Milestone 6 — Background Jobs

Implement:

* scraping jobs
* scheduling
* retries
* backoff
* failure states
* per-user job isolation

## Milestone 7 — Media Archival

Implement:

* Cloudinary integration
* user namespacing
* image handling
* video handling
* avatar archival
* failure/retry behavior

## Milestone 8 — AI Categorization

Implement:

* uncategorized queue
* similarity logic
* AI suggestions
* category suggestions
* human confirmation
* manual-edit protection

## Milestone 9 — Frontend Foundation

Implement:

* application shell
* navigation
* routing
* authentication flow
* shared components

Follow `DESIGN.md`.

## Milestone 10 — Library

Implement:

* bookmark browsing
* cards
* media
* categories
* filters
* search
* bookmark actions

## Milestone 11 — Sync and AI UX

Implement:

* sync status
* connection status
* AI suggestions
* confirmation flows
* errors/recovery

## Milestone 12 — Hardening

Review:

* security
* authorization
* error handling
* scraper reliability
* job reliability
* performance
* responsive behavior
* accessibility

Do not treat these milestones as rigid if the existing codebase makes another sequence more appropriate. Explain the reason for changing the order.

---

# 35. Final Principle

The application should be built with the mindset:

> **Reuse what already works. Understand what does not. Change architecture deliberately. Verify everything important. Explain the reasoning behind meaningful decisions.**

Claude is responsible for doing substantial engineering work.

The user remains involved in understanding and approving meaningful architectural decisions.

Do not make the user micromanage implementation details.

Do not make the user guess why important decisions were made.
