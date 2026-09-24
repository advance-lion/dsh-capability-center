/** Generate an import-free Cordis Host function body from the tested repository sources.
 * CLI prints JSON only; the development tool owns guarded artifact writes. */
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import ts from 'typescript'

const root = fileURLToPath(new URL('../', import.meta.url))
export const sourceFiles = [
  'src/core/recipe/expression.ts',
  'src/core/recipe/executor-registry.ts',
  'src/core/recipe/builtin-executors.ts',
  'src/core/recipe/engine.ts',
  'src/connectors/feishu/feishu-cli-user.recipe.json',
  'src/connectors/feishu/feishu-cli-bot.recipe.json',
  'src/connectors/github/github-cli-user.recipe.json',
  'scripts/build-readonly-candidate.mjs',
]
const targets = {
  feishu: { integrationId: 'feishu', methodId: 'feishu-cli-user', path: 'src/connectors/feishu/feishu-cli-user.recipe.json', command: 'lark-cli auth status --json --verify' },
  'feishu-bot': { integrationId: 'feishu', methodId: 'feishu-cli-bot', path: 'src/connectors/feishu/feishu-cli-bot.recipe.json', command: 'lark-cli auth status --json --verify' },
  github: { integrationId: 'github', methodId: 'github-cli-user', path: 'src/connectors/github/github-cli-user.recipe.json', command: 'gh api --hostname github.com --method GET user' },
}
const commands = Object.fromEntries(Object.entries(targets).map(([key, target]) => [key, target.command]))
const digest = value => createHash('sha256').update(value).digest('hex')

export async function readSources() {
  return Object.fromEntries(await Promise.all(sourceFiles.map(async name => [name, await readFile(path.join(root, name), 'utf8') ])))
}

