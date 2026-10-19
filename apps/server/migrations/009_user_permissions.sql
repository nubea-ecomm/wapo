ALTER TABLE console_users ADD COLUMN role text NOT NULL DEFAULT 'admin' CHECK(role IN ('admin','member','billing','viewer'));
ALTER TABLE console_users ADD COLUMN all_projects boolean NOT NULL DEFAULT true;
CREATE TABLE console_user_projects (
 user_id text NOT NULL REFERENCES console_users(id) ON DELETE CASCADE,
 project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 PRIMARY KEY(user_id,project_id)
);
