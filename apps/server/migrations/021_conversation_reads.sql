CREATE TABLE conversation_reads (
 project_id text NOT NULL,
 conversation_kind text NOT NULL DEFAULT 'conversations' CHECK (conversation_kind='conversations'),
 conversation_id text NOT NULL,
 reader_id text NOT NULL,
 last_read_at timestamptz NOT NULL,
 last_read_message_id text NOT NULL,
 PRIMARY KEY(project_id,conversation_id,reader_id),
 FOREIGN KEY(project_id,conversation_kind,conversation_id)
  REFERENCES resources(project_id,kind,id) ON DELETE CASCADE
);
CREATE INDEX message_inbound_conversation ON resources
 (project_id,(data->>'conversation_id'),created_at DESC,id DESC)
 WHERE kind='messages' AND data->>'direction'='inbound';
