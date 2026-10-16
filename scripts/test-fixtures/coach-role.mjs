import assert from "node:assert/strict";

/** Runtime tests must never repair missing privileges by elevating the executor. */
export async function verifyCoachRuntimeRole(db) {
  const { rows } = await db.query(`select rolsuper, rolbypassrls, rolcanlogin,
    has_schema_privilege(rolname, 'auth', 'USAGE') as auth_usage,
    has_schema_privilege(rolname, 'extensions', 'USAGE') as extensions_usage
    from pg_roles where rolname='coach_executor'`);
  assert.equal(rows.length, 1, "Coach executor must be installed");
  for (const field of ["rolsuper", "rolbypassrls", "rolcanlogin", "auth_usage", "extensions_usage"])
    assert.equal(rows[0][field], false, `realistic Coach runtime requires ${field}=false`);
}
