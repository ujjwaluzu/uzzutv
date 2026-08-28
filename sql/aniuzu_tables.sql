-- =============================================================
-- ANIUZU DEDICATED TABLES
-- Run this SQL in your Supabase SQL Editor.
-- =============================================================

-- 1. WATCHLIST (anime-specific)
-- =============================================================

CREATE TABLE IF NOT EXISTS aniuzu_watchlist (
    id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id     uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    media_id    integer NOT NULL,
    title       text NOT NULL DEFAULT '',
    poster      text NOT NULL DEFAULT '',
    created_at  timestamptz DEFAULT now() NOT NULL,
    UNIQUE(user_id, media_id)
);

ALTER TABLE aniuzu_watchlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own anime watchlist"
    ON aniuzu_watchlist FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own anime watchlist"
    ON aniuzu_watchlist FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own anime watchlist"
    ON aniuzu_watchlist FOR DELETE
    USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_aniuzu_wl_user ON aniuzu_watchlist(user_id);
CREATE INDEX IF NOT EXISTS idx_aniuzu_wl_created ON aniuzu_watchlist(user_id, created_at DESC);
