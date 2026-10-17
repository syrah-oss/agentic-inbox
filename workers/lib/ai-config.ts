// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

/**
 * Default Workers AI models.
 *
 * These are verified against `GET /accounts/:id/ai/models/search` — the models
 * originally hardcoded upstream (`@cf/moonshotai/kimi-k2.5`,
 * `@cf/meta/llama-3.1-8b-instruct-fast`) have since been retired and now 404 at
 * runtime, which silently broke the email agent and the injection scanner.
 *
 * Every entry can be overridden per deployment with the matching Worker var
 * (see ENV_MODEL_KEYS below), so no code change is needed to swap models.
 */
export const AI_MODELS = {
	emailAgent: "@cf/moonshotai/kimi-k2.6",
	autoDraft: "@cf/moonshotai/kimi-k2.6",
	promptInjectionScanner: "@cf/zai-org/glm-4.7-flash",
	draftVerifier: "@cf/meta/llama-4-scout-17b-16e-instruct",
} as const;

export type AIModelKey = keyof typeof AI_MODELS;

const ENV_MODEL_KEYS = {
	emailAgent: "EMAIL_AGENT_MODEL",
	autoDraft: "AUTO_DRAFT_MODEL",
	promptInjectionScanner: "PROMPT_INJECTION_MODEL",
	draftVerifier: "DRAFT_VERIFIER_MODEL",
} as const satisfies Record<AIModelKey, string>;

export function getAIModel(key: AIModelKey, env?: object): string {
	const envKey = ENV_MODEL_KEYS[key];
	const configuredModel = env
		? (env as Record<string, unknown>)[envKey]
		: undefined;

	return typeof configuredModel === "string" && configuredModel.trim()
		? configuredModel.trim()
		: AI_MODELS[key];
}
