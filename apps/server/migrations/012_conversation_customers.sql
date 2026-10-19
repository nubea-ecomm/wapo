UPDATE resources conversation
SET data=conversation.data||jsonb_build_object('customer_id',connection.data->>'customer_id')
FROM resources connection
WHERE conversation.project_id=connection.project_id
 AND conversation.kind='conversations'
 AND connection.kind='connections'
 AND connection.id=conversation.data->>'connection_id'
 AND coalesce(connection.data->>'customer_id','')<>''
 AND coalesce(conversation.data->>'customer_id','')='';

CREATE INDEX conversation_customer_lookup ON resources(project_id,(data->>'customer_id'),created_at DESC)
 WHERE kind='conversations';
