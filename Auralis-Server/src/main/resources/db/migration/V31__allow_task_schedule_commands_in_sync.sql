-- SCHEDULE_INSERTION is longer than the original CRUD-only storage width.
ALTER TABLE inbound_mutations
    ALTER COLUMN mutation_type TYPE VARCHAR(32);

ALTER TABLE inbound_mutations DROP CONSTRAINT ck_inbound_mutations_mutation_type;

ALTER TABLE inbound_mutations
    ADD CONSTRAINT ck_inbound_mutations_mutation_type CHECK (
        mutation_type IN ('CREATE', 'UPDATE', 'DELETE', 'RESTORE', 'SCHEDULE_INSERTION', 'SCHEDULE_SWAP')
    );
