'use strict';
import { GitTag } from '../git';
import { debug } from '../../system';

const tagWithRefRegex = /([0-9,a-f]+)\srefs\/tags\/(.*)/gm;
const tagWithAnnotationRegex = /^(.+?)(?:$|(?:\s+)(.*)$)/gm;

export class GitTagParser {
	@debug({ args: false, singleLine: true })
	static parse(data: string, repoPath: string): GitTag[] | undefined {
		if (!data) return undefined;

		const tags: GitTag[] = [];

		let name;
		let annotation;

		let match;
		do {
			match = tagWithAnnotationRegex.exec(data);
			if (match == null) break;

			[, name, annotation] = match;

			tags.push(
				new GitTag(
					repoPath,
					// Stops excessive memory usage -- https://bugs.chromium.org/p/v8/issues/detail?id=2869
					` ${name}`.substr(1),
					undefined,
					// Stops excessive memory usage -- https://bugs.chromium.org/p/v8/issues/detail?id=2869
					annotation == null || annotation.length === 0 ? undefined : ` ${annotation}`.substr(1)
				)
			);
		} while (true);

		return tags;
	}

	static parseWithRef(data: string, repoPath: string): GitTag[] | undefined {
		if (!data) return undefined;

		const tags: GitTag[] = [];

		let sha;
		let name;

		let match: RegExpExecArray | null;
		do {
			match = tagWithRefRegex.exec(data);
			if (match == null) break;

			[, sha, name] = match;

			tags.push(
				new GitTag(
					repoPath,
					// Stops excessive memory usage -- https://bugs.chromium.org/p/v8/issues/detail?id=2869
					` ${name}`.substr(1),
					// Stops excessive memory usage -- https://bugs.chromium.org/p/v8/issues/detail?id=2869
					` ${sha}`.substr(1)
				)
			);
		} while (true);

		return tags;
	}
}
