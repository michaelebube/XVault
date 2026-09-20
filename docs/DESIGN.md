# DESIGN.md — Twitter Bookmark Organizer

This document defines the visual language and interaction principles for the Twitter/X Bookmark Organizer.

The product should feel like a carefully designed personal archive rather than a generic SaaS dashboard.

The interface should be modern, sleek, calm, highly usable, content-focused, and subtly expressive.

---

# 1. Design Direction

## Core idea

The product is a personal library for things worth keeping.

It should feel closer to:

* a beautiful digital library
* a modern reading/archive application
* a polished productivity tool
* a personal knowledge collection

than to:

* an enterprise admin dashboard
* an AI chatbot
* a social media clone
* a generic SaaS template

## Desired qualities

The visual system should feel:

* modern
* sleek
* intelligent
* calm
* editorial
* organized
* slightly playful
* premium without feeling luxurious
* technical without feeling developer-only
* human rather than AI-generated

The interface should communicate:

> "Everything I saved is finally organized."

---

# 2. Reference Direction

Use these references as sources of design principles, not templates to copy.

## Linear

Reference for:

* information hierarchy
* density
* restrained color
* navigation
* keyboard-friendly interactions
* subtle borders
* polished states
* purposeful animation

https://linear.app/

## Raycast

Reference for:

* utility-focused UI
* compact navigation
* search/command interactions
* dark mode
* subtle depth
* delightful micro-interactions
* personalization

https://www.raycast.com/

Raycast describes its design principles as fast, simple, and delightful. That philosophy is useful for this product. Do not copy Raycast's branding or exact visual language.

## Vercel / Geist

Reference for:

* typography
* spacing
* precision
* minimalism
* crisp interface details

https://vercel.com/font

Geist is designed around simplicity, minimalism, speed, precision, clarity, and functionality. Those principles are useful here even if another typeface is eventually chosen.

## Mobbin

Use for researching actual product patterns:

https://mobbin.com/

When looking for inspiration, prioritize:

* search
* filtering
* sidebars
* content libraries
* card layouts
* empty states
* onboarding
* settings
* responsive behavior

Do not use Mobbin screenshots as direct templates.

## unDraw

Use for:

* onboarding illustrations
* empty states
* connection/setup screens
* scraper status
* archive/success states

https://undraw.co/

Illustrations should be customized to the application's palette rather than inserted with their default colors.

---

# 3. Design Principle

## Content first

The tweet is the primary visual object.

Do not let the application chrome overpower the archived content.

A user opening the application should immediately see:

* what they saved
* who posted it
* when it was saved
* what category it belongs to
* available actions

The UI should support browsing rather than compete with it.

---

# 4. Visual Personality

The interface should have:

* generous but not excessive whitespace
* crisp borders
* subtle shadows
* restrained corner radii
* strong typography hierarchy
* small purposeful accents
* occasional illustrations
* subtle motion

Avoid:

* huge empty hero sections inside the application
* excessive gradients
* neon colors
* glowing borders
* excessive glassmorphism
* floating blobs
* random decorative shapes
* oversized cards
* excessive pill UI
* excessive use of purple/blue as an "AI" signal

The application should look designed by a product designer, not generated from a SaaS UI prompt.

---

# 5. Color System

The primary palette should be neutral with a warm, distinctive accent.

Do not use X/Twitter blue as the dominant brand color.

The product should have its own identity.

## Light mode

Suggested foundation:

```text
Background:
#FAFAF8

Surface:
#FFFFFF

Surface subtle:
#F5F5F2

Surface elevated:
#FFFFFF

Border:
#E7E5E1

Border strong:
#D6D3CE

Text primary:
#18181B

Text secondary:
#52525B

Text muted:
#71717A

Accent:
#6D5DFB

Accent hover:
#5B4AE8

Accent subtle:
#EEEBFF
```

The exact accent may be refined during implementation.

The goal is a slightly distinctive indigo/violet accent without becoming another "AI purple" interface.

## Dark mode

```text
Background:
#101011

Surface:
#171719

Surface elevated:
#1D1D20

Surface subtle:
#141416

Border:
#2A2A2E

Border strong:
#3A3A40

Text primary:
#F4F4F5

Text secondary:
#A1A1AA

Text muted:
#71717A

Accent:
#8B7CFF

Accent hover:
#A397FF

Accent subtle:
#26213F
```