export function buildFromSources(sources) {
  for (const name of sourceFiles) if (typeof sources[name] !== 'string') throw new Error('Missing source: ' + name)
  const inputs = sourceFiles.map(name => ({ path: name, sha256: digest(sources[name]) }))
  const sourceHash = digest(JSON.stringify({ compiler: ts.version, inputs }))
  const recipes = {}
  for (const [app, target] of Object.entries(targets)) {
    const recipe = JSON.parse(sources[target.path])
    if (recipe.schemaVersion !== 1 || recipe.id !== target.methodId || recipe.methodId !== target.methodId || recipe.integrationId !== target.integrationId) throw new Error('Identity binding changed: ' + app)
    const steps = recipe.intents?.verify?.steps
    if (!Array.isArray(steps) || steps.length !== 2 || steps[0].type !== 'command.json' ||
        steps[0].with?.command !== commands[app] || steps[1].type !== 'assert.expression' ||
        steps.some(step => step.when !== undefined)) throw new Error('Read-only verify contract changed: ' + app)
    recipes[app] = { schemaVersion: recipe.schemaVersion, id: recipe.id, version: recipe.version, integrationId: recipe.integrationId, methodId: recipe.methodId, intents: { verify: { steps } } }
  }
  const names = ['expression', 'executors', 'builtins', 'engine']
  const chunks = sourceFiles.slice(0, 4).map((name, index) => {
    const compiled = ts.transpileModule(sources[name], { fileName: name, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, removeComments: true }, reportDiagnostics: true })
    if (compiled.diagnostics?.some(d => d.category === ts.DiagnosticCategory.Error)) throw new Error('Transpile failed: ' + name)
    // Dependencies are finite and resolve only to already embedded modules.
    const body = compiled.outputText.replace(/\brequire\s*\(/g, 'loadModule(')
    return 'modules.' + names[index] + ' = {};\n((exports, loadModule) => {\n' + body + '\n})(modules.' + names[index] + ', loadModule);\n'
  }).join('\n')
  const adapter = `
return { inject: ['shell', 'sandboxPolicy', 'sessions'], apply(ctx) {
  let stopped = false, inFlight = 0;
  ctx.effect(() => () => { stopped = true; }, 'readonly candidate lifecycle');
  const tool = harness.defineTool({
    name: 'cap_recipe_verify',
    description: 'Run the repository RecipeEngine and reviewed verify-only recipe against real CLI services. Only Feishu auth status --verify and GitHub GET /user. Reuses existing credentials; no login/logout, writes, UI, API takeover or persistence. status returns artifact provenance. Output never includes account IDs or tokens.',
    parameters: { application: { type: 'string', required: true, enum: ['status', ...Object.keys(RECIPES)] } },
    output: { schema: { type: 'string' }, render(_args, value) { return [{ type: 'text', text: value }]; } },
    async execute(args, exec) {
      if (stopped) throw new Error('candidate_stopped');
      if (args.application === 'status') return JSON.stringify({ mode: 'readonly-candidate', sourceHash: SOURCE_HASH, inFlight, versions: Object.fromEntries(Object.entries(RECIPES).map(([key, recipe]) => [key, recipe.version])) });
      if (!Object.prototype.hasOwnProperty.call(RECIPES, args.application)) throw new Error('unsupported_application');
      if (inFlight) throw new Error('candidate_busy');
      if (!exec.agent) throw new Error('initiating_agent_required');
      const session = ctx.sessions.get(exec.agent.id);
      if (!session) throw new Error('live_session_required');
      const policy = ctx.sandboxPolicy.resolve({ session });
      const recipe = RECIPES[args.application];
      let expectedSpec, exitCode = null, commandExecuted = false;
      const host = { shell: {
        resolve(request) {
          if (stopped || request.command !== COMMANDS[args.application]) throw new Error('command_not_allowed');
          expectedSpec = ctx.shell.resolve({ command: request.command, timeoutMs: 15000, stdoutMaxBytes: 65536, workdir: policy.workspaceRoot, signal: exec.signal, sandboxPolicy: policy });
          return expectedSpec;
        },
        async run(spec) {
          if (stopped || spec !== expectedSpec || commandExecuted) throw new Error('invalid_command_lease');
          expectedSpec = undefined; commandExecuted = true;
          const result = await ctx.shell.run(spec);
          exitCode = typeof result.exitCode === 'number' ? result.exitCode : null;
          if (stopped) throw new Error('candidate_stopped');
          return result;
        }
      } };
      inFlight++;
      try {
        const registry = new modules.executors.ExecutorRegistry();
        modules.builtins.registerBuiltinExecutors(registry);
        const engine = new modules.engine.RecipeEngine(registry, host);
        const result = await engine.executeIntent(recipe, 'verify', { signal: exec.signal });
        if (stopped) throw new Error('candidate_stopped');
        return JSON.stringify({ mode: 'readonly-candidate', sourceHash: SOURCE_HASH, application: args.application, integrationId: recipe.integrationId, methodId: recipe.methodId, recipeVersion: recipe.version, verification: result.state === 'completed' ? 'passed' : 'failed', commandExecuted, exitCode, errorCode: result.state === 'failed' ? result.error.code : result.state === 'completed' ? null : 'unexpected_waiting' });
      } finally { inFlight--; }
    }
  });
  ctx.effect(() => harness.registerTool(ctx, tool), 'readonly recipe verification');
} };
`
  const code = '// Generated from reviewed sources; source SHA-256: ' + sourceHash + '\n' +
    'const SOURCE_HASH = ' + JSON.stringify(sourceHash) + ';\nconst RECIPES = ' + JSON.stringify(recipes) + ';\nconst COMMANDS = ' + JSON.stringify(commands) + ';\n' +
    'const modules = Object.create(null);\nfunction loadModule(name) { if (name === \'./expression\') return modules.expression; if (name === \'./executor-registry\') return modules.executors; throw new Error(\'Unsupported embedded dependency\'); }\n' + chunks + adapter
  if (/\brequire\s*\(|\bimport\s*\(/.test(code)) throw new Error('Runtime imports are forbidden')
  new Function('harness', code) // syntax validation only; no activation
  return { code, sourceHash, inputs }
}

export async function buildCandidate() {
  const sources = await readSources()
  const result = buildFromSources(sources)
  const after = await readSources()
  if (sourceFiles.some(name => after[name] !== sources[name])) throw new Error('Sources changed during build')
  return result
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await buildCandidate()
  process.stdout.write(JSON.stringify(result))
}
