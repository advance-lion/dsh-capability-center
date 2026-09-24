// Generated from reviewed sources; source SHA-256: e455d52499e9d5c405001b8ad9de7e9fc7cfb1197ef9333891d6bfcb26bfc382
const SOURCE_HASH = "e455d52499e9d5c405001b8ad9de7e9fc7cfb1197ef9333891d6bfcb26bfc382";
const RECIPES = {"feishu":{"schemaVersion":1,"id":"feishu-cli-user","version":"1.0.1","integrationId":"feishu","methodId":"feishu-cli-user","intents":{"verify":{"steps":[{"id":"recheck-auth","type":"command.json","with":{"command":"lark-cli auth status --json --verify","timeoutMs":15000,"stdoutMaxBytes":65536,"select":{"identity":"identity","verified":"verified","userStatus":"identities.user.status","tokenStatus":"identities.user.tokenStatus"}},"persist":["json","exitCode"]},{"id":"assert-still-authed","type":"assert.expression","with":{"expression":{"all":[{"equals":{"path":"recheck-auth.exitCode","value":0}},{"equals":{"path":"recheck-auth.json.identity","value":"user"}},{"equals":{"path":"recheck-auth.json.verified","value":true}},{"in":{"path":"recheck-auth.json.userStatus","values":["logged_in","ready"]}},{"equals":{"path":"recheck-auth.json.tokenStatus","value":"valid"}}]},"message":"飞书用户身份验证未通过；保留失败状态，不自动扩权或重新登录。"}}]}}},"feishu-bot":{"schemaVersion":1,"id":"feishu-cli-bot","version":"1.0.0","integrationId":"feishu","methodId":"feishu-cli-bot","intents":{"verify":{"steps":[{"id":"bot-auth","type":"command.json","with":{"command":"lark-cli auth status --json --verify","timeoutMs":15000,"stdoutMaxBytes":65536,"select":{"identity":"identity","verified":"verified","botVerified":"identities.bot.verified"}},"persist":["json","exitCode"]},{"id":"assert-bot-verified","type":"assert.expression","with":{"expression":{"all":[{"equals":{"path":"bot-auth.exitCode","value":0}},{"equals":{"path":"bot-auth.json.identity","value":"bot"}},{"equals":{"path":"bot-auth.json.verified","value":true}},{"equals":{"path":"bot-auth.json.botVerified","value":true}}]},"message":"飞书机器人验证失败或不可确认。"}}]}}},"github":{"schemaVersion":1,"id":"github-cli-user","version":"1.0.0","integrationId":"github","methodId":"github-cli-user","intents":{"verify":{"steps":[{"id":"current-user","type":"command.json","with":{"command":"gh api --hostname github.com --method GET user","timeoutMs":15000,"stdoutMaxBytes":65536,"select":{"accountId":"id","accountType":"type"}},"persist":["json","exitCode"]},{"id":"assert-authenticated","type":"assert.expression","with":{"expression":{"all":[{"equals":{"path":"current-user.exitCode","value":0}},{"equals":{"path":"current-user.json.accountType","value":"User"}},{"exists":{"path":"current-user.json.accountId"}},{"not":{"in":{"path":"current-user.json.accountId","values":[false,0,""]}}}]},"message":"GitHub 用户身份验证失败或不可确认。"}}]}}}};
const COMMANDS = {"feishu":"lark-cli auth status --json --verify","feishu-bot":"lark-cli auth status --json --verify","github":"gh api --hostname github.com --method GET user"};
const modules = Object.create(null);
function loadModule(name) { if (name === './expression') return modules.expression; if (name === './executor-registry') return modules.executors; throw new Error('Unsupported embedded dependency'); }
modules.expression = {};
((exports, loadModule) => {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolvePath = resolvePath;
exports.evaluateExpression = evaluateExpression;
exports.validateExpression = validateExpression;
function resolvePath(data, path) {
    if (!data || !path)
        return undefined;
    const segments = path.split('.');
    let current = data;
    for (const seg of segments) {
        if (current === null || current === undefined)
            return undefined;
        if (typeof current !== 'object')
            return undefined;
        current = current[seg];
    }
    return current;
}
function evaluateExpression(node, context) {
    const merged = {};
    for (const [stepId, output] of Object.entries(context)) {
        merged[stepId] = output;
        for (const [k, v] of Object.entries(output)) {
            if (!(k in merged))
                merged[k] = v;
        }
    }
    return evaluateNode(node, merged);
}
function evaluateNode(node, data) {
    if ('equals' in node) {
        const actual = resolvePath(data, node.equals.path);
        return deepEqual(actual, node.equals.value);
    }
    if ('not' in node) {
        return !evaluateNode(node.not, data);
    }
    if ('any' in node) {
        return node.any.some((child) => evaluateNode(child, data));
    }
    if ('all' in node) {
        return node.all.every((child) => evaluateNode(child, data));
    }
    if ('in' in node) {
        const actual = resolvePath(data, node.in.path);
        return node.in.values.some((v) => deepEqual(actual, v));
    }
    if ('exists' in node) {
        const actual = resolvePath(data, node.exists.path);
        return actual !== undefined && actual !== null;
    }
    return false;
}
function deepEqual(a, b) {
    if (a === b)
        return true;
    if (a === null || b === null)
        return false;
    if (typeof a !== typeof b)
        return false;
    if (typeof a === 'object') {
        try {
            return JSON.stringify(a) === JSON.stringify(b);
        }
        catch {
            return false;
        }
    }
    return false;
}
function validateExpression(node) {
    if (node === null || typeof node !== 'object') {
        throw new Error('Expression must be a non-null object');
    }
    const n = node;
    const keys = Object.keys(n);
    for (const key of keys) {
        switch (key) {
            case 'equals':
                validateEquals(n[key]);
                break;
            case 'not':
                validateExpression(n[key]);
                break;
            case 'any':
            case 'all':
                if (!Array.isArray(n[key]))
                    throw new Error(`${key} must be an array`);
                for (const child of n[key])
                    validateExpression(child);
                break;
            case 'in':
                validateIn(n[key]);
                break;
            case 'exists':
                validateExists(n[key]);
                break;
            default:
                throw new Error(`Unsupported expression operation: ${key}`);
        }
    }
}
function validateEquals(v) {
    if (v === null || typeof v !== 'object')
        throw new Error('equals must be an object');
    const e = v;
    if (typeof e.path !== 'string')
        throw new Error('equals.path must be a string');
    if (!('value' in e))
        throw new Error('equals requires a value field');
}
function validateIn(v) {
    if (v === null || typeof v !== 'object')
        throw new Error('in must be an object');
    const e = v;
    if (typeof e.path !== 'string')
        throw new Error('in.path must be a string');
    if (!Array.isArray(e.values))
        throw new Error('in.values must be an array');
}
function validateExists(v) {
    if (v === null || typeof v !== 'object')
        throw new Error('exists must be an object');
    const e = v;
    if (typeof e.path !== 'string')
        throw new Error('exists.path must be a string');
}

})(modules.expression, loadModule);

