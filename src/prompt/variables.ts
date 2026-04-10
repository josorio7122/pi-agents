export function resolveVariables(template: string, variables: Readonly<Record<string, string>>) {
  return Object.entries(variables).reduce((result, [key, value]) => result.replaceAll(`{{${key}}}`, value), template);
}
