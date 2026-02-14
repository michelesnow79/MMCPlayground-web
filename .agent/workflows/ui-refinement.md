---
description: A collaborative process for pixel-perfect UI refinement
---

This workflow defines how we work together to refine the visual design of the application.

## 1. Asset & Requirement Prep
- USER provides specific assets (SVG, PNG) or design screenshots from Figma.
- USER describes the specific visual issue (e.g., "The logo is too low", "The woman is too small").

## 2. Surgical Implementation
- ASSISTANT makes **small, incremental changes** to the CSS or JSX.
- ASSISTANT avoids massive overhauls that might break other parts of the layout.

## 3. Automated Verification
- // turbo
- ASSISTANT runs a Playwright screenshot command to capture the current state: `npx -y playwright screenshot --viewport-size="1280,720" http://localhost:5173/ refinement_check.png`
- ASSISTANT views the screenshot to verify the change.

## 4. Collaborative Review
- ASSISTANT presents the screenshot and explains the changes.
- USER reviews the visual result and provides specific "Go/No-go" feedback.

## 5. Iteration
- If it's not perfect, return to Step 2.
- If it's perfect, move to the next UI section.
