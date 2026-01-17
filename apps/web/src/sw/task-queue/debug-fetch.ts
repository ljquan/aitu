/**
 * Debug Fetch Wrapper for Service Worker Internal Requests
 * 
 * Since SW internal fetch() calls don't trigger the SW's fetch event,
 * we need to manually log them for debugging purposes.
 */

interface FormDataField {
  name: string;
  value: string;
  isFile?: boolean;
  fileName?: string;
  mimeType?: string;
  dataUrl?: string; // Base64 data URL for images
}

interface Base64Image {
  key: string;
  dataUrl: string;
  mimeType: string;
  size: number; // Size in KB
}

interface DebugFetchLog {
  id: string;
  timestamp: number;
  url: string;
  method: string;
  requestType: 'sw-internal';
  status?: number;
  statusText?: string;
  duration?: number;
  error?: string;
  details?: string;
  requestBody?: string;
  responseBody?: string;
  formData?: FormDataField[]; // Parsed FormData fields
  base64Images?: Base64Image[]; // Extracted base64 images from request body
  isStreaming?: boolean; // Whether this is a streaming response
}

// Store for internal fetch logs
const internalFetchLogs: DebugFetchLog[] = [];
const MAX_INTERNAL_LOGS = 100;

// Debug mode enabled flag (synced with main SW)
let debugModeEnabled = false;

// Callback for broadcasting logs
let broadcastCallback: ((log: DebugFetchLog) => void) | null = null;

/**
 * Enable or disable debug mode for debugFetch
 * Should be synced with main SW debug mode
 */
export function setDebugFetchEnabled(enabled: boolean) {
  debugModeEnabled = enabled;
}

/**
 * Check if debug fetch is enabled
 */
export function isDebugFetchEnabled(): boolean {
  return debugModeEnabled;
}

/**
 * Set the broadcast callback for sending logs to debug panel
 */
export function setDebugFetchBroadcast(callback: (log: DebugFetchLog) => void) {
  broadcastCallback = callback;
}

/**
 * Get all internal fetch logs
 */
export function getInternalFetchLogs(): DebugFetchLog[] {
  return [...internalFetchLogs];
}

/**
 * Clear internal fetch logs
 */
export function clearInternalFetchLogs() {
  internalFetchLogs.length = 0;
}

/**
 * Update an existing log's response body (for streaming responses)
 * @param logId - The ID of the log to update
 * @param responseBody - The final response body content
 */
export function updateLogResponseBody(logId: string, responseBody: string) {
  const log = internalFetchLogs.find(l => l.id === logId);
  if (log) {
    // Truncate if too long
    log.responseBody = responseBody.length > 5000 
      ? responseBody.substring(0, 5000) + '...(truncated)' 
      : responseBody;
    
    // Broadcast updated log
    if (broadcastCallback) {
      broadcastCallback({ ...log });
    }
  }
}

/**
 * Convert Blob to base64 data URL
 */
async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Parse FormData into an array of fields
 */
async function parseFormData(formData: FormData): Promise<FormDataField[]> {
  const fields: FormDataField[] = [];
  
  for (const [name, value] of formData.entries()) {
    if (value instanceof Blob) {
      const field: FormDataField = {
        name,
        value: `[${value.type || 'binary'}] ${value.size} bytes`,
        isFile: true,
        mimeType: value.type,
      };
      
      // For images, convert to data URL for preview
      if (value.type.startsWith('image/') && value.size < 5 * 1024 * 1024) {
        try {
          field.dataUrl = await blobToDataUrl(value);
        } catch {
          // Ignore conversion errors
        }
      }
      
      if (value instanceof File) {
        field.fileName = value.name;
      }
      
      fields.push(field);
    } else {
      fields.push({
        name,
        value: String(value).length > 500 
          ? String(value).substring(0, 500) + '...' 
          : String(value),
      });
    }
  }
  
  return fields;
}

// Extended Response type with debug log ID
export interface DebugResponse extends Response {
  __debugLogId?: string;
}

/**
 * Wrapper for fetch that logs API calls
 * Use this for important API calls that need to be visible in debug panel
 * 
 * For streaming responses, you can update the final response body using:
 * updateLogResponseBody(response.__debugLogId, finalContent)
 */
