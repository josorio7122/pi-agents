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
  const knowledge = params.knowledgeEntries.map((e) => ({
    path: e.path,
    read: true,
    write: e.updatable,
    delete: false,
  }));
  const reports = params.reportsDir
    ? [{ path: params.reportsDir.path, read: true, write: params.reportsDir.updatable, delete: false }]
    : [];
  return [...params.domain, ...knowledge, ...reports];
}
