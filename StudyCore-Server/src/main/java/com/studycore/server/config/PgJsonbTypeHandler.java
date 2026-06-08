package com.studycore.server.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.ibatis.type.BaseTypeHandler;
import org.apache.ibatis.type.JdbcType;
import org.postgresql.util.PGobject;

import java.sql.CallableStatement;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;

public class PgJsonbTypeHandler extends BaseTypeHandler<Object> {
    private static final ObjectMapper objectMapper = new ObjectMapper();

    @Override
    public void setNonNullParameter(PreparedStatement ps, int i, Object parameter, JdbcType jdbcType) throws SQLException {
        if (ps != null) {
            PGobject jsonObject = new PGobject();
            jsonObject.setType("jsonb");
            try {
                jsonObject.setValue(objectMapper.writeValueAsString(parameter));
            } catch (Exception e) {
                throw new SQLException("Error converting Object to JSON", e);
            }
            ps.setObject(i, jsonObject);
        }
    }

    @Override
    public Object getNullableResult(ResultSet rs, String columnName) throws SQLException {
        return toObject(rs.getString(columnName));
    }

    @Override
    public Object getNullableResult(ResultSet rs, int columnIndex) throws SQLException {
        return toObject(rs.getString(columnIndex));
    }

    @Override
    public Object getNullableResult(CallableStatement cs, int columnIndex) throws SQLException {
        return toObject(cs.getString(columnIndex));
    }

    private Object toObject(String content) {
        if (content == null || content.isEmpty()) {
            return null;
        }
        try {
            return objectMapper.readValue(content, Object.class);
        } catch (Exception e) {
            throw new RuntimeException("Error converting JSON to Object", e);
        }
    }
}
