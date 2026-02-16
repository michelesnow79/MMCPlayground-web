# MissMeConnection Website Replica

## ⚠️ Core Interaction Rules
1. **No Unmanaged Deploy/Git**: Never run `git push`, `vercel`, or `save` commands without explicit instructions.
2. **3-Minute Limit**: Never start a task taking > 3 minutes without explicit permission.
3. **Wait for GO**: Always describe the plan and wait for the user to say "GO" before execution.

## Overview
A pixel-perfect, premium replica of the MissMeConnection website built with React, Vite, and Leaflet. 
The project leverages detailed design specifications extracted directly from Figma to ensure high fidelity.

## Technology Stack
- **Frontend**: React 18
- **Styling**: Vanilla CSS with a centralized Design System
- **Routing**: React Router DOM v6
- **Maps**: React-Leaflet (CARTO Dark Matter tiles)
- **Icons/Assets**: Exported SVG/PNG from Figma

## Design System
- **Typography**:
  - `Bangers`: Used for hero titles, section headings, and branding.
  - `Nunito (500, 900)`: Used for body text, button labels, and metadata.
- **Color Palette**:
  - `Pink (#fe2c55)`: Primary accents, badges, and primary buttons.
  - `Cyan (#06aed4)`: Action buttons, links, and active navigation states.
  - `Yellow (#fed400)`: Accent highlights and map instructions.
  - `Dark BG (#18181b)`: Global page background.
- **Aesthetics**: High-contrast, comic-style (Bangers), smooth gradients, and glassmorphism (backdrop-filters).

## Pages & Status
| Page | Status | Description |
| :--- | :--- | :--- |
| **Landing** | ✅ Complete | Full hero section with halftone overlays and feature grids. |
| **Map View** | ✅ Complete | Dark-themed map with custom heart markers and floating cards. |
| **Browse** | ✅ Complete | Card-based list of connections matching Figma layout. |
| **Messages** | ✅ Complete | Thread list with unread badges and premium spacing. |
| **Account** | ✅ Complete | Settings page with gradient avatar and unified theme. |
| **Login** | ✅ Complete | Branded login card with secure input styles. |

## Key Implementation Details
- **Figma Extraction**: Design tokens (colors, font-weights, line-heights) were extracted using automated scripts to minimize guesswork.
- **Halftone Overlays**: Replicated exactly using radial gradients and exported SVG patterns.
- **Custom Markers**: Leaflet markers styled with CSS to match the Figma heart-shaped pins.
- **Responsive Design**: All pages are optimized for mobile-first consumption with full visibility on desktop.
