ALTER TABLE images
  ADD COLUMN width integer CHECK (width > 0),
  ADD COLUMN height integer CHECK (height > 0),
  ADD COLUMN format text,
  ADD COLUMN verified_at timestamptz,
  ADD COLUMN validation_error text;