Dark mode should feel like a real interface, not simply the light theme inverted.

---

# 6. Semantic Colors

Use semantic colors sparingly.

```text
Success:
#2F9E72

Warning:
#D89A3D

Error:
#D85C5C

Info:
#4F8CC9
```

Do not communicate important information through color alone.

Use:

* text
* icons
* labels
* status indicators

alongside color.

---

# 7. Color Usage Rules

The accent color should primarily indicate:

* primary actions
* active navigation
* selected categories
* focused controls
* AI suggestions
* important interactive states

Do not make every interactive element accent-colored.

Most of the interface should remain neutral.

This creates visual hierarchy.

---

# 8. Typography

Primary typeface:

Prefer a modern neutral sans-serif.

First choice:

**Geist Sans**

Alternative:

**Inter**

Use Geist Mono or another monospace font only for:

* technical metadata
* IDs
* keyboard shortcuts
* code-like information

Do not use monospace for normal tweet content.

## Type hierarchy

```text
Display:
32–40px
Weight: 600

Page heading:
24–30px
Weight: 600

Section heading:
18–20px
Weight: 600

Body:
14–16px
Weight: 400

Small:
12–13px
Weight: 400–500

Metadata:
12–13px
Weight: 400

Label:
11–12px
Weight: 500–600
```

Tweet text should receive more visual priority than metadata.

---

# 9. Spacing

Use a consistent spacing system.

Base unit:

`4px`

Preferred spacing:

```text
4
8
12
16
20
24
32
40
48
64
80
```

Avoid arbitrary values unless necessary.

---

# 10. Border Radius

Use restrained rounding.

Suggested:

```text
Small controls:
6px

Buttons:
8px

Inputs:
8px

Cards:
12px

Large containers:
16px

Illustration/hero surfaces:
20px
```

Avoid making every component extremely rounded.

Pills should be reserved for:

* tags
* statuses
* category labels
* compact filters

---

# 11. Borders and Shadows

Prefer borders over heavy shadows.

Default card:

```text
1px solid border
subtle background difference
minimal shadow
```

Elevated elements may use a layered shadow.

Do not use large blurry shadows around every card.

The interface should feel crisp.

---

# 12. Layout

## Desktop

Use a persistent left navigation/sidebar.

Conceptually:

```text
┌───────────────┬─────────────────────────────────────────┐
│               │                                         │
│   Logo        │  Page header                            │
│               │                                         │
│   Library     │  Search / filters                       │
│   Categories  │                                         │
│               │                                         │
│   ───────     │  Bookmark content                       │
│               │                                         │
│   Settings    │                                         │
│               │                                         │
│   User        │                                         │
└───────────────┴─────────────────────────────────────────┘
```

The sidebar should be compact and functional.

Do not allow navigation chrome to dominate the screen.

## Mobile

Replace the desktop sidebar with an appropriate mobile navigation pattern.

Prioritize:

* search
* category/filter access
* bookmark browsing
* bookmark actions

Do not simply squeeze the desktop layout onto a phone.

---

# 13. Application Shell

The main shell should contain:

* persistent navigation
* page title/context
* search
* filters
* content area
* optional contextual actions

The shell should remain visually stable while page content changes.

---

# 14. Bookmark Presentation

Bookmarks are the primary content.

A bookmark card should contain:

```text
Author avatar
Author name
@handle
Relative/absolute date
Tweet text
Media
Links
Category
Categorization source
Actions
```

Visual hierarchy:

1. Tweet text
2. Media
3. Author
4. Category
5. Metadata
6. Secondary actions

Do not give every metadata field equal visual weight.

---

# 15. Tweet Cards

Cards should feel like pieces of an archive rather than generic dashboard cards.

Preferred characteristics:

* white/subtle surface
* crisp border
* restrained radius
* comfortable text spacing
* subtle hover state
* media with consistent radius
* clear category label
* unobtrusive action controls

On hover:

* slightly increase border contrast
* reveal secondary actions where appropriate
* do not dramatically scale or lift the card

---

# 16. Media

