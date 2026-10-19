DROP INDEX IF EXISTS message_lookup;
CREATE INDEX IF NOT EXISTS message_connection_list
 ON resources(project_id,(data->>'connection_id'),created_at DESC,id DESC)
 WHERE kind='messages';
CREATE INDEX IF NOT EXISTS message_direction_list
 ON resources(project_id,(data->>'direction'),created_at DESC,id DESC)
 WHERE kind='messages';
CREATE INDEX IF NOT EXISTS message_status_list
 ON resources(project_id,(data->>'status'),created_at DESC,id DESC)
 WHERE kind='messages';
