
-- Add status enum
CREATE TYPE public.project_status AS ENUM ('draft', 'active', 'submitted');

-- Add status column with default 'draft'
ALTER TABLE public.projects ADD COLUMN status public.project_status NOT NULL DEFAULT 'draft';

-- Add submitted_at timestamp
ALTER TABLE public.projects ADD COLUMN submitted_at TIMESTAMPTZ;

-- Add snapshot column to preserve exact data at submission time
ALTER TABLE public.projects ADD COLUMN submitted_snapshot JSONB;
