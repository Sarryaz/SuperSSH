const { src, dest, series } = require('gulp');
const { build: buildIcons } = require('@n8n/nodes-base/dist/nodes/IconGenerator');

// Build icons for the nodes
function buildIconsTask() {
	return buildIcons({
		src: './nodes',
		dest: './dist',
	});
}

// Copy built files to dist
function copyFiles() {
	return src([
		'./nodes/**/*.js',
		'./credentials/**/*.js',
		'./utils/**/*.js'
	]).pipe(dest('./dist'));
}

// Main build task - compile TypeScript first, then build icons and copy files
const build = series(copyFiles, buildIconsTask);

// Export tasks
exports.build = build;
exports.buildIcons = buildIconsTask;
exports.copyFiles = copyFiles;
exports.default = build;
