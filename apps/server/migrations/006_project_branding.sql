ALTER TABLE projects ADD COLUMN branding jsonb NOT NULL DEFAULT '{"accent_color":"#171717","theme":"light","logo_data_url":""}'::jsonb;
