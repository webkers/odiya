# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Architecture

**오디야 (Odiya)** - 안전한 일회용 위치공유 웹서비스

This is a SvelteKit 5 project with the following key characteristics:

- **Framework**: SvelteKit 5 with Svelte 5 (latest version with new runes syntax)
- **Backend**: Supabase (database, authentication, realtime)
- **Styling**: Tailwind CSS v4 with shadcn-svelte components
- **Deployment**: Configured for Vercel deployment with @sveltejs/adapter-vercel
- **Language**: JavaScript (not TypeScript) with JSDoc for type checking
- **UI Components**: shadcn-svelte component library integration
- **Maps**: Kakao Maps API integration for location services

## Key Files and Structure

- `src/routes/+page.svelte` - Main landing page with room creation
- `src/routes/room/[id]/+page.svelte` - Dynamic room page with chat, map, and participants
- `src/lib/components/ui/` - shadcn-svelte UI components (button, etc.)
- `src/lib/components/KakaoMap.svelte` - Kakao Maps integration component
- `src/lib/utils.js` - Utility functions (cn(), generateRoomId(), calculateDistance())
- `src/lib/supabase.js` - Supabase client configuration
- `components.json` - shadcn-svelte configuration (slate base color, no TypeScript)
- `svelte.config.js` - SvelteKit configuration with Vercel adapter
- `vite.config.js` - Vite configuration with Tailwind CSS v4 plugin
- `eslint.config.js` - ESLint configuration with Svelte support

## Development Commands

```bash
# Start development server
npm run dev

# Start development server and open browser
npm run dev -- --open

# Build for production
npm run build

# Preview production build
npm run preview

# Type checking (using svelte-check with JSDoc)
npm run check

# Type checking in watch mode
npm run check:watch

# Lint code
npm run lint
```

## Important Technical Notes

- **Svelte 5 Runes**: Uses new syntax (`$props()`, `$state()`, etc.) instead of legacy reactive statements
- **JavaScript + JSDoc**: Configured for type checking without TypeScript compilation
- **Tailwind CSS v4**: Uses new @import syntax and @theme inline configuration
- **shadcn-svelte**: UI components with slate color scheme, no TypeScript mode
- **SvelteKit Aliases**: Uses `$lib/*` for library imports (not `@/*` - the alias in svelte.config.js is misconfigured)
- **ESLint**: Configured with @eslint/js and eslint-plugin-svelte for modern linting

## Component Development

When creating new components:
- Follow shadcn-svelte patterns for UI components (see `src/lib/components/ui/button/`)
- Use the `cn()` utility from `$lib/utils` for conditional styling
- Place reusable components in `src/lib/components/`
- Use Svelte 5 runes syntax (`$props()`, `$state()`, etc.) instead of `export let`
- Leverage existing Tailwind classes and component variants
- Use JSDoc type annotations for props: `/** @type {string} */ export let propName`

## Architecture & Data Flow

### Real-time Architecture
- **Supabase Realtime**: PostgreSQL changes trigger real-time updates via WebSockets
- **Presence System**: Tracks active users and handles disconnections
- **Heartbeat System**: 30-second intervals to detect and remove stale participants
- **Multi-channel Setup**:
  - `participants:${roomId}` - participant changes
  - `messages:${roomId}` - new chat messages  
  - `rooms_updates:${roomId}` - destination updates
  - `presence:${roomId}` - user presence tracking

### State Management
- **Local State**: Svelte 5 runes (`$state()`, `$derived()`) for component state
- **localStorage**: Session persistence for room participation
- **Database State**: Supabase as source of truth for shared data
- **Location Tracking**: Continuous geolocation API updates with distance-based filtering

### Key Database Tables
- `rooms` - Room metadata and destinations
- `participants` - User info, locations, heartbeat status
- `messages` - Chat messages

## Project Features & Requirements

### Core Functionality
- **Room Creation**: 6-character alphanumeric room IDs via `generateRoomId()`
- **No Authentication**: Join with display name only, localStorage session management
- **Real-time Location Sharing**: Continuous geolocation with 10m update threshold
- **Real-time Chat**: Instant messaging via Supabase realtime
- **Destination Management**: Room creators can search/set destinations using Kakao Places API
- **Distance Calculations**: Haversine formula for participant-to-destination distances
- **Automatic Cleanup**: Users removed on browser close/navigation via beforeunload/pagehide events

### Technical Implementation Details

#### Location Services
- **Kakao Maps API**: Map rendering, place search, marker management
- **Geolocation API**: `watchPosition()` for continuous location tracking
- **Distance Calculation**: Haversine formula implementation in `src/lib/utils.js`
- **Update Optimization**: Only update database when movement > 10 meters

#### Connection Management
- **Graceful Disconnection**: beforeunload/pagehide event handlers
- **Presence Tracking**: Real-time user status via Supabase Presence
- **Session Recovery**: localStorage-based session restoration
- **Heartbeat System**: Periodic database updates to detect stale connections

#### UI/UX Architecture
- **Responsive Design**: Mobile-first with collapsible panels
- **Floating Panels**: Participants list (left) and chat (bottom-right)
- **Full-screen Map**: KakaoMap component occupies main viewport
- **Modal System**: Destination search and confirmation dialogs

### Database Schema Considerations
- When making schema changes, provide SQL migration scripts for Supabase SQL Editor
- All location data stored as separate lat/lng columns for efficient querying
- Timestamps use ISO 8601 format for consistency
- Participant cleanup relies on `last_heartbeat` and presence events

### Environment Variables
- `PUBLIC_SUPABASE_URL` - Supabase project URL
- `PUBLIC_SUPABASE_ANON_KEY` - Supabase public API key
- `PUBLIC_KAKAO_MAP_API_KEY` - Kakao Maps JavaScript API key