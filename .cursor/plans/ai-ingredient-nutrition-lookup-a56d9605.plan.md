<!-- a56d9605-a417-445a-b942-6b6bc0b3522f e2e899c9-b76b-490f-9432-0fc6e01e6abd -->
# Rehydration Page Two-Column Mobile Layout

## Overview

Update the Hydration page to show the Oral Rehydration Solution Timeline and Carbohydrate Refuel Strategy side by side on mobile screens instead of stacking vertically. Also display the Electrolyte Solution section in one row on mobile.

## Current State

- Line 249: Uses `grid grid-cols-1 lg:grid-cols-2` which stacks vertically on mobile and shows 2 columns only on large screens
- Line 231: Uses `grid grid-cols-1 md:grid-cols-3` which stacks vertically on mobile and shows 3 columns only on medium+ screens
- The two timeline cards (water reload and carb reload) are in separate cards within this grid

## Changes Required

### 1. Update Grid Layout for Mobile (Rehydration/Carb Timelines)

- Change `grid-cols-1 lg:grid-cols-2` to `grid-cols-2` so both columns appear side by side on mobile
- Keep responsive behavior but ensure mobile shows 2 columns
- May need to adjust gap spacing for mobile (`gap-6` might be too large)

### 2. Update Electrolyte Solution Section

- Change the electrolyte ratios grid from `grid-cols-1 md:grid-cols-3` to `grid-cols-3` (always 3 columns)
- This will display Sodium, Potassium, and Magnesium in one row on mobile
- May need to reduce padding/font sizes to fit on mobile screens

### 3. Optimize Card Content for Mobile

- Reduce padding/spacing in cards on mobile to fit more content
- Consider smaller font sizes for mobile
- Make timeline items more compact
- Ensure badges and text are readable at smaller sizes

### 4. Handle Horizontal Scrolling (if needed)

- If content is too wide, consider making the container horizontally scrollable
- Or use responsive text sizing to fit content

## Files to Modify

- `src/pages/Hydration.tsx`: 
- Update the grid layout on line 249 (rehydration/carb timelines)
- Update the grid layout on line 231 (electrolyte ratios)
- Adjust card styling for mobile

## Implementation Details

- Change rehydration/carb grid from `grid-cols-1 lg:grid-cols-2` to `grid-cols-2` (always 2 columns)
- Change electrolyte grid from `grid-cols-1 md:grid-cols-3` to `grid-cols-3` (always 3 columns)
- Add mobile-specific spacing adjustments
- Ensure timeline items remain readable at smaller widths
- Test that all columns fit on a typical phone screen (375px-428px width)

### To-dos

- [ ] Update weight-tracker-analysis function to accept fightNightWeight parameter and add maintenance mode detection
- [ ] Update AI system prompt to clarify goalWeight is fight week target (diet goal) and add maintenance mode instructions
- [ ] Update AI user prompt to include fight night weight context and maintenance mode instructions when at target