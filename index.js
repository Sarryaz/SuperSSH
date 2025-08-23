// Export nodes and credentials for n8n
module.exports = {
	nodes: [
		require('./dist/nodes/SuperSsh/SuperSsh.node.js'),
		require('./dist/nodes/SshTemplateParser/SshTemplateParser.node.js'),
	],
	credentials: [
		require('./dist/credentials/SuperSshCredentials.credentials.js'),
	],
};
