/**
 * model-resolver.ts — Exact model lookup by "provider/modelId".
 */

export interface ModelEntry {
  id: string;
  name: string;
  provider: string;
}

export interface ModelRegistry {
  find(provider: string, modelId: string): any;
  getAll(): any[];
  getAvailable?(): any[];
}

export function resolveModel(
  input: string,
  registry: ModelRegistry,
): any | string {
  const slashIdx = input.indexOf("/");
  if (slashIdx === -1) {
    return error(input, registry);
  }

  const provider = input.slice(0, slashIdx);
  const modelId = input.slice(slashIdx + 1);
  const found = registry.find(provider, modelId);
  if (found) return found;

  return error(input, registry);
}

function error(input: string, registry: ModelRegistry): string {
  const all = (registry.getAvailable?.() ?? registry.getAll()) as ModelEntry[];
  const list = all
    .map((m) => `  ${m.provider}/${m.id}`)
    .sort()
    .join("\n");
  return `Model not found: "${input}".\n\nAvailable models:\n${list}`;
}
