CREATE TABLE datasets (
  id uuid PRIMARY KEY,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  status text NOT NULL DEFAULT 'awaiting_upload' CHECK (status = 'awaiting_upload'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE images (
  id uuid PRIMARY KEY,
  dataset_id uuid NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
  position integer NOT NULL CHECK (position >= 0),
  filename text NOT NULL CHECK (length(filename) BETWEEN 1 AND 255),
  byte_size bigint NOT NULL CHECK (byte_size > 0 AND byte_size <= 104857600),
  mime_type text NOT NULL,
  UNIQUE (dataset_id, position)
);
