ALTER TABLE images ADD COLUMN relative_path text;
UPDATE images SET relative_path = filename;
ALTER TABLE images ALTER COLUMN relative_path SET NOT NULL;
ALTER TABLE images ADD CONSTRAINT images_relative_path_valid CHECK (
  length(relative_path) BETWEEN 1 AND 1024
  AND left(relative_path, 1) <> '/'
  AND relative_path !~ '(^|/)\.\.?(/|$)'
  AND position(chr(92) in relative_path) = 0
  AND relative_path !~ '[[:cntrl:]]'
);
