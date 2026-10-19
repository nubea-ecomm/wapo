UPDATE projects
SET branding = branding || jsonb_build_object(
  'logo_id', encode(sha256(convert_to(branding->>'logo_data_url', 'UTF8')), 'hex')
)
WHERE COALESCE(branding->>'logo_data_url', '') <> ''
  AND COALESCE(branding->>'logo_id', '') = '';
