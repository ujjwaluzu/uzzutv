-- UzzUTV Continue Watching playback state
-- Run this once in the Supabase SQL editor after continue_watching exists.

ALTER TABLE public.continue_watching
    ADD COLUMN IF NOT EXISTS title text NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS year text NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS server text NOT NULL DEFAULT 'vidfast',
    ADD COLUMN IF NOT EXISTS position numeric(12,3) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS duration numeric(12,3),
    ADD COLUMN IF NOT EXISTS progress_percent numeric(5,2);

UPDATE public.continue_watching
SET server = 'vidfast'
WHERE server IS NULL OR server = '';

ALTER TABLE public.continue_watching
    DROP CONSTRAINT IF EXISTS continue_watching_server_check,
    DROP CONSTRAINT IF EXISTS continue_watching_position_check,
    DROP CONSTRAINT IF EXISTS continue_watching_duration_check,
    DROP CONSTRAINT IF EXISTS continue_watching_progress_percent_check;

ALTER TABLE public.continue_watching
    ADD CONSTRAINT continue_watching_server_check
        CHECK (server IN ('vidfast', 'vidking', 'vidnest', 'vidsrc', 'videasy')),
    ADD CONSTRAINT continue_watching_position_check
        CHECK (position >= 0),
    ADD CONSTRAINT continue_watching_duration_check
        CHECK (duration IS NULL OR duration > 0),
    ADD CONSTRAINT continue_watching_progress_percent_check
        CHECK (progress_percent IS NULL OR (progress_percent >= 0 AND progress_percent <= 100));

CREATE INDEX IF NOT EXISTS idx_continue_watching_user_updated
    ON public.continue_watching(user_id, updated_at DESC);