Images and videos should be treated as first-class archived content.

Use:

* consistent aspect-ratio handling
* rounded media containers
* sensible object-fit
* clear video controls
* lightbox/modal for larger media where useful

Do not allow oversized media to make browsing cumbersome.

---

# 17. Categories

Categories should be visually lightweight.

Avoid turning the entire sidebar into a rainbow of colored pills.

Use a restrained category system.

Possible treatment:

```text
● Development
● AI
● Design
● Business
```

Colors can help distinguish categories, but each category should remain readable in both light and dark modes.

Allow users to create custom categories without requiring a complex customization UI.

---

# 18. Search

Search is a primary interaction.

It should feel fast and prominent without becoming visually dominant.

Consider:

* keyboard shortcut
* command/search overlay
* instant filtering
* recent searches
* category filters

Search should eventually support:

* tweet text
* author
* handle
* category
* links

Do not over-design the search UI.

---

# 19. Filtering

Filtering should be simple.

Possible filters:

* category
* author
* date
* categorization source
* has media
* has links
* AI suggestions

Use popovers/sheets/command interfaces rather than permanently consuming large amounts of screen space.

---

# 20. AI Suggestions

AI should feel like an assistant, not the product's identity.

Avoid:

```text
✨ AI MAGIC
```

style UI.

Instead use subtle language:

```text
Suggested: Machine Learning
```

or:

```text
AI suggestion
Machine Learning
[Accept] [Change]
```

AI suggestions should use the accent color subtly.

The user should always understand:

* why something is suggested
* that it is a suggestion
* what action will happen if accepted

---

# 21. Empty States

Empty states are important.

Do not leave users with a blank screen.

Examples:

### No bookmarks

Use a small, tasteful illustration and:

```text
Your library is empty

Once your X bookmarks are synced, they'll appear here.

Connect X
```

### No search results

```text
Nothing matched your search.

Try a different keyword or clear your filters.
```

### Empty category

```text
Nothing here yet.

Bookmarks you assign to this category will appear here.
```

Illustrations should be subtle and secondary to the message.

Use unDraw or custom SVG illustrations where appropriate.

---

# 22. Onboarding

The onboarding experience should explain the product in a few steps.

Suggested flow:

```text
Welcome
   ↓
Connect X
   ↓
First sync
   ↓
Choose/create categories
   ↓
Library
```

The visual language should be warm and reassuring.

Do not use a giant SaaS landing page inside the application.

Illustrations are encouraged here.

---

# 23. Scraping Status

Users should be able to understand whether their archive is healthy.

Possible status:

```text
Last synced
2 hours ago

Next sync
in 1 day

Status
Healthy
```

When something goes wrong:

```text
Sync needs attention

Your X session needs to be reconnected.

Reconnect X
```

Never display frightening technical errors to normal users unless necessary.

Technical details can be available in an advanced/debug area.

---

# 24. Loading States

Use skeletons that match the shape of the final content.

Avoid generic full-page spinners whenever possible.

Bookmark skeletons should resemble actual bookmark cards.

The user should understand what is loading.

---

# 25. Error States

Errors should be actionable.

Bad:

```text
Error 401
```

Better:

```text
Your X session has expired.

Reconnect your X account to continue syncing.

Reconnect X
```

For technical failures:

```text
Sync couldn't complete.

The previous bookmarks are safe. We'll retry automatically.

View details
```

Never imply archived data has been lost unless that is actually true.

---

# 26. Animation

Motion should be subtle and purposeful.

Use animation for:

* navigation transitions
* modal appearance
* filtering
* category assignment
* AI suggestion appearance
* media opening
* successful actions
* small hover/focus transitions

Avoid:

* constant floating animations
* excessive parallax
* animated gradients
* spinning decorative objects
* excessive bounce effects

Motion should communicate state and improve perceived responsiveness.

---

# 27. Animation Timing

Suggested:

```text
Micro interaction:
100–150ms

Small transition:
150–220ms

Modal/popover:
180–250ms

Larger transition:
250–350ms
```

Prefer ease-out for entering UI.

Respect `prefers-reduced-motion`.

---

# 28. Icons

Use one consistent icon family.

Prefer Lucide-style icons or the icon system provided by Nuxt UI.

