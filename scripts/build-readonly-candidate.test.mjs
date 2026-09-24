import { beforeAll, describe, expect, it } from 'vitest'
import { buildCandidate, buildFromSources, readSources } from './build-readonly-candidate.mjs'
let built, sources
beforeAll(async () => { sources = await readSources(); built = buildFromSources(sources) })
function deferred() { let resolve; const promise = new Promise(r => { resolve = r }); return { promise, resolve } }
function mount(run) {
  let tool, registered = false
  const disposers = [], requests = []
  const session = { id: 'test-session' }, policy = { mode: 'read-only', workspaceRoot: 'synthetic-workspace', sessionId: session.id }
  const harness = { defineTool: value => value, registerTool(_ctx, value) { tool = value; registered = true; return () => { registered = false } } }
  const ctx = {
    effect(callback) { const dispose = callback(); disposers.push(dispose); return dispose },
    sessions: { get(id) { return id === session.id ? session : undefined } },
    sandboxPolicy: { resolve(request) { expect(request.session).toBe(session); expect(request).not.toHaveProperty('mode'); return policy } },
    shell: { resolve(spec) { requests.push(spec); expect(spec.sandboxPolicy).toBe(policy); return spec }, run },
  }
  new Function('harness', built.code)(harness).apply(ctx)
  const execute = (application, signal) => tool.execute({ application }, { agent: { id: session.id }, signal })
  return { execute, requests, stop() { for (const dispose of disposers.reverse()) dispose() }, registered: () => registered }
}
const result = json => ({ exitCode: 0, stdout: { text: JSON.stringify(json), truncated: false }, stderr: { text: '', truncated: false }, timedOut: false, aborted: false })

