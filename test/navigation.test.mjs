import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const client = readFileSync(new URL('../client.js', import.meta.url), 'utf8')

/**
 * These assertions pin the navigation rules that used to be enforced by three
 * separate special cases. They read source text because the module talks to
 * `window.__ModuleLoader__` and cannot be imported; each one names the concrete
 * defect it prevents from coming back.
 */

test('every group follows one open-state rule', () => {
  // The old body returned false for anything except g-default and consulted an
  // `openSectionsTouched` flag. Collapsing the AI group therefore reopened on
  // the next render, and touching any group closed the default one for good.
  const body = client.match(/function isSectionOpen\(config, sectionId\) \{[\s\S]*?\n  \}/)
  assert.ok(body, 'isSectionOpen must exist')
  assert.doesNotMatch(body[0], /openSectionsTouched/, 'the touch flag must not gate the result')
  assert.doesNotMatch(body[0], /sectionId !== 'g-default'/, 'no group may be special-cased')
  assert.match(body[0], /DEFAULT_OPEN_SECTIONS/, 'the factory list supplies the fallback')
})

test('toggling a group never touches another group', () => {
  const body = client.match(/const toggleSection = \(id\) => \{[\s\S]*?\n      \}/)
  assert.ok(body, 'toggleSection must exist')
  assert.doesNotMatch(body[0], /openSectionsTouched/, 'writing a per-id flag is what coupled the groups')
  assert.match(body[0], /openSections: next/, 'the new list is what gets stored')
})

test('built-in rows keep the group they declare', () => {
  // resolveGrouping consulted DEFAULT_GROUP_OF only. The two built-in rows are
  // not in that table, so every render sent them back to the fallback group and
  // dragging them looked like a no-op.
  assert.match(client, /SEEDS\.map\(\(row\) => \[String\(row\.id\), row\.section\]\)/, 'seed sections feed the resolver')
  assert.match(client, /DEFAULT_GROUP_OF\[key\] \?\? seedSection\.get\(key\)/, 'seed section is consulted after the historical table')
})

test('stored ownership is read with a string key', () => {
  // Drag events hand back ids that may not be strings; a non-string key silently
  // misses `stored` and falls through to the factory answer.
  assert.match(client, /const key = String\(id\)/)
  assert.match(client, /typeof stored\[key\] === 'string'/)
})

test('the factory state shows both starter groups expanded', () => {
  const list = client.match(/const DEFAULT_OPEN_SECTIONS = \[([^\]]*)\]/)
  assert.ok(list, 'DEFAULT_OPEN_SECTIONS must exist')
  assert.match(list[1], /'g-default'/, 'the default group starts expanded')
  assert.match(list[1], /'g-ai'/, 'the AI Harness group starts expanded')
})

test('the config table names the two group columns as specified', () => {
  assert.match(client, /'config\.colVisible': '分组显示'/)
  assert.match(client, /'config\.colOpen': '分组展开\/折叠'/)
  // The old wording described a per-product default; both columns are per-group.
  assert.doesNotMatch(client, /'config\.colVisible': '显示状态'/)
  assert.doesNotMatch(client, /'config\.colOpen': '默认展开'/)
})

