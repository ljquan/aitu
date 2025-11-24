/**
 * AI Generation Service Type Definitions
 * 
 * Defines types and interfaces for interacting with the AI generation API.
 * These types standardize the request/response format for image and video generation.
 */

import { GenerationParams, TaskResult, TaskType } from './task.types';

/**
 * Generation request interface
 * Encapsulates all data needed to make a generation API request
 */
export interface GenerationRequest {
  /** Type of content to generate */
  type: TaskType;
  /** Generation parameters */
  params: GenerationParams;
  /** Optional abort signal for request cancellation */
  signal?: AbortSignal;
}

/**
 * Generation response interface
 * Standardizes the API response format
 */
export interface GenerationResponse {
  /** Indicates if the generation was successful */
  success: boolean;
  /** Generated content result (if successful) */
  result?: TaskResult;
  /** Error information (if failed) */
  error?: GenerationError;
}

/**
 * Generation error interface
 * Provides detailed information about generation failures
 */
export interface GenerationError {
  /** Error code for categorization */
  code: string;
  /** Human-readable error message */
  message: string;
  /** HTTP status code (if applicable) */
  statusCode?: number;
  /** Additional error details */
  details?: any;
}