describe('generated readonly Host candidate, actual generated code', () => {
  it('is reproducible and has no runtime import/require', async () => {
    const next = await buildCandidate()
    expect(next.code).toBe(built.code); expect(next.sourceHash).toBe(built.sourceHash)
    expect(built.code).not.toMatch(/\brequire\s*\(|\bimport\s*\(/)
  })
  it('changes provenance when any included source changes', () => {
    const changed = { ...sources, 'src/core/recipe/engine.ts': sources['src/core/recipe/engine.ts'] + '\n// provenance regression\n' }
    expect(buildFromSources(changed).sourceHash).not.toBe(built.sourceHash)
  })
  it('refuses a recipe with an unreviewed command', () => {
    const name = 'src/connectors/github/github-cli-user.recipe.json'
    const recipe = JSON.parse(sources[name]); recipe.intents.verify.steps[0].with.command = 'gh auth logout'
    expect(() => buildFromSources({ ...sources, [name]: JSON.stringify(recipe) })).toThrow('Read-only verify contract changed')
  })
  it('refuses conditional validation in the embedded verify flow', () => {
    const name = 'src/connectors/feishu/feishu-cli-user.recipe.json'
    const recipe = JSON.parse(sources[name]); recipe.intents.verify.steps[1].when = { exists: { path: 'missing' } }
    expect(() => buildFromSources({ ...sources, [name]: JSON.stringify(recipe) })).toThrow('Read-only verify contract changed')
  })
  it('refuses to bind a bot recipe to the user method identity', () => {
    const name = 'src/connectors/feishu/feishu-cli-bot.recipe.json'
    const recipe = JSON.parse(sources[name]); recipe.methodId = 'feishu-cli-user'
    expect(() => buildFromSources({ ...sources, [name]: JSON.stringify(recipe) })).toThrow('Identity binding changed')
  })
  it('keeps synthetic bot success separate from user failure in generated code', async () => {
    const h = mount(async () => result({ identity: 'bot', verified: true, identities: { bot: { verified: true }, user: { tokenStatus: 'expired' } } }))
    expect(JSON.parse(await h.execute('feishu-bot'))).toMatchObject({ verification: 'passed', integrationId: 'feishu', methodId: 'feishu-cli-bot' })
    expect(JSON.parse(await h.execute('feishu'))).toMatchObject({ verification: 'failed', integrationId: 'feishu', methodId: 'feishu-cli-user' })
    h.stop()
  })
  it('does not substitute valid user authentication for bot verification', async () => {
    const h = mount(async () => result({ identity: 'user', verified: true, identities: { bot: { verified: false }, user: { status: 'logged_in', tokenStatus: 'valid' } } }))
    expect(JSON.parse(await h.execute('feishu'))).toMatchObject({ verification: 'passed', methodId: 'feishu-cli-user' })
    expect(JSON.parse(await h.execute('feishu-bot'))).toMatchObject({ verification: 'failed', methodId: 'feishu-cli-bot' })
    h.stop()
  })
  it('rejects the latest real observation shape for both methods', async () => {
    const h = mount(async () => result({ identity: 'none', identities: { bot: { status: 'verify_failed', verified: false }, user: { status: 'missing', tokenStatus: 'expired' } } }))
    for (const app of ['feishu', 'feishu-bot']) expect(JSON.parse(await h.execute(app))).toMatchObject({ verification: 'failed', errorCode: 'assertion_failed' })
    h.stop()
  })
  it('reports source identity without running any command', async () => {
    const h = mount(() => { throw new Error('must not run') })
    expect(JSON.parse(await h.execute('status'))).toMatchObject({ sourceHash: built.sourceHash, inFlight: 0 })
    expect(h.requests).toHaveLength(0); h.stop(); expect(h.registered()).toBe(false)
  })
  it('executes the embedded GitHub recipe with the exact same-session policy and redacts all account data', async () => {
    const h = mount(async () => result({ type: 'User', id: 123, login: 'synthetic-name', token: 'synthetic-secret' }))
    const raw = await h.execute('github')
    expect(JSON.parse(raw)).toMatchObject({ verification: 'passed', sourceHash: built.sourceHash, application: 'github', exitCode: 0 })
    expect(raw).not.toMatch(/synthetic-name|synthetic-secret|accountId/)
    expect(h.requests[0]).toMatchObject({ command: 'gh api --hostname github.com --method GET user', timeoutMs: 15000, stdoutMaxBytes: 65536 })
    h.stop()
  })
  it('the embedded Feishu recipe rejects bot verification with an expired user token', async () => {
    const h = mount(async () => result({ identity: 'bot', verified: true, identities: { user: { tokenStatus: 'expired' } } }))
    expect(JSON.parse(await h.execute('feishu'))).toMatchObject({ verification: 'failed', errorCode: 'assertion_failed' })
    h.stop()
  })
  it('does not report a CLI success when JSON is invalid', async () => {
    const h = mount(async () => ({ ...result({}), stdout: { text: 'invalid' } }))
    expect(JSON.parse(await h.execute('github'))).toMatchObject({ verification: 'failed', errorCode: 'invalid_json' }); h.stop()
  })
  it('does not return raw shell exceptions', async () => {
    const h = mount(async () => { throw new Error('synthetic-secret') })
    const raw = await h.execute('github')
    expect(JSON.parse(raw)).toMatchObject({ verification: 'failed', errorCode: 'command_error' }); expect(raw).not.toContain('synthetic-secret'); h.stop()
  })
  it('rejects a second active check and a late success after stop', async () => {
    const started = deferred(), gate = deferred()
    const h = mount(async () => { started.resolve(); return gate.promise })
    const pending = h.execute('github'); await started.promise
    expect(JSON.parse(await h.execute('status')).inFlight).toBe(1)
    await expect(h.execute('feishu')).rejects.toThrow('candidate_busy')
    h.stop(); gate.resolve(result({ type: 'User', id: 123 }))
    await expect(pending).rejects.toThrow('candidate_stopped')
    await expect(h.execute('status')).rejects.toThrow('candidate_stopped')
  })
  it('rejects unsupported app names rather than selecting inherited properties', async () => {
    const h = mount(async () => result({}))
    for (const app of ['toString', '__proto__', 'reauthorize']) await expect(h.execute(app)).rejects.toThrow('unsupported_application')
    expect(h.requests).toHaveLength(0); h.stop()
  })
})