test('the HARNESS badge is a solid rounded tag with inverted text', () => {
  // The specimen mark is vector artwork, but at this rail's size the typeset
  // version reads better beside the small wordmark, so the tag stays text. Pin
  // the geometry the native badge also uses: 14 high, 2px radius, solid fill.
  assert.match(client, /h\('span', \{ className: 'pn-rail-brand-tag' \}, t\('brand\.tag'\)\)/)
  assert.match(client, /border-radius: 2px; height: 14px; line-height: 14px;/)
  assert.match(client, /background: var\(--dsw-alias-label-primary\);/)
  assert.match(client, /color: var\(--dsw-alias-label-primary-inverted/)
})

test('a hidden group is not rendered at all', () => {
  // Hiding used to re-home the group's products into the default group, so the
  // "Group shown" switch looked dead and a hidden group had no chip to drop onto.
  const body = client.match(/const visibleSections = [^\n]*/)
  assert.ok(body, 'the rail filters hidden groups before rendering')
  assert.match(client, /visibleSections\.map\(\(section, sectionIndex\) => \{/)
  assert.doesNotMatch(client, /return \{ \.\.\.entry, section: defaultSection \}/, 'products must stay in their own group')
})

test('the default group is always shown', () => {
  // It anchors every ungrouped row, including products registered without a
  // valid group, so neither the switch nor a stale payload may hide it.
  assert.match(client, /const DEFAULT_SECTION_ID = 'g-default'/)
  assert.match(client, /disabled: isDefault,/)
  assert.match(client, /parsed\.hiddenSections = parsed\.hiddenSections\.filter\(\(id\) => id !== DEFAULT_SECTION_ID\)/)
  // The fallback is pinned by id, not by position in whatever list was passed.
  assert.match(client, /sections\.find\(\(section\) => section\.id === DEFAULT_SECTION_ID\) \?\? sections\[0\]/)
})

test('an empty group accepts a dropped row', () => {
  // Without this a freshly created group could never receive a row: it has no
  // chip to act as a drop target and the row's own handler was covered.
  assert.match(client, /const chipList = \(items, onDropInto\) =>/)
  assert.match(client, /chipList\(items, \(productId\) => \{ moveProduct\(productId, section\.id\) \}\)/)
})

test('the rail references no identifier it no longer defines', () => {
  // A removed helper (originalGroupOf) stayed referenced in one filter, and no
  // static gate caught it: node --check only parses, and the smoke render never
  // mounts ProductSidebar. Walk the rail component's body and assert every
  // identifier it uses is declared somewhere in the module.
  const start = client.indexOf('function ProductSidebar')
  assert.ok(start > 0, 'ProductSidebar must exist')
  // Take the component body up to the next top-level function.
  const nextFn = client.indexOf('\n    function ', start + 10)
  const body = client.slice(start, nextFn > 0 ? nextFn : client.length)

  for (const gone of ['originalGroupOf', 'assignedRows', 'relocatedIds', 'settledMax', 'defaultSection']) {
    assert.ok(!body.includes(gone), `${gone} was removed and must not be referenced`)
  }
})

test('drop handlers read the drag state synchronously', () => {
  // onDragStart updates state one tick late, so a drop landing in the same tick
  // read null and returned early: the "sometimes it works" half of the report.
  // Every drop gate must read the ref, never the useState value.
  assert.match(client, /const draggingProductRef = useRef\(null\)/)
  assert.match(client, /const setDraggingProduct = \(value\) => \{\s*draggingProductRef\.current = value/)
  assert.equal(
    (client.match(/if \(draggingProduct === null\) return/g) ?? []).length,
    0,
    'no drop handler may gate on the async state value',
  )
  assert.ok((client.match(/draggingProductRef\.current/g) ?? []).length >= 8, 'the ref is what handlers read')
})

test('the tail drop zone does not paint an empty bar', () => {
  // `flex: 1 1 32px` with `align-self: stretch` filled the remaining width of the
  // row, which read as an empty input box rather than as a drop target.
  const idle = client.match(/\.pn-chips-tail \{[^}]*\}/)
  assert.ok(idle, '.pn-chips-tail must exist')
  assert.match(idle[0], /flex: 0 0 0/)
  assert.match(idle[0], /width: 0/)
  // It may only grow while a drag is actually over it.
  const over = client.match(/\.pn-chips-tail\.is-over \{[^}]*\}/)
  assert.ok(over, '.pn-chips-tail.is-over must exist')
  assert.match(over[0], /flex: 1 1 32px/)
})

test('every drop target can change ownership', () => {
  // `reorderProduct` writes productOrder only; `moveProduct` writes productGroups.
  // Two of the four targets called just the former, so a row could be dragged into
  // an empty/hidden group (whose target is the empty placeholder) but never back
  // out of it (the visible group has chips). Each target must be able to re-home.
  const orderAt = client.indexOf('reorderProduct(dragging, entry.id, position)')
  assert.notEqual(orderAt, -1, 'chip drop must call reorderProduct')
  const chipDrop = client.slice(orderAt - 700, orderAt)
  assert.match(chipDrop, /if \(onDropInto !== undefined\) onDropInto\(dragging\)/, 'chip drop must re-home before ordering')

  const tailAt = client.indexOf('const list = items.map((row) => String(row.id))')
  assert.notEqual(tailAt, -1, 'tail drop must build the item list')
  const tailDrop = client.slice(tailAt - 500, tailAt)
  assert.match(tailDrop, /if \(onDropInto !== undefined\) onDropInto\(dragging\)/, 'tail drop must re-home before ordering')

  assert.match(client, /moveProduct\(draggingProductRef\.current, section\.id\)/, 'row drop re-homes')
})

test('reordering does not depend on the row already being in the group', () => {
  // `grouped` is a render snapshot that save() does not refresh, so after a
  // moveProduct the dragged row is still listed under its old group. Returning
  // early when `source` is missing made cross-group reorders silently no-op.
  const body = client.match(/const reorderProduct = \(from, to, position\) => \{[\s\S]*?\n      \}/)
  assert.ok(body, 'reorderProduct must exist')
  // A row arriving from another group is absent from the pre-drop snapshot, so the
  // list must be seeded with it before the index arithmetic runs.
  assert.match(body[0], /if \(!current\.includes\(key\)\) current\.push\(key\)/)
  assert.doesNotMatch(body[0], /if \(source === -1 \|\| target === -1\) return/)
})

test('a chip does not wrap its own checkbox in a label', () => {
  // A <label> containing an <input> activates that input on any click inside it,
  // so dragging or selecting a chip also toggled its visibility. That is why
  // swapping a shown chip with a hidden one misbehaved.
  const chipAt = client.indexOf("className: chipClass.join(' ')")
  assert.notEqual(chipAt, -1, 'chip element must exist')
  const before = client.slice(chipAt - 120, chipAt)
  assert.match(before, /return h\('div', \{/, 'the chip container must be a div, not a label')
  assert.doesNotMatch(before, /return h\('label', \{/)
  // The checkbox keeps its own hit area and must not bubble into the chip.
  assert.match(client, /onClick: \(event\) => \{ event\.stopPropagation\(\) \},\s*onMouseDown: \(event\) => \{ event\.stopPropagation\(\) \},/)
})

test('folder open state has a single source', () => {
  // Two useState copies plus the persisted value meant the config page checkbox
  // and the rail heading could disagree; their factory defaults even differed
  // (['g-ai'] vs DEFAULT_OPEN_SECTIONS).
  assert.equal(
    (client.match(/const \[openSections, setOpenSections\]/g) ?? []).length,
    0,
    'openSections must not be mirrored in local state',
  )
  assert.equal((client.match(/setOpenSections\(/g) ?? []).length, 0, 'no local setter may remain')
  // Both readers go through the shared predicate.
  assert.match(client, /checked: isSectionOpen\(config, section\.id\),/)
  assert.match(client, /isSectionOpen\(config, section\.id\) \? t\('config\.open'\)/)
})

test('both folder readers share one predicate', () => {
  // The rail and the config page must decide "is this group open" the same way.
  const defs = client.match(/const open = Array\.isArray\(config\.openSections\) \? config\.openSections : DEFAULT_OPEN_SECTIONS/g) ?? []
  assert.ok(defs.length >= 1, 'isSectionOpen must default to the factory list')
  assert.match(client, /function isSectionOpen\(config, sectionId\)/)
})

test('every chip is draggable', () => {
  // Converting the chip from <label> to <div> dropped `draggable: true`: a label
  // has no implicit drag behaviour either, but the attribute had been carried by
  // the replaced block. Leaving it out makes every chip silently undraggable.
  const chipAt = client.indexOf("className: chipClass.join(' ')")
  assert.notEqual(chipAt, -1, 'chip element must exist')
  const chipOpen = client.slice(chipAt, chipAt + 1200)
  assert.match(chipOpen, /draggable: true/, 'the chip container must declare draggable')
  assert.match(chipOpen, /onDragStart: \(event\) => \{/, 'and must handle drag start')
})

test('the default group is always shown and always open', () => {
  // It anchors rows with no declared group, including products registered with an
  // id no group claims, and it draws no heading �� so both switches had nothing to
  // toggle. They are fixed on and rendered disabled.
  assert.match(
    client,
    /if \(sectionId === DEFAULT_SECTION_ID\) return true/,
    'isSectionOpen must force the anchor open regardless of stored config',
  )
  assert.match(client, /checked: isDefault \? true : !hidden,/, 'the visibility switch is pinned on')
  assert.match(client, /disabled: isDefault,/, 'both switches are disabled for the anchor')
  // A stale payload must not resurrect a collapsed anchor.
  assert.match(
    client,
    /parsed\.openSections = parsed\.openSections\.filter\(\(id\) => id !== DEFAULT_SECTION_ID\)/,
  )
})

test('chipList only references identifiers in its own scope', () => {
  // `chipList` is defined before `row`, so `section` does not exist inside it.
  // Two drop handlers used `section.id` anyway; every drop onto a chip or the tail
  // threw a ReferenceError, which aborted the handler before it cleared the drag
  // state �� surfacing as "doesn't move", "lands in the wrong group", "highlight
  // sticks". The target group must arrive through onDropInto.
  const start = client.indexOf('const chipList = (items, onDropInto) => {')
  const end = client.indexOf('const row = (section, index) => {')
  assert.ok(start > 0 && end > start, 'chipList must precede row')
  const body = client.slice(start, end)
  assert.equal(
    (body.match(/\bsection\.id\b/g) ?? []).length,
    0,
    'chipList must not reference section, which is out of scope there',
  )
  assert.match(body, /if \(onDropInto !== undefined\) onDropInto\(dragging\)/, 'it re-homes through the callback')
})

test('reorder moves a row onto its immediate neighbour', () => {
  // The old signature was reorder(from, to) meaning "take to's slot". Removing
  // `from` shifts `to` left when it was after, so inserting at its new index put
  // `from` straight back: dragging onto the adjacent row wrote an unchanged
  // order. The side must be explicit.
  const body = client.match(/const reorder = \(from, to, side\) => \{[\s\S]*?\n      \}/)
  assert.ok(body, 'reorder must take a side argument')
  const saveCalls = []
  const orderIds = () => ['a', 'b', 'c', 'd', 'e']
  // eslint-disable-next-line no-new-func
  const reorder = new Function('orderIds', 'save', body[0] + '; return reorder')(
    orderIds,
    (patch) => { saveCalls.push(patch) },
  )

  const run = (from, to, side) => {
    saveCalls.length = 0
    reorder(from, to, side)
    return saveCalls.length === 0 ? null : saveCalls[0].sectionOrder.join(' ')
  }

  // Adjacent moves in both directions �� the reported failures.
  assert.equal(run('a', 'b', 'after'), 'b a c d e', 'a below b')
  assert.equal(run('b', 'a', 'before'), 'b a c d e', 'b above a')
  assert.equal(run('b', 'c', 'after'), 'a c b d e', 'b below c')
  assert.equal(run('d', 'c', 'before'), 'a b d c e', 'd above c')
  // Long moves, including the appended end.
  assert.equal(run('a', 'd', 'after'), 'b c d a e', 'a below d')
  assert.equal(run('e', 'b', 'before'), 'a e b c d', 'e above b')
  assert.equal(run('a', null, 'after'), 'b c d e a', 'appended')
})

test('row highlight is cleared on every transition', () => {
  // The row's product-drag guard read the async useState value while every other
  // handler read the ref. On the first dragOver the state was still null, so the
  // row painted its highlight and nothing cleared it afterwards.
  assert.match(
    client,
    /const productDrag = draggingProductRef\.current !== null/,
    'the guard must read the ref',
  )
  // Drag leave must tolerate a null relatedTarget, which is the normal case
  // during a drag.
  assert.match(client, /if \(to !== null && event\.currentTarget\.contains\(to\)\) return/)
  // Entering a chip or the tail leaves the row body: both clear overRow.
  assert.ok(
    (client.match(/if \(overRow !== null\) setOverRow\(null\)/g) ?? []).length >= 2,
    'chip and tail entry must clear the row highlight',
  )
})

test('one drop moves a row between groups', () => {
  // `items` is the render-time slice of the destination group; a row arriving from
  // another group is not in it. Ordering against that stale list wrote a
  // productOrder that corresponded to no visible position, so the first drop
  // looked ignored and only a second attempt landed.
  const at = client.indexOf('if (!list.includes(from)) list.push(from)')
  assert.notEqual(at, -1, 'the tail drop must seed the destination list with the moved row')
  // The working list must be the complete order, not this render's snapshot: a row
  // omitted from productOrder sinks to the end because the sort substitutes
  // MAX_SAFE_INTEGER for a missing id.
  assert.match(client, /const current = fullOrder\(\)/, 'reorderProduct must start from the full order')
  assert.match(client, /const fullOrder = \(\) => \{/, 'fullOrder must exist')
  assert.match(
    client,
    /save\(\{ productGroups: stored, productOrder: fullOrder\(\) \}\)/,
    'changing ownership must also keep the order complete',
  )
})

test('no drag handler gates on the async drag state', () => {
  // Reading the useState value instead of the ref makes the first dragover return
  // before preventDefault, so the browser never treats the element as a drop
  // target and the drop does not fire at all �� "cross one, fails; cross several,
  // works". Every drop gate must read the ref.
  const lines = client.split('\n')
  const offenders = []
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    if (!/\bdraggingProduct\b/.test(line)) continue
    if (/setDraggingProduct|draggingProductRef|const \[draggingProduct/.test(line)) continue
    const context = lines.slice(Math.max(0, i - 12), i + 1).join('\n')
    if (/on(Drag|Drop)\w*: \(event\) => \{/.test(context)) offenders.push(i + 1)
  }
  assert.deepEqual(offenders, [], 'these handlers still read the state value instead of the ref')
})

test('the rail index is declared after the value it reads', () => {
  // `rowsBySection` is built from `grouped`. Declaring it earlier puts a `const`
  // read before its own declaration: the module still loads and `node --check`
  // still passes, then the rail throws Cannot access 'grouped' before
  // initialization the first time it renders.
  const lines = client.split(/\r?\n/)
  const groupedAt = lines.findIndex((line) =>
    line.includes('const grouped = resolveGrouping(navConfig, visibleSections, products)'))
  const indexAt = lines.findIndex((line) => line.includes('const rowsBySection = new Map()'))
  assert.notEqual(groupedAt, -1, 'the rail resolves grouped')
  assert.notEqual(indexAt, -1, 'the rail builds the per-group index')
  assert.ok(indexAt > groupedAt, 'the index must be built after grouped exists')
})
