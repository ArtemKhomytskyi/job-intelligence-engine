import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SECTIONS = ['profile', 'search', 'scoring', 'sources'] as const;

export async function createTemporaryConfigDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'jie-config-test-'));
  await Promise.all(
    SECTIONS.map(async (section) => {
      const content = await readFile(
        join('config', `${section}.example.yaml`),
        'utf8',
      );
      await writeFile(join(directory, `${section}.yaml`), content, 'utf8');
    }),
  );
  return directory;
}

export async function replaceInConfig(
  directory: string,
  section: (typeof SECTIONS)[number],
  search: string,
  replacement: string,
): Promise<void> {
  const path = join(directory, `${section}.yaml`);
  const content = await readFile(path, 'utf8');
  if (!content.includes(search)) {
    throw new Error(`Fixture text not found in ${path}: ${search}`);
  }
  await writeFile(path, content.replace(search, replacement), 'utf8');
}

export async function writeConfig(
  directory: string,
  section: (typeof SECTIONS)[number],
  content: string,
): Promise<void> {
  await writeFile(join(directory, `${section}.yaml`), content, 'utf8');
}

export async function removeTemporaryConfigDirectory(
  directory: string,
): Promise<void> {
  await rm(directory, { recursive: true, force: true });
}
