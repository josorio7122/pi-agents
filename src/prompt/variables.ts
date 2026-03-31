export function resolveVariables(template: string, variables: Readonly<Record<string, string>>) {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replaceAll(`{{${key}}}`, value);
  }
  return result;
}
