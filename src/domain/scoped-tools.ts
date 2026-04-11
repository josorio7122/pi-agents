import type { DomainEntry } from "./types.js";

type KnowledgeEntry = Readonly<{
  path: string;
  updatable: boolean;
}>;

export function buildDomainWithKnowledge(params: {
  readonly domain: ReadonlyArray<DomainEntry>;
  readonly knowledgeEntries: ReadonlyArray<KnowledgeEntry>;
  readonly reportsDir?: Readonly<{ path: string; updatable: boolean }>;
}) {
  const implicitWritable = params.knowledgeEntries
    .filter((e) => e.updatable)
    .map((e) => ({ path: e.path, read: true, write: true, delete: false }));

  const implicitReadOnly = params.knowledgeEntries
    .filter((e) => !e.updatable)
    .map((e) => ({ path: e.path, read: true, write: false, delete: false }));

  const reportsEntry = params.reportsDir
    ? [{ path: params.reportsDir.path, read: true, write: params.reportsDir.updatable, delete: false }]
    : [];

  return [...params.domain, ...implicitWritable, ...implicitReadOnly, ...reportsEntry];
}