Do not mix several unrelated icon styles.

Icons should:

* communicate clearly
* remain secondary to labels where possible
* have accessible labels when necessary
* never be decorative clutter

---

# 29. Illustrations

Illustrations are encouraged, but should be used selectively.

Best locations:

* onboarding
* empty library
* empty category
* connection success
* sync success
* error/recovery states
* landing/marketing page if one is eventually created

Do not place illustrations inside every card.

Illustrations should reinforce the concept of:

* collecting
* organizing
* discovering
* archiving
* finding something again

They should share the application's accent palette.

Avoid generic robot/AI illustrations.

---

# 30. Dark Mode

Dark mode should be fully designed, not an automatic color inversion.

The dark interface should use:

* near-black neutral background
* slightly lighter surfaces
* subtle borders
* readable secondary text
* restrained accent colors

Media and illustrations should remain visually coherent in dark mode.

---

# 31. Accessibility

Follow accessible interaction patterns.

Requirements include:

* keyboard navigation
* visible focus states
* accessible labels
* semantic HTML
* sufficient contrast
* minimum usable touch targets
* reduced motion support
* screen-reader-friendly interactive elements

Do not rely solely on color to communicate state.

Interactive elements should have clear hover, active, and focus states.

---

# 32. Responsive Design

Design deliberately for:

* desktop
* tablet
* mobile

Do not treat mobile as an afterthought.

The most important mobile experiences are:

1. browsing bookmarks
2. reading tweet content
3. searching
4. filtering
5. assigning categories
6. opening media

---

# 33. Component Consistency

Components should use shared design tokens.

Do not create one-off:

* colors
* radii
* shadows
* spacing values
* button styles
* typography styles

unless there is a clear design reason.

The application should feel coherent even as it grows.

---

# 34. Design Tokens

Where practical, implement the visual system through semantic CSS variables/design tokens.

Example:

```text
--background
--foreground
--surface
--surface-muted
--border
--border-strong
--accent
--accent-hover
--text-secondary
--text-muted
--success
--warning
--error
```

Components should consume semantic tokens rather than hard-coded colors wherever practical.

---

# 35. Component Foundation

Because the application uses Nuxt 4/Vue, prefer Nuxt UI components where they provide the required behavior.

Customize them to fit this design system rather than accepting every default appearance.

Use lower-level custom components when a product-specific interaction requires them.

Do not introduce a second major component framework without approval.

---

# 36. Anti-AI-Generated Design Rules

The following are explicit design constraints.

Do not use:

* purple gradient backgrounds everywhere
* blue/purple glowing blobs
* "AI sparkle" icons everywhere
* excessive glassmorphism
* giant rounded containers
* excessive pill-shaped buttons
* excessive gradients
* floating 3D objects
* generic robot illustrations
* excessive bento grids
* random decorative stars
* huge "AI-powered" hero headlines
* excessive shadows
* cards inside cards inside cards
* excessive use of emojis
* visual effects without a functional purpose

The product should feel intentionally designed.

When choosing between:

> more visual decoration

and

> clearer information hierarchy

choose clearer information hierarchy.

---

# 37. Product Personality

The interface should feel:

**Quietly confident.**

It should not constantly try to impress the user.

Good design moments should come from:

* excellent spacing
* typography
* transitions
* content hierarchy
* small interactions
* thoughtful empty states
* responsive behavior
* consistent components

rather than visual noise.

---

# 38. Design Reference Rule

External references are inspiration only.

Never copy:

* logos
* brand colors exactly
* illustrations
* proprietary assets
* exact page layouts
* distinctive branded interactions

Combine useful principles from multiple references and create an original visual identity for this product.

---

# 39. Final Visual Test

Before considering a major frontend page complete, ask:

1. Does the content remain the visual focus?
2. Does the page feel like part of the same product?
3. Is the hierarchy immediately understandable?
4. Is there unnecessary decoration?
5. Are interactive states clear?
6. Does it work in light and dark mode?
7. Does it work on mobile?
8. Does it feel like a real product rather than an AI-generated template?
9. Are empty/loading/error states handled?
10. Is there a clear reason for every visual element?

If several answers are "no", revise before considering the page finished.
