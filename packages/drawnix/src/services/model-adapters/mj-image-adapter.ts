import type {
  AdapterContext,
  ImageGenerationRequest,
  ImageModelAdapter,
} from './types';
import { registerModelAdapter } from './registry';

type MJSubmitResponse = {
  code: number;
  description: string;
  result: number | string;
};

type MJQueryResponse = {
  status?: string;
  imageUrl?: string;
  failReason?: string;
  progress?: string;
};

const DEFAULT_POLL_INTERVAL_MS = 5000;
const DEFAULT_POLL_MAX_ATTEMPTS = 1080;

const normalizeBaseUrl = (context: AdapterContext): string => {
  if (!context.baseUrl) {
    throw new Error('Missing baseUrl for MJ adapter');
  }
  const trimmed = context.baseUrl.replace(/\/$/, '');
  return trimmed.endsWith('/v1') ? trimmed.slice(0, -3) : trimmed;
};

const resolveFetcher = (context: AdapterContext): typeof fetch => {
  return context.fetcher || fetch;
};

const buildAuthHeader = (context: AdapterContext): Record<string, string> => {
  return context.apiKey ? { Authorization: `Bearer ${context.apiKey}` } : {};
};

const stripDataUrlPrefix = (value: string): string => {
  const match = value.match(/^data:[^;]+;base64,(.*)$/);
  return match ? match[1] : value;
};

const isSuccessStatus = (status?: string): boolean => {
  if (!status) return false;
  const normalized = status.toLowerCase();
  return ['success', 'succeed', 'completed', 'done'].includes(normalized);
};

const isFailureStatus = (status?: string): boolean => {
  if (!status) return false;
  const normalized = status.toLowerCase();
  return ['fail', 'failed', 'failure', 'error'].includes(normalized);
};

const submitMJImagine = async (
  context: AdapterContext,
  body: Record<string, unknown>
): Promise<MJSubmitResponse> => {
  const baseUrl = normalizeBaseUrl(context);
  const response = await resolveFetcher(context)(
    `${baseUrl}/mj/submit/imagine`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...buildAuthHeader(context),
      },
      body: JSON.stringify(body),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`MJ submit failed: ${response.status} - ${errorText}`);
  }

  return response.json();
};

const queryMJTask = async (
  context: AdapterContext,
  taskId: string
): Promise<MJQueryResponse> => {
  const baseUrl = normalizeBaseUrl(context);
  const response = await resolveFetcher(context)(
    `${baseUrl}/mj/task/${taskId}/fetch`,
    {
      method: 'GET',
      headers: buildAuthHeader(context),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`MJ query failed: ${response.status} - ${errorText}`);
  }

  return response.json();
};

export const mjImageAdapter: ImageModelAdapter = {
  id: 'mj-image-adapter',
  label: 'Midjourney Image',
  kind: 'image',
  docsUrl: 'https://tuzi-api.apifox.cn',
  supportedModels: ['mj-imagine'],
  defaultModel: 'mj-imagine',
  async generateImage(context, request: ImageGenerationRequest) {
    const base64Array = (request.referenceImages || []).map((img) =>
      stripDataUrlPrefix(img)
    );

    const submitResponse = await submitMJImagine(context, {
      botType: 'MID_JOURNEY',
      prompt: request.prompt,
      base64Array,
    });

    const taskId = submitResponse.result?.toString();
    if (!taskId) {
      throw new Error('MJ submit missing task id');
    }

    for (let attempt = 0; attempt < DEFAULT_POLL_MAX_ATTEMPTS; attempt += 1) {
      await new Promise((resolve) =>
        setTimeout(resolve, DEFAULT_POLL_INTERVAL_MS)
      );
      const statusResponse = await queryMJTask(context, taskId);

      if (isSuccessStatus(statusResponse.status) && statusResponse.imageUrl) {
        return {
          url: statusResponse.imageUrl,
          format: 'jpg',
          raw: statusResponse,
        };
      }

      if (isFailureStatus(statusResponse.status)) {
        throw new Error(statusResponse.failReason || 'MJ generation failed');
      }
    }

    throw new Error('MJ generation timeout');
  },
};

export const registerMJImageAdapter = (): void => {
  registerModelAdapter(mjImageAdapter);
};
