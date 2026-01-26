export default {
	branches: [
		{
			name: 'main',
			prerelease: false,
		},
		{
			name: 'beta',
			prerelease: true,
		},
		{
			name: 'alpha',
			prerelease: true,
		},
	],
	plugins: [
		'@semantic-release/commit-analyzer',
		'@semantic-release/release-notes-generator',
		'@semantic-release/changelog',
		[
			'@semantic-release/git',
			{
				assets: ['package.json', 'package-lock.json'],
				message: 'chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}',
			},
		],
		'@semantic-release/github',
	],
};