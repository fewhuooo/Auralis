CREATE TABLE overview_cache_capacity_guard (
    id INTEGER PRIMARY KEY,
    CONSTRAINT ck_overview_cache_capacity_guard_singleton CHECK (id = 1)
);

INSERT INTO overview_cache_capacity_guard (id) VALUES (1);
