<!-- a56d9605-a417-445a-b942-6b6bc0b3522f e2e899c9-b76b-490f-9432-0fc6e01e6abd -->
# FightWeek Global Weight Update

## Overview

Update the FightWeek page to update the centralized currentWeight in UserContext when a weight is logged in the daily log, ensuring consistency across all pages.

## Current State

- FightWeek saves weight to `fight_week_logs` table in `saveDailyLog()` function
- Weight is saved but does NOT update the global `currentWeight` in UserContext
- Weight is saved but does NOT update `profile.current_weight_kg` in database
- This causes inconsistency - weight logged on FightWeek doesn't reflect on other pages

## Changes Required

### 1. Import updateCurrentWeight from UserContext

- Already imported `useUser` hook, but need to destructure `updateCurrentWeight`

### 2. Update saveDailyLog Function

- After successfully saving the daily log with weight:
  - Check if `dailyLog.weight_kg` exists
  - Update profile's `current_weight_kg` in database
  - Call `updateCurrentWeight()` from UserContext to update global state
- This ensures weight logged on FightWeek page is reflected everywhere

## Files to Modify

- `src/pages/FightWeek.tsx`:
  - Update `useUser` hook to include `updateCurrentWeight`
  - Modify `saveDailyLog()` to update profile and global weight when weight is logged

## Implementation Details

### Update useUser Hook

```typescript
const { currentWeight: contextCurrentWeight, updateCurrentWeight } = useUser();
```

### Update saveDailyLog Function

After successful save (line 214), add:

```typescript
// Update global current weight if weight was logged
if (dailyLog.weight_kg) {
  // Update profile in database
  await supabase
    .from("profiles")
    .update({ current_weight_kg: dailyLog.weight_kg })
    .eq("id", user.id);
  
  // Update centralized current weight
  await updateCurrentWeight(dailyLog.weight_kg);
}
```

This should be added right after the toast success message and before refreshing logs.

### To-dos

- [ ] Update weight-tracker-analysis function to accept fightNightWeight parameter and add maintenance mode detection
- [ ] Update AI system prompt to clarify goalWeight is fight week target (diet goal) and add maintenance mode instructions
- [ ] Update AI user prompt to include fight night weight context and maintenance mode instructions when at target