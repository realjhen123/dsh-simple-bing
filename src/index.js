/**
 * dsh-simple-bing plugin entry.
 *
 * Registers exactly one tool: `bing_search`. It deliberately does NOT register
 * a search provider, a fetch provider, a settings page, or any other tool.
 * @module dsh-simple-bing
 */

import { normalizeConfig } from "./config.js";
import { registerBingSearchTool } from "./tool.js";

export const name = "dsh-simple-bing";
export const inject = ["tools"];

/**
 * Mount the plugin.
 * @param {import('@deepseek-ai/cordis').Context} ctx - plugin context.
 * @param {unknown} rawConfig - config from the Cordis patch entry.
 * @returns {void}
 */
export function apply(ctx, rawConfig) {
  const config = normalizeConfig(rawConfig);
  registerBingSearchTool(ctx, config);
}
