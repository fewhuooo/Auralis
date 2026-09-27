CREATE TABLE user_avatars (
    user_id UUID PRIMARY KEY,
    content_type VARCHAR(32) NOT NULL,
    image_bytes BYTEA NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_user_avatars_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT ck_user_avatars_content_type CHECK (content_type = 'image/png'),
    CONSTRAINT ck_user_avatars_image_size CHECK (octet_length(image_bytes) BETWEEN 1 AND 5242880)
);
