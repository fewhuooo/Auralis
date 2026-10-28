alter table ai_usage_reservations
    add column operation_kind varchar(32);

alter table ai_usage_reservations
    add column credential_source varchar(32);

create index idx_ai_usage_reservations_source_created
    on ai_usage_reservations (user_id, credential_source, created_at);
