ALTER TABLE console_users
  ADD COLUMN language text NOT NULL DEFAULT 'es' CHECK (language IN ('es', 'pt', 'en')),
  ADD COLUMN avatar_variant integer NOT NULL DEFAULT 0 CHECK (avatar_variant BETWEEN 0 AND 2147483647);