export async function debugFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
  options?: {
    label?: string;
    logRequestBody?: boolean;
    logResponseBody?: boolean;
    isStreaming?: boolean; // Mark as streaming response (SSE, etc.)
  }
): Promise<DebugResponse> {
  // Skip all debug processing if debug mode is disabled - zero overhead
  if (!debugModeEnabled) {
    return fetch(input, init) as Promise<DebugResponse>;
  }
  
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const method = init?.method || 'GET';
  const startTime = Date.now();
  const id = Math.random().toString(36).substring(2, 10);
  
  // Parse request body for logging
  let requestBody: string | undefined;
  let formData: FormDataField[] | undefined;
  let base64Images: Base64Image[] | undefined;
  
  if (init?.body) {
    if (init.body instanceof FormData) {
      // Parse FormData with image support
      try {
        formData = await parseFormData(init.body);
      } catch {
        requestBody = '[FormData - unable to parse]';
      }
    } else if (options?.logRequestBody) {
      try {
        const bodyStr = typeof init.body === 'string' 
          ? init.body 
          : JSON.stringify(init.body);
        
        // Extract base64 images BEFORE truncating
        const imageRegex = /data:image\/([^;]+);base64,([A-Za-z0-9+/=]+)/g;
        let match;
        let imageIndex = 0;
        base64Images = [];
        
        while ((match = imageRegex.exec(bodyStr)) !== null) {
          const mimeType = `image/${match[1]}`;
          const base64Data = match[2];
          // Only include substantial images (at least 1KB of data)
          if (base64Data.length > 1000) {
            base64Images.push({
              key: `image[${imageIndex}]`,
              dataUrl: `data:${mimeType};base64,${base64Data}`,
              mimeType,
              size: Math.round(base64Data.length * 0.75 / 1024)
            });
            imageIndex++;
          }
        }
        
        if (base64Images.length === 0) {
          base64Images = undefined;
        }
        
        // Truncate display body (replace base64 with placeholder for display)
        let displayBody = bodyStr.replace(
          /data:image\/([^;]+);base64,[A-Za-z0-9+/=]+/g,
          (_, mimeType) => `[📷 image/${mimeType}]`
        );
        
        requestBody = displayBody.length > 3000 
          ? displayBody.substring(0, 3000) + '...(truncated)' 
          : displayBody;
      } catch {
        requestBody = '[unable to serialize body]';
      }
    }
  }
  
  const log: DebugFetchLog = {
    id,
    timestamp: startTime,
    url,
    method,
    requestType: 'sw-internal',
    details: options?.label || `SW Internal: ${method} ${new URL(url).pathname}`,
    requestBody,
    formData,
    base64Images,
    isStreaming: options?.isStreaming,
  };
  
  // Add to logs
  internalFetchLogs.unshift(log);
  if (internalFetchLogs.length > MAX_INTERNAL_LOGS) {
    internalFetchLogs.pop();
  }
  
  // Broadcast initial log
  if (broadcastCallback) {
    broadcastCallback({ ...log });
  }
  
  try {
    const response = await fetch(input, init);
    
    // Update log with response info
    log.status = response.status;
    log.statusText = response.statusText;
    log.duration = Date.now() - startTime;
    
    // Log response body if requested (skip for streaming responses)
    if (options?.isStreaming) {
      // Mark as streaming - can't capture response body
      log.responseBody = '[流式响应 - 数据通过 SSE/Stream 实时传输，无法捕获完整响应体]';
    } else if (options?.logResponseBody) {
      try {
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json') || contentType.includes('text/')) {
          const clone = response.clone();
          const text = await clone.text();
          log.responseBody = text.length > 2000 
            ? text.substring(0, 2000) + '...(truncated)' 
            : text;
        }
      } catch {
        // Ignore response body read errors
      }
    }
    
    // Broadcast updated log
    if (broadcastCallback) {
      broadcastCallback({ ...log });
    }
    
    // Attach log ID to response for later updates (e.g., streaming final content)
    (response as DebugResponse).__debugLogId = id;
    
    return response as DebugResponse;
  } catch (error: any) {
    const errorMessage = error.message || String(error);
    
    // Parse network error type for better display
    let errorType = 'NETWORK_ERROR';
    if (errorMessage.includes('ERR_CONNECTION_CLOSED')) {
      errorType = 'ERR_CONNECTION_CLOSED';
    } else if (errorMessage.includes('ERR_CONNECTION_REFUSED')) {
      errorType = 'ERR_CONNECTION_REFUSED';
    } else if (errorMessage.includes('ERR_CONNECTION_RESET')) {
      errorType = 'ERR_CONNECTION_RESET';
    } else if (errorMessage.includes('ERR_CONNECTION_TIMED_OUT') || errorMessage.includes('timeout')) {
      errorType = 'ERR_TIMEOUT';
    } else if (errorMessage.includes('ERR_NAME_NOT_RESOLVED')) {
      errorType = 'ERR_DNS_FAILED';
    } else if (errorMessage.includes('ERR_INTERNET_DISCONNECTED')) {
      errorType = 'ERR_OFFLINE';
    } else if (errorMessage.includes('ERR_SSL') || errorMessage.includes('certificate')) {
      errorType = 'ERR_SSL';
    } else if (errorMessage.includes('Failed to fetch')) {
      errorType = 'FETCH_FAILED';
    } else if (errorMessage.includes('AbortError') || errorMessage.includes('aborted')) {
      errorType = 'ABORTED';
    }
    
    log.status = 0; // Use 0 to indicate network error (no HTTP response)
    log.statusText = errorType;
    log.error = errorMessage;
    log.duration = Date.now() - startTime;
    
    // Broadcast error log
    if (broadcastCallback) {
      broadcastCallback({ ...log });
    }
    
    throw error;
  }
}
