import * as core from '@actions/core';
import * as github from '@actions/github';

async function run(): Promise<void> {
  try {
    const token = core.getInput('repo_token', { required: true });
    const externalRepoToken = core.getInput('external_repo_token', {
      required: false
    });
    const teamsConfigRepo = core.getInput('teams_configuration_repo', {
      required: true
    });
    const teamsConfigPath = core.getInput('teams_configuration_path', {
      required: true
    });

    const prNumber = getPrNumber();
    if (!prNumber) {
      throw new Error('Could not get pull request number from context');
    }

    const prAuthor = getPrAuthor();
    if (!prAuthor) {
      throw new Error('Could not get pull request author from context');
    }

    core.debug(`PR author: ${prAuthor}`);

    const client = new github.GitHub(token);
    const externalRepoClient = externalRepoToken
      ? new github.GitHub(externalRepoToken)
      : client;

    const [teamsRepoOwner, teamsRepoName] = getRepoParts(teamsConfigRepo);
    const teamsConfigLocation = {
      owner: teamsRepoOwner,
      repo: teamsRepoName,
      path: teamsConfigPath
    };

    core.debug(`Fetching teams from ${JSON.stringify(teamsConfigLocation)}`);

    const response = await externalRepoClient.repos.getContents(
      teamsConfigLocation
    );

    if (Array.isArray(response.data)) {
      throw new Error(
        'teams_configuration_path must point to a single teams configuration file, not a directory'
      );
    }

    const { content, encoding } = response.data;

    if (typeof content !== 'string' || encoding !== 'base64') {
      throw new Error(
        'Octokit.repos.getContents returned an unexpected response'
      );
    }

    const teamsYAML = Buffer.from(content, encoding).toString();

    core.debug(`raw teams config:\n${teamsYAML}`);

    const labels = [];

    if (prNumber % 2 === 0) {
      labels.push('even');
    } else {
      labels.push('odd');
    }

    core.debug(`labels to add: ${JSON.stringify(labels)}`);

    if (labels.length > 0) {
      await addLabels(client, prNumber, labels);
    }
  } catch (error) {
    core.error(error);
    core.setFailed(error.message);
  }
}

function getPrAuthor(): string | undefined {
  const pullRequest = github.context.payload.pull_request;
  if (!pullRequest) {
    return undefined;
  }

  return pullRequest.user.login;
}

function getPrNumber(): number | undefined {
  const pullRequest = github.context.payload.pull_request;
  if (!pullRequest) {
    return undefined;
  }

  return pullRequest.number;
}

function getRepoParts(teamsConfigRepoInput: string): string[] {
  const parts = teamsConfigRepoInput.split('/');

  return parts.length > 1
    ? parts
    : [github.context.repo.owner, teamsConfigRepoInput];
}

async function addLabels(
  client: github.GitHub,
  prNumber: number,
  labels: string[]
): Promise<void> {
  await client.issues.addLabels({
    owner: github.context.repo.owner,
    repo: github.context.repo.repo,
    issue_number: prNumber,
    labels
  });
}

run();
