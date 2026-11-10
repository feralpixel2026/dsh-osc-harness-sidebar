/**
 * Node half of the new-sidebar bundle.
 *
 * The row exists so the Loader has a Host plugin to activate; all behavior
 * lives in the browser half (`./client`), which the Web shell loads through
 * the `dsh.client` manifest.
 */

/** No Host-side services are required. */
export function apply() {}
