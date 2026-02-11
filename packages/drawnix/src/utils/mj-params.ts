const MJ_PARAM_MAP: Record<string, string> = {
  mj_ar: '--ar',
  mj_v: '--v',
  mj_style: '--style',
  mj_s: '--s',
  mj_q: '--q',
  mj_seed: '--seed',
};

export const buildMJPromptSuffix = (params: Record<string, string>): string => {
  const parts: string[] = [];

  Object.entries(MJ_PARAM_MAP).forEach(([key, token]) => {
    const value = params[key];
    if (!value || value === 'default') return;
    parts.push(`${token} ${value}`);
  });

  return parts.join(' ');
};
