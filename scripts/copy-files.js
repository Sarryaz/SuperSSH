const fs = require('fs');
const path = require('path');

// Create dist directory if it doesn't exist
const distDir = './dist';
if (!fs.existsSync(distDir)) {
	fs.mkdirSync(distDir, { recursive: true });
}

// Copy compiled files
const copyFiles = () => {
	const sourceDirs = ['nodes', 'credentials', 'utils'];

	sourceDirs.forEach((dir) => {
		if (fs.existsSync(dir)) {
			copyDir(dir, path.join(distDir, dir));
		}
	});

	console.log('✅ Files copied to dist directory');
};

const shouldCopy = (file) => {
	return file.endsWith('.js') || file.endsWith('.json') || file.endsWith('.svg');
};

const copyDir = (src, dest) => {
	if (!fs.existsSync(dest)) {
		fs.mkdirSync(dest, { recursive: true });
	}

	const items = fs.readdirSync(src);

	items.forEach((item) => {
		const srcPath = path.join(src, item);
		const destPath = path.join(dest, item);

		const stat = fs.statSync(srcPath);

		if (stat.isDirectory()) {
			copyDir(srcPath, destPath);
		} else if (shouldCopy(item)) {
			fs.copyFileSync(srcPath, destPath);
		}
	});
};

copyFiles();