modules.executors = {};
((exports, loadModule) => {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExecutorRegistry = void 0;
exports.completed = completed;
exports.waitingUser = waitingUser;
exports.retryableFailure = retryableFailure;
exports.terminalFailure = terminalFailure;
exports.structuredError = structuredError;
class ExecutorRegistry {
    executors = new Map();
    register(executor) {
        if (this.executors.has(executor.type)) {
            throw new Error(`Step executor already registered: ${executor.type}`);
        }
        this.executors.set(executor.type, executor);
    }
    get(type) {
        return this.executors.get(type);
    }
    has(type) {
        return this.executors.has(type);
    }
    list() {
        return [...this.executors.keys()];
    }
    async execute(type, ctx, input) {
        const executor = this.executors.get(type);
        if (!executor) {
            return terminalFailure('unknown_executor', `No executor registered for step type: ${type}`);
        }
        try {
            return await executor.execute(ctx, input);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return {
                state: 'retryable_failure',
                error: {
                    category: 'unknown',
                    code: 'executor_threw',
                    message,
                    retryable: false,
                },
            };
        }
    }
}
exports.ExecutorRegistry = ExecutorRegistry;
function completed(output, evidence) {
    return { state: 'completed', output, evidence };
}
function waitingUser(challenge, checkpoint) {
    return { state: 'waiting_user', challenge, checkpoint };
}
function retryableFailure(code, message, retryAfterMs) {
    return {
        state: 'retryable_failure',
        error: structuredError(code, message, true),
        retryAfterMs,
    };
}
function terminalFailure(code, message) {
    return {
        state: 'terminal_failure',
        error: structuredError(code, message, false),
    };
}
function structuredError(code, message, retryable, category = 'unknown') {
    return { category, code, message, retryable };
}

})(modules.executors, loadModule);

