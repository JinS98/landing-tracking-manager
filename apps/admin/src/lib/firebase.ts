// Browser Firebase CRUD is intentionally absent. Production writes must go through
// a server that has verified the company access gateway and operator permissions.
// VITE_DEMO_MODE=false is not an authorization switch and cannot enable writes.
export const demoMode = true;
