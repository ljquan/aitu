/**
 * SW Capabilities Handler
 *
 * Handles delegated operations from Service Worker.
 * These are operations that require DOM/Board access and cannot run in SW.
 *
 * Architecture:
 * - SW has all MCP tools, but some return `delegateToMainThread: true`
 * - Main thread receives delegation requests and executes them here
 * - Results are sent back to SW
 */

export { SWCapabilitiesHandler, swCapabilitiesHandler } from './handler';
export type { DelegatedOperation, CapabilityResult } from './types';
