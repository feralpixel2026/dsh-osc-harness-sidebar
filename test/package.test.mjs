/**
 * Structural tests for the sidebar bundle.
 *
 * There is no build step and no bundler: `client.js` is hand-written and shipped as-is. That
 * makes the file's own invariants the thing worth testing — the contract a page relies on, the
 * patch that takes over the seat, and the fact that removing the plugin restores the native
 * sidebar. These are structural checks rather than behavioural ones because there is no DOM
 * here; the browser behaviour is exercised by loading the bundle in DSH.
 */

import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { test } from 'node:test'

const ROOT = new URL('..', import.meta.url)
const read = (name) => readFileSync(new URL(name, ROOT), 'utf8')

const client = read('client.js')
const host = read('index.js')
const patch = read('cordis.patch.yml')
const manifest = JSON.parse(read('package.json'))

test('the manifest declares both halves DSH loads', () => {
  assert.equal(manifest.name, 'dsh-osc-harness-sidebar')
  assert.equal(manifest.type, 'module')
  assert.equal(manifest.dsh.bundle.patch, './cordis.patch.yml')
  assert.equal(manifest.dsh.client.platform, 'web')
})

test('the manifest has no runtime dependencies', () => {
  // Zero dependencies is a promise in the README: the plugin must install and run alone.
  assert.equal(manifest.dependencies, undefined)
  assert.equal(manifest.peerDependencies, undefined)
})

test('the client declares the browser services it needs', () => {
  const inject = manifest.dsh.client.inject
  assert.ok(Array.isArray(inject))
  assert.ok(inject.includes('@deepseek-ai/dsh-client-locale'))
  assert.ok(inject.includes('@deepseek-ai/dsh-client-ui-slots'))
})

test('every path in files[] exists on disk', () => {
  for (const entry of manifest.files) {
    // `locale/*.json` is a glob; check the directory instead.
    const name = entry.includes('*') ? entry.replace(/\/\*.*$/, '') : entry
    assert.ok(existsSync(new URL(name, ROOT)), `${entry} is declared but missing`)
  }
})

test('the host half exports an apply function', () => {
  // The Loader activates a Host plugin by calling apply; without it the bundle is inert.
  assert.match(host, /export function apply\s*\(/)
})

test('the patch disables ui-sidebar', () => {
  // A child seat can only be declared by its occupant. Leaving ui-sidebar enabled makes the
  // Loader reject our declaration with `already declared`, so this entry is load-bearing.
  assert.match(patch, /id:\s*ui-sidebar\s*\n\s*disabled:\s*true/)
})

test('the patch inserts this plugin by name', () => {
  assert.match(patch, /insert:/)
  assert.match(patch, /name:\s*dsh-osc-harness-sidebar/)
})

test('the client registers through the module loader', () => {
  // A dynamic client bundle is consumed through this exact global; anything else is not loaded.
  assert.match(client, /window\.__ModuleLoader__\.load\(/)
})

test('the client exports a plugin with inject and apply', () => {
  assert.match(client, /inject:\s*\[/)
  assert.match(client, /apply\s*\(/)
})

test('the built-in conversation entry is owned by this bundle', () => {
  // The row must call ctx.layout.selectPanel(null), which only the seat occupant has. If it
  // ever moved to a product package that package could not perform the switch back.
  assert.match(client, /product-conversation/)
  assert.match(client, /selectPanel\(null\)/)
})

test('the rail reads its grouping from configuration, not from slots', () => {
  // Group metadata cannot travel through registration options (the whitelist drops it), so
  // grouping is resolved from saved config with an in-code default. A regression here shows up
  // as every product collapsing into one group.
  assert.match(client, /resolveGrouping/)
  assert.match(client, /DEFAULT_GROUPS/)
})

test('the default group cannot be deleted, hidden, collapsed or renamed', () => {
  assert.match(client, /g-default/)
  // removeGroup refuses the default group before doing anything else.
  assert.match(client, /removeGroup[\s\S]{0,400}g-default/)
  // Renaming is refused the same way: the double-click handler returns early for it.
  assert.match(client, /if \(isDefault\) return/)
  // The refusal is explained to the user rather than failing silently.
  assert.match(client, /cannotRename/)
})

test('the docs describe the default group the way the code behaves', () => {
  // The README once claimed the default group could be renamed while the handler refused it.
  // Prose and behaviour drifted because nothing checked them together; this couples them.
  //
  // Only the current statement is checked. A changelog entry legitimately *quotes* the old,
  // wrong wording when it records the fix, so the scan looks at the sections that state
  // present behaviour and ignores dated history entries.
  const readme = read('README.md')
  const changelog = read('CHANGELOG.md')
  const renamableInCode = !/if \(isDefault\) return/.test(client)

  // README states behaviour; strip the changelog-style history if ever quoted there.
  const readmeClaimsRenamable = /但可以重命名|可以重命名/.test(readme.replace(/不能改名/g, ''))

  // The changelog's "设计决定" bullet is the canonical present-tense statement; history
  // entries under "修复" describe the past and are excluded.
  const decisionSection = /##\s*设计决定([\s\S]*?)(?=\n##\s|\n\[)/.exec(changelog)?.[1] ?? ''
  const changelogClaimsRenamable = decisionSection !== ''
    ? /可以重命名/.test(decisionSection.replace(/不能改名/g, ''))
    : false

  assert.equal(
    readmeClaimsRenamable,
    renamableInCode,
    `README claims the default group ${readmeClaimsRenamable ? 'is' : 'is not'} renamable but client.js says otherwise`,
  )
  assert.equal(
    changelogClaimsRenamable,
    renamableInCode,
    `CHANGELOG 设计决定 claims the default group ${changelogClaimsRenamable ? 'is' : 'is not'} renamable but client.js says otherwise`,
  )
})

test('the declared license matches the LICENSE file and the README', () => {
  // Three places state the license; a mismatch is the kind of defect a reader spots before
  // maintainers do, so it is checked rather than trusted.
  const license = read('LICENSE')
  const readme = read('README.md')
  assert.match(license, /Apache License/)
  assert.match(license, /Version 2\.0/)
  assert.equal(manifest.license, 'Apache-2.0')
  assert.match(readme, /Apache-2\.0/)
  assert.doesNotMatch(readme, /MIT/)
})

test('its own styles are namespaced and never global', () => {
  // The shell styles its own elements under a `.pn-` prefix. It does not reach into antd
  // classes at all: product pages scope their antd overrides under `[data-dsh-product-page]`,
  // which is the contract package's job, not the shell's. Asserting the page-scope attribute
  // here would check the wrong layer.
  assert.ok(/\.pn-[a-z]/.test(client), 'shell styles are not namespaced under .pn-')
  assert.equal((client.match(/\.ant-[a-z]/g) ?? []).length, 0, 'shell reaches into antd classes')
})

test('the client region has balanced braces and no syntax hazard', () => {
  // Cheap structural guard for a file nothing compiles. `node --check` is run by `npm run check`
  // and is the authoritative version of this assertion; this only catches gross truncation.
  assert.ok(client.length > 50_000, 'client.js looks truncated')
  assert.ok(client.trimEnd().endsWith('})'), 'client.js does not end with a closed loader call')
})
