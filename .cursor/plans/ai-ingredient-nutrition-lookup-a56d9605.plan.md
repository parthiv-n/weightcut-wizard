<!-- a56d9605-a417-445a-b942-6b6bc0b3522f e2e899c9-b76b-490f-9432-0fc6e01e6abd -->
# Fix Onboarding Return Flow

## Problem

When a user exits during onboarding on mobile and returns, they're redirected to dashboard (or other routes) even though they haven't completed onboarding, making it impossible to finish setup.

## Root Cause

1. Index.tsx redirects authenticated users to `/dashboard` without checking if profile exists
2. ProtectedRoute only checks authentication, not profile completion
3. Other routes (dashboard, etc.) don't check for profile before rendering
4. No mechanism to redirect users without profiles back to onboarding

## Solution

### 1. Create ProfileCompletionGuard Component

- New component that checks if user has a profile
- If authenticated but no profile → redirect to `/onboarding`
- If authenticated and has profile → allow access
- If not authenticated → redirect handled by ProtectedRoute

### 2. Update ProtectedRoute or Create Wrapper

- Option A: Enhance ProtectedRoute to also check profile completion
- Option B: Create a new wrapper component that combines auth + profile checks
- Apply to all routes that require a profile (dashboard, goals, nutrition, etc.)
- Exclude `/onboarding` and `/auth` from profile check

### 3. Update Index.tsx

- Check if user has profile before redirecting
- If authenticated but no profile → redirect to `/onboarding`
- If authenticated with profile → redirect to `/dashboard`
- If not authenticated → stay on index page

### 4. Update Onboarding.tsx

- Keep the existing check that redirects to dashboard if profile exists
- Ensure it doesn't interfere with users who don't have profiles

## Implementation

The guard should:

- Check profile existence after authentication is confirmed
- Show loading state while checking
- Redirect to `/onboarding` if no profile found
- Allow access if profile exists
- Work seamlessly with existing ProtectedRoute

### To-dos

- [ ] Update weight-tracker-analysis function to accept fightNightWeight parameter and add maintenance mode detection
- [ ] Update AI system prompt to clarify goalWeight is fight week target (diet goal) and add maintenance mode instructions
- [ ] Update AI user prompt to include fight night weight context and maintenance mode instructions when at target