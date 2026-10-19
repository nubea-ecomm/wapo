WITH entries AS (
 SELECT 'api:'||id AS id,'api' AS source,method||' '||path AS summary,path AS details,
        CASE WHEN status>=400 THEN 'failed' ELSE 'ok' END AS status,
        status AS http_status,duration_ms,request_id,created_at,status>=400 AS is_error,
        jsonb_build_object('method',method,'path',path) AS metadata
 FROM request_logs WHERE project_id=$1 AND created_at >= $2
 UNION ALL
 SELECT 'event:'||e.id,
        CASE WHEN e.source_key LIKE 'send:%' THEN 'messages' WHEN e.name LIKE 'whatsapp.%' THEN 'meta' ELSE 'events' END,
        e.name,COALESCE(e.payload#>>'{data,message,to}',e.payload#>>'{data,message,from}',e.payload->>'phone_number_id',''),
        CASE WHEN e.name LIKE '%.failed' THEN 'failed' ELSE COALESCE(e.payload#>>'{data,message,status}','ok') END,
        NULL::integer,NULL::double precision,''::text,e.created_at,e.name LIKE '%.failed',
        jsonb_build_object('event_id',e.id,'event',e.name,'message_id',e.payload#>>'{data,message_id}','phone_number_id',e.payload->>'phone_number_id')
 FROM events e WHERE e.project_id=$1 AND e.created_at >= $2
 UNION ALL
 SELECT 'delivery:'||d.id,'webhooks',e.name,
        CASE WHEN COALESCE(h.data->>'url','')='' THEN 'Suscripción eliminada' ELSE split_part(split_part(h.data->>'url','?',1),'#',1) END,
        d.state,d.last_status,NULL::double precision,''::text,d.updated_at,
        d.state='failed' OR (d.attempts>0 AND (COALESCE(d.last_status,0)=0 OR d.last_status>=400)),
        jsonb_build_object('event_id',d.event_id,'subscription_id',d.subscription_id,'attempts',d.attempts,'delivery_id',d.id)
 FROM deliveries d JOIN events e ON e.id=d.event_id AND e.project_id=d.project_id
 LEFT JOIN resources h ON h.project_id=d.project_id AND h.kind='webhooks' AND h.id=d.subscription_id
 WHERE d.project_id=$1 AND d.updated_at >= $2
)
SELECT id,source,summary,details,status,http_status,duration_ms,request_id,created_at,is_error,metadata
FROM entries
WHERE ($3='' OR source=$3)
  AND (NOT $4 OR is_error)
  AND ($5='' OR strpos(lower(summary||' '||details||' '||id||' '||request_id||' '||metadata::text),lower($5))>0)
  AND ($6::timestamptz IS NULL OR (created_at,id)<($6,$7))
ORDER BY created_at DESC,id DESC LIMIT 101;
