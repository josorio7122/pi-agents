type DomainEntry = Readonly<{
  path: string;
  read: boolean;
  write: boolean;
  delete: boolean;
}>;

type KnowledgeEntry = Readonly<{
  path: string;
  updatable: boolean;
}>;

export function buildDomainWithKnowledge(params: {
  readonly domain: ReadonlyArray<DomainEntry>;
  readonly knowledgeEntries: ReadonlyArray<KnowledgeEntry>;
}) {
  const implicitWritable = params.knowledgeEntries
    .filter((e) => e.updatable)
    .map((e) => ({ path: e.path, read: true, write: true, delete: false }));

  const implicitReadOnly = params.knowledgeEntries
    .filter((e) => !e.updatable)
    .map((e) => ({ path: e.path, read: true, write: false, delete: false }));

  return [...params.domain, ...implicitWritable, ...implicitReadOnly];
}
