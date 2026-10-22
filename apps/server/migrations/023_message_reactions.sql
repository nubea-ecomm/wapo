-- Reaction records remain in the message journal, but are not timeline bubbles.
UPDATE resources SET data=data||jsonb_build_object(
 'reaction_actor',CASE WHEN data->>'direction'='outbound' THEN 'business' ELSE 'contact' END,
 'reaction_at',CASE WHEN coalesce(data->>'timestamp','') ~ '^[0-9]{1,12}$'
  THEN to_timestamp((data->>'timestamp')::double precision) ELSE created_at END)
WHERE kind='messages' AND data->'payload'->>'type'='reaction';

CREATE INDEX message_reaction_target ON resources
 (project_id,(data->>'connection_id'),(data->'payload'->'reaction'->>'message_id'))
 WHERE kind='messages' AND data->'payload'->>'type'='reaction';

-- Repair previews that previously displayed a reaction as an ordinary message.
UPDATE resources c SET data=c.data||jsonb_build_object('last_message',
 (SELECT m.data FROM resources m WHERE m.project_id=c.project_id AND m.kind='messages'
  AND m.data->>'conversation_id'=c.id AND m.data->'payload'->>'type' IS DISTINCT FROM 'reaction'
  ORDER BY m.created_at DESC,m.id DESC LIMIT 1))
WHERE c.kind='conversations' AND c.data->'last_message'->'payload'->>'type'='reaction'
 AND EXISTS(SELECT 1 FROM resources m WHERE m.project_id=c.project_id AND m.kind='messages'
  AND m.data->>'conversation_id'=c.id AND m.data->'payload'->>'type' IS DISTINCT FROM 'reaction');