modules.builtins = {};
((exports, loadModule) => {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertExpressionExecutor = exports.commandJsonExecutor = exports.executableResolveExecutor = void 0;
exports.registerBuiltinExecutors = registerBuiltinExecutors;
const expression_1 = loadModule("./expression");
const executor_registry_1 = loadModule("./executor-registry");
exports.executableResolveExecutor = {
    type: 'executable.resolve', risk: 'read', requiresUser: false,
    async execute(ctx, input) {
        const signal = ctx.signal;
        if (signal?.aborted)
            return (0, executor_registry_1.terminalFailure)('operation_cancelled', 'Operation cancelled');
        const command = input.command;
        if (typeof command !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._+-]*$/.test(command)) {
            return (0, executor_registry_1.terminalFailure)('invalid_input', 'Executable name must not contain paths or shell syntax');
        }
        const host = ctx.host;
        if (!host?.subprocess?.resolveExecutable)
            return (0, executor_registry_1.terminalFailure)('no_executable_service', 'Host does not provide executable lookup');
        try {
            const path = await host.subprocess.resolveExecutable(command, signal);
            if (signal?.aborted)
                return (0, executor_registry_1.terminalFailure)('operation_cancelled', 'Operation cancelled');
            return (0, executor_registry_1.completed)(path ? { found: true, path } : { found: false });
        }
        catch {
            return (0, executor_registry_1.terminalFailure)(signal?.aborted ? 'operation_cancelled' : 'executable_lookup_failed', 'Executable lookup did not complete');
        }
    },
};
const unsafeKeys = new Set(['__proto__', 'prototype', 'constructor']);
function selectionOf(value) {
    if (value === undefined)
        return undefined;
    if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new Error('invalid_selection');
    const entries = Object.entries(value);
    if (!entries.length || entries.length > 64)
        throw new Error('invalid_selection');
    return entries.map(([key, path]) => {
        if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(key) || unsafeKeys.has(key) || typeof path !== 'string')
            throw new Error('invalid_selection');
        const parts = path.split('.');
        if (parts.length > 16 || parts.some(part => !/^[a-zA-Z0-9_-]+$/.test(part) || unsafeKeys.has(part)))
            throw new Error('invalid_selection');
        return [key, parts];
    });
}
function projectScalars(value, selection) {
    const result = Object.create(null);
    for (const [key, parts] of selection) {
        let current = value;
        for (const part of parts) {
            current = current && typeof current === 'object' && Object.prototype.hasOwnProperty.call(current, part)
                ? current[part] : undefined;
        }
        if (current === undefined)
            continue;
        if (current !== null && !['boolean', 'string', 'number'].includes(typeof current))
            throw new Error('nonscalar_selection');
        result[key] = current;
    }
    return result;
}
exports.commandJsonExecutor = {
    type: 'command.json', risk: 'read', requiresUser: false,
    async execute(ctx, input) {
        const signal = ctx.signal;
        if (signal?.aborted)
            return (0, executor_registry_1.terminalFailure)('operation_cancelled', 'Operation cancelled');
        const command = input.command;
        if (typeof command !== 'string' || !command.trim())
            return (0, executor_registry_1.terminalFailure)('invalid_input', 'command.json requires a command');
        const timeoutMs = input.timeoutMs ?? 15000;
        const stdoutMaxBytes = input.stdoutMaxBytes ?? 524288;
        if (typeof timeoutMs !== 'number' || !Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 120000 ||
            typeof stdoutMaxBytes !== 'number' || !Number.isSafeInteger(stdoutMaxBytes) || stdoutMaxBytes <= 0 || stdoutMaxBytes > 1048576) {
            return (0, executor_registry_1.terminalFailure)('invalid_input', 'Invalid timeout or output limit');
        }
        let selection;
        try {
            selection = selectionOf(input.select);
        }
        catch {
            return (0, executor_registry_1.terminalFailure)('invalid_selection', 'Invalid JSON projection');
        }
        const host = ctx.host;
        if (!host?.shell?.resolve || !host.shell.run)
            return (0, executor_registry_1.terminalFailure)('no_shell_service', 'Host does not provide shell service');
        try {
            const spec = await host.shell.resolve({ command, timeoutMs, stdoutMaxBytes, signal });
            if (signal?.aborted)
                return (0, executor_registry_1.terminalFailure)('operation_cancelled', 'Operation cancelled');
            const result = await host.shell.run(spec);
            if (signal?.aborted || result.aborted)
                return (0, executor_registry_1.terminalFailure)('operation_cancelled', 'Operation cancelled');
            if (result.timedOut)
                return (0, executor_registry_1.terminalFailure)('command_timeout', 'Command exceeded its deadline');
            if (result.stdout?.truncated || result.stderr?.truncated)
                return (0, executor_registry_1.terminalFailure)('output_truncated', 'Command output exceeded its limit');
            if (typeof result.exitCode !== 'number' || !Number.isInteger(result.exitCode))
                return (0, executor_registry_1.terminalFailure)('unknown_exit_code', 'Command did not return a known exit code');
            if (input.expectError !== true && result.exitCode !== 0)
                return (0, executor_registry_1.terminalFailure)('command_failed', `Command exited with code ${result.exitCode}`);
            let json;
            try {
                json = JSON.parse(result.stdout?.text ?? '');
            }
            catch {
                return (0, executor_registry_1.terminalFailure)('invalid_json', 'Command did not return valid JSON');
            }
            if (selection) {
                try {
                    json = projectScalars(json, selection);
                }
                catch {
                    return (0, executor_registry_1.terminalFailure)('invalid_projection', 'Selected JSON values must be scalar');
                }
            }
            return (0, executor_registry_1.completed)({ json, exitCode: result.exitCode });
        }
        catch {
            return (0, executor_registry_1.terminalFailure)(signal?.aborted ? 'operation_cancelled' : 'command_error', 'Command could not complete');
        }
    },
};
exports.assertExpressionExecutor = {
    type: 'assert.expression', risk: 'read', requiresUser: false,
    async execute(ctx, input) {
        if (ctx.signal?.aborted)
            return (0, executor_registry_1.terminalFailure)('operation_cancelled', 'Operation cancelled');
        const expression = input.expression;
        const message = typeof input.message === 'string' ? input.message : 'Assertion failed';
        try {
            (0, expression_1.validateExpression)(expression);
            const passed = (0, expression_1.evaluateExpression)(expression, ctx.stepOutputs);
            if (!passed)
                return (0, executor_registry_1.terminalFailure)('assertion_failed', message);
            const evidence = [{ type: 'health', result: 'passed', payload: { assertion: 'expression', passed: true } }];
            return (0, executor_registry_1.completed)({ passed: true }, evidence);
        }
        catch {
            return (0, executor_registry_1.terminalFailure)('expression_error', 'Invalid assertion expression');
        }
    },
};
function registerBuiltinExecutors(registry) {
    registry.register(exports.executableResolveExecutor);
    registry.register(exports.commandJsonExecutor);
    registry.register(exports.assertExpressionExecutor);
}

})(modules.builtins, loadModule);

