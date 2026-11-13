package com.auralis.app.shared.domain;

import jakarta.persistence.EntityExistsException;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.hibernate.exception.ConstraintViolationException;
import org.springframework.stereotype.Component;

@Component
public class CoreResourceInsert {

    @PersistenceContext
    private EntityManager entityManager;

    public <T> T insert(String table, T entity) {
        try {
            entityManager.persist(entity);
            entityManager.flush();
            return entity;
        } catch (EntityExistsException exception) {
            throw new IdCollision(exception);
        } catch (ConstraintViolationException exception) {
            if (isPrimaryKeyViolation(table, exception)) {
                throw new IdCollision(exception);
            }
            throw exception;
        }
    }

    private boolean isPrimaryKeyViolation(String table, ConstraintViolationException exception) {
        if (!"23505".equals(exception.getSQLState())) {
            return false;
        }
        if ((table + "_pkey").equals(exception.getConstraintName())) {
            return true;
        }
        // H2 reports a generated PK index name, so match the table in the failing statement.
        String constraint = exception.getConstraintName();
        return exception.getErrorCode() == 23505 && constraint != null && constraint.startsWith("public.PRIMARY_KEY_")
                && exception.getSQL() != null && exception.getSQL().startsWith("insert into " + table + " (");
    }

    public static class IdCollision extends RuntimeException {
        private IdCollision(RuntimeException cause) {
            super("Resource ID already exists", cause);
        }
    }
}
