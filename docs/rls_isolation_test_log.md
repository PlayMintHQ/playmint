# PlayMint - Two-Account RLS Isolation Test Log
**Date:** 30 September 2026
**Purpose:** Verify that Row Level Security (RLS) on the `games` table isolates data between accounts via direct API requests.

## Test Setup
* **Account A:** bogdan.marian@ligaac.ro (UUID: `6f0abb5a-b836-4a25-9691-eae8b93fbd45`)
* **Account B:** bogalima6@gmail.com (UUID: `4cb86aea-dc3e-4219-95e3-0b1c5bc96e2a`)
* **Target Record:** Game UUID `63bea407-68c5-46e3-b789-49823c821292` (created by Account A)

## Test 1: Attempt to READ Account A's game using Account B's token
**Request:**
```bash
curl -X GET 'https://pxtpktbykarmrigrvkth.supabase.co/rest/v1/games?id=eq.63bea407-68c5-46e3-b789-49823c821292' \
-H "apikey: sb_publishable_DB0Ub8FL2RH4XWCfa5Aqyw_GNPfL7Ja" \
-H "Authorization: Bearer [ACCOUNT_B_JWT]"
```
**Expected Result:** Empty array (Record hidden by RLS).
**Actual Response:** 
```json
[]
```
**Status:** PASS (HTTP 200)

## Test 2: Attempt to UPDATE Account A's game using Account B's token
**Request:**
```bash
curl -X PATCH 'https://pxtpktbykarmrigrvkth.supabase.co/rest/v1/games?id=eq.63bea407-68c5-46e3-b789-49823c821292' \
-H "apikey: sb_publishable_DB0Ub8FL2RH4XWCfa5Aqyw_GNPfL7Ja" \
-H "Authorization: Bearer [ACCOUNT_B_JWT]" \
-H "Content-Type: application/json" \
-d '{"title": "Hacked Title"}'
```
**Expected Result:** No rows updated.
**Actual Response:** HTTP 204 No Content (No rows matched the criteria due to RLS).
**Status:** PASS

## Test 3: Attempt to DELETE Account A's game using Account B's token
**Request:**
```bash
curl -X DELETE 'https://pxtpktbykarmrigrvkth.supabase.co/rest/v1/games?id=eq.63bea407-68c5-46e3-b789-49823c821292' \
-H "apikey: sb_publishable_DB0Ub8FL2RH4XWCfa5Aqyw_GNPfL7Ja" \
-H "Authorization: Bearer [ACCOUNT_B_JWT]"
```
**Expected Result:** No rows deleted.
**Actual Response:** HTTP 204 No Content (No rows matched the criteria due to RLS).
**Status:** PASS

**Conclusion:** RLS policies successfully prevent unauthorized read, update, and delete operations at the API level.
