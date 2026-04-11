export type DomainEntry = Readonly<{
  path: string;
  read: boolean;
  write: boolean;
  delete: boolean;
}>;
