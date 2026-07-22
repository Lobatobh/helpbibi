// Compatibility tombstone. Initial ADMIN creation is intentionally restricted
// to scripts/bootstrap-admin.ts, which requires explicit environment input.
export function legacyAdminSeedDisabled(): never {
  throw new Error('LEGACY_ADMIN_SEED_DISABLED_USE_SCRIPTS_BOOTSTRAP_ADMIN')
}

if (import.meta.main) {
  try {
    legacyAdminSeedDisabled()
  } catch {
    console.error(JSON.stringify({
      ok: false,
      code: 'LEGACY_ADMIN_SEED_DISABLED_USE_SCRIPTS_BOOTSTRAP_ADMIN',
      changed: false,
    }))
    process.exitCode = 1
  }
}
