# PlayMint - September 2026 Deliverable Walkthrough

This guide walks you through verifying the September 2026 milestone deliverables, specifically focusing on the new Account and My Games features, and confirming that the platform foundation (P0) is fully implemented.

## 1. Sign Up & Authentication
1. Go to the live app at **[playmintai.vercel.app](https://playmintai.vercel.app)**.
2. In the header, click **Sign In**.
3. Choose **Sign Up**, enter your email and password, and confirm your email (if required), or use **Google Sign-In**.
4. You will be redirected back to the app and see your display name in the account menu in the top right. 
5. Refresh the page to verify that your session persists across reloads.
6. Test **Sign Out** by clicking your account menu and selecting Sign Out.

## 2. Generating & Auto-Saving a Game
1. Sign back in with your account.
2. Generate a game by typing a prompt in the start screen.
3. Because you are signed in, the game is **automatically saved** alongside the AI art upload upon generation.

*Guest Experience:* 
- Sign out and generate a game. You can play without an account.
- In the Creator Panel, click **Save**. You will be prompted to sign in. Upon signing in, the game you just created will be saved.

## 3. My Games Library
1. While signed in, navigate to **My Games**.
2. You will see a responsive grid displaying the games you've saved, complete with thumbnails, titles, game modes, and dates.
3. On your phone (or by resizing your desktop browser), verify that the grid reads cleanly in both portrait and landscape orientations.

## 4. Play, Rename, and Delete
1. In the **My Games** library, click **Play** on any card. The game will boot up with its generated AI art restored.
2. Click **Rename** on a card and give the game a new title.
3. Click **Delete**. A confirmation dialog will appear. Confirm the deletion and verify the game disappears from your library across devices.

## 5. Security & Isolation Verification
- The database schema (including `visibility`, `published_at`, `allow_remix`) is in place and ready for October's publish and remix loop.
- Your games are fully isolated through Row Level Security (RLS). Please refer to the **Two-Account RLS Isolation Test Log** for proof that direct API requests from a second account are blocked from reading or modifying your games.