modules.engine = {};
((exports, loadModule) => {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RecipeEngine = void 0;
const expression_1 = loadModule("./expression");
class RecipeEngine {
    executors;
    host;
    constructor(executors, host) {
        this.executors = executors;
        this.host = host;
    }
    async executeIntent(recipe, intentName, options) {
        const intent = recipe.intents[intentName];
        if (!intent) {
            return {
                state: 'failed',
                error: { category: 'unknown', code: 'intent_not_found', message: `Intent "${intentName}" not found in recipe "${recipe.id}"`, retryable: false },
                retryable: false,
            };
        }
        const stepOutputs = options?.existingOutputs ? { ...options.existingOutputs } : {};
        const runId = `${recipe.id}:${intentName}:${Date.now()}`;
        for (let i = 0; i < intent.steps.length; i++) {
            const step = intent.steps[i];
            if (step.when) {
                try {
                    const shouldRun = (0, expression_1.evaluateExpression)(step.when, stepOutputs);
                    if (!shouldRun)
                        continue;
                }
                catch {
                    continue;
                }
            }
            const ctx = {
                host: this.host,
                stepOutputs,
                signal: options?.signal,
                runId,
            };
            const outcome = await this.executors.execute(step.type, ctx, step.with);
            if (outcome.state === 'completed') {
                const persisted = {};
                if (step.persist && step.persist.length > 0) {
                    for (const field of step.persist) {
                        persisted[field] = outcome.output[field];
                    }
                }
                else {
                    Object.assign(persisted, outcome.output);
                }
                stepOutputs[step.id] = persisted;
                continue;
            }
            if (outcome.state === 'waiting_user') {
                return {
                    state: 'waiting_user',
                    challenge: outcome.challenge,
                    checkpoint: { stepId: step.id, stepIndex: i, stepOutputs },
                };
            }
            if (outcome.state === 'retryable_failure') {
                return { state: 'failed', error: outcome.error, retryable: true };
            }
            if (outcome.state === 'terminal_failure') {
                return { state: 'failed', error: outcome.error, retryable: false };
            }
        }
        return { state: 'completed', stepOutputs };
    }
    async resumeIntent(recipe, intentName, checkpoint, options) {
        const intent = recipe.intents[intentName];
        if (!intent) {
            return {
                state: 'failed',
                error: { category: 'unknown', code: 'intent_not_found', message: `Intent "${intentName}" not found`, retryable: false },
                retryable: false,
            };
        }
        const stepOutputs = { ...checkpoint.stepOutputs };
        const runId = `${recipe.id}:${intentName}:resume:${Date.now()}`;
        const step = intent.steps[checkpoint.stepIndex];
        if (!step) {
            return { state: 'completed', stepOutputs };
        }
        const executor = this.executors.get(step.type);
        if (executor?.resume) {
            const ctx = { host: this.host, stepOutputs, signal: options?.signal, runId };
            const outcome = await executor.resume(ctx, checkpoint);
            if (outcome.state === 'completed') {
                const persisted = {};
                if (step.persist && step.persist.length > 0) {
                    for (const field of step.persist) {
                        persisted[field] = outcome.output[field];
                    }
                }
                else {
                    Object.assign(persisted, outcome.output);
                }
                stepOutputs[step.id] = persisted;
            }
            else if (outcome.state === 'waiting_user') {
                return { state: 'waiting_user', challenge: outcome.challenge, checkpoint: { stepId: step.id, stepIndex: checkpoint.stepIndex, stepOutputs } };
            }
            else {
                return { state: 'failed', error: outcome.error, retryable: outcome.state === 'retryable_failure' };
            }
        }
        for (let i = checkpoint.stepIndex + 1; i < intent.steps.length; i++) {
            const nextStep = intent.steps[i];
            if (nextStep.when) {
                try {
                    const shouldRun = (0, expression_1.evaluateExpression)(nextStep.when, stepOutputs);
                    if (!shouldRun)
                        continue;
                }
                catch {
                    continue;
                }
            }
            const ctx = { host: this.host, stepOutputs, signal: options?.signal, runId };
            const outcome = await this.executors.execute(nextStep.type, ctx, nextStep.with);
            if (outcome.state === 'completed') {
                const persisted = {};
                if (nextStep.persist && nextStep.persist.length > 0) {
                    for (const field of nextStep.persist) {
                        persisted[field] = outcome.output[field];
                    }
                }
                else {
                    Object.assign(persisted, outcome.output);
                }
                stepOutputs[nextStep.id] = persisted;
                continue;
            }
            if (outcome.state === 'waiting_user') {
                return { state: 'waiting_user', challenge: outcome.challenge, checkpoint: { stepId: nextStep.id, stepIndex: i, stepOutputs } };
            }
            if (outcome.state === 'retryable_failure') {
                return { state: 'failed', error: outcome.error, retryable: true };
            }
            if (outcome.state === 'terminal_failure') {
                return { state: 'failed', error: outcome.error, retryable: false };
            }
        }
        return { state: 'completed', stepOutputs };
    }
}
exports.RecipeEngine = RecipeEngine;

})(modules.engine, loadModule);

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
