/**
 * CMake File API client — reads codemodel-v2 responses to discover targets.
 *
 * The CMake File API works as follows:
 * 1. Write a query file to <buildDir>/.cmake/api/v1/query/client-vscode/query.json
 * 2. Run cmake (or wait for it to run) — CMake writes response files to
 *    <buildDir>/.cmake/api/v1/reply/
 * 3. Parse the index file and codemodel to extract targets
 *
 * See: https://cmake.org/cmake/help/latest/manual/cmake-file-api.7.html
 */

import * as fs from 'fs';
import * as path from 'path';
import type { BuildTarget, TargetKind } from '../../model/config';

const QUERY_DIR_SUFFIX = '.cmake/api/v1/query/client-targetrunmanager';
const REPLY_DIR_SUFFIX = '.cmake/api/v1/reply';
const QUERY_FILENAME = 'query.json';

/** Write the File API query file so CMake knows to generate a codemodel response. */
export function writeQueryFile(buildDir: string): void {
  const queryDir = path.join(buildDir, QUERY_DIR_SUFFIX);
  fs.mkdirSync(queryDir, { recursive: true });

  const queryFile = path.join(queryDir, QUERY_FILENAME);
  const query = {
    requests: [
      { kind: 'codemodel', version: 2 },
    ],
  };
  fs.writeFileSync(queryFile, JSON.stringify(query, null, 2));
}

/** Check if a reply directory exists for the given build dir. */
export function hasReply(buildDir: string): boolean {
  const replyDir = path.join(buildDir, REPLY_DIR_SUFFIX);
  return fs.existsSync(replyDir);
}

/** Parse the CMake File API reply and extract build targets. */
export function parseReply(buildDir: string): BuildTarget[] {
  const replyDir = path.join(buildDir, REPLY_DIR_SUFFIX);

  if (!fs.existsSync(replyDir)) {
    return [];
  }

  // Find the index file (index-*.json)
  const indexFile = findIndexFile(replyDir);
  if (!indexFile) {
    return [];
  }

  let index: CMakeIndex;
  try {
    index = JSON.parse(fs.readFileSync(indexFile, 'utf-8')) as CMakeIndex;
  } catch {
    return [];
  }

  // Find the codemodel reply
  const codemodeReply = index.reply?.['client-targetrunmanager']?.query?.requests
    ?.find((r: CMakeReplyRequest) => r.kind === 'codemodel');

  if (!codemodeReply) {
    // Try generic client or stateless
    return parseCodemodelFromIndex(index, replyDir);
  }

  return parseCodemodelFromIndex(index, replyDir);
}

function findIndexFile(replyDir: string): string | null {
  try {
    const files = fs.readdirSync(replyDir);
    const indexFiles = files.filter((f) => f.startsWith('index-') && f.endsWith('.json'));
    if (indexFiles.length === 0) {
      return null;
    }
    // Take the most recent one (they include a timestamp/hash in the name)
    indexFiles.sort();
    return path.join(replyDir, indexFiles[indexFiles.length - 1]);
  } catch {
    return null;
  }
}

function parseCodemodelFromIndex(index: CMakeIndex, replyDir: string): BuildTarget[] {
  const targets: BuildTarget[] = [];

  // Find codemodel files referenced in the index
  const stateless = index.reply?.stateless;
  if (!stateless) {
    return targets;
  }

  for (const [kind, reply] of Object.entries(stateless)) {
    if (kind !== 'codemodel-v2') {
      continue;
    }
    const codemodeFile = path.join(replyDir, (reply as { jsonFile: string }).jsonFile);
    targets.push(...parseCodemodelFile(codemodeFile, replyDir));
  }

  return targets;
}

function parseCodemodelFile(codemodeFile: string, replyDir: string): BuildTarget[] {
  if (!fs.existsSync(codemodeFile)) {
    return [];
  }

  let codemodel: CMakeCodemodel;
  try {
    codemodel = JSON.parse(fs.readFileSync(codemodeFile, 'utf-8')) as CMakeCodemodel;
  } catch {
    return [];
  }

  const targets: BuildTarget[] = [];

  for (const config of codemodel.configurations ?? []) {
    for (const targetRef of config.targets ?? []) {
      const targetFile = path.join(replyDir, targetRef.jsonFile);
      const target = parseTargetFile(targetFile);
      if (target) {
        targets.push(target);
      }
    }
  }

  return targets;
}

function parseTargetFile(targetFile: string): BuildTarget | null {
  if (!fs.existsSync(targetFile)) {
    return null;
  }

  let raw: CMakeTarget;
  try {
    raw = JSON.parse(fs.readFileSync(targetFile, 'utf-8')) as CMakeTarget;
  } catch {
    return null;
  }

  let kind: TargetKind;
  switch (raw.type) {
    case 'EXECUTABLE':
      kind = 'executable';
      break;
    default:
      // Skip non-executable targets (libraries, etc.)
      return null;
  }

  // Find the primary artifact (binary path)
  const artifact = raw.artifacts?.find((a) => !a.path.endsWith('.pdb'));
  const binaryPath = artifact?.path;

  return {
    name: raw.name,
    kind,
    binaryPath,
    buildSystem: 'cmake',
  };
}

// ------- CMake File API type definitions -------

interface CMakeIndex {
  reply?: {
    stateless?: Record<string, { jsonFile: string }>;
    [clientKey: string]: {
      query?: {
        requests?: CMakeReplyRequest[];
      };
    } | undefined;
  };
}

interface CMakeReplyRequest {
  kind: string;
  jsonFile?: string;
}

interface CMakeCodemodel {
  configurations?: Array<{
    targets?: Array<{
      name: string;
      jsonFile: string;
    }>;
  }>;
}

interface CMakeTarget {
  name: string;
  type: string;
  artifacts?: Array<{ path: string }>;
}
