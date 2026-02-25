/**
 * Shared types for the import module.
 */

import type { TargetKind, BuildSystem } from '../model/config';

/** A target discovered by parsing a build file. */
export interface ParsedTarget {
  name: string;         // target name as found in the file
  label: string;        // same as name for CMake; //pkg:name for Bazel
  kind: TargetKind;
  buildSystem: BuildSystem;
}
