import * as core from '@actions/core';
import * as github from '@actions/github';
import * as yaml from 'js-yaml';

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

    const teamsData = JSON.parse(JSON.stringify(yaml.safeLoad(teamsYAML)));
    const unexpectedFormatError = new Error(
      'Unexpected team data format (expected an object mapping team names to team metadata)'
    );

    if (typeof teamsData !== 'object') {
      throw unexpectedFormatError;
    }

    const teamLabelsToMembers: Map<string, string[]> = new Map();
    for (const teamName in teamsData) {
      const teamData = teamsData[teamName];

      if (teamData.members) {
        const { members, short_name } = teamData;
        const teamLabel =
          typeof short_name === 'string' ? short_name : teamName;

        if (Array.isArray(members)) {
          const teamGitHubUsernames: string[] = [];

          for (const member of members) {
            if (typeof member.github === 'string') {
              teamGitHubUsernames.push(member.github);
            } else {
              throw new Error(
                `Invalid member data encountered within team ${teamName}`
              );
            }
          }

          teamLabelsToMembers.set(teamLabel, teamGitHubUsernames);
          continue;
        }
      }

      throw unexpectedFormatError;
    }

    core.debug(
      `Parsed teams configuration into this mapping of team labels to members: ${JSON.stringify(
        Object.fromEntries(teamLabelsToMembers)
      )}`
    );

    const allMatchingLabels = getLabelsForAuthor(teamLabelsToMembers, prAuthor);

    const labels = allMatchingLabels.length > 0 ? [allMatchingLabels[0]] : [];

    core.debug(`labels to add: ${JSON.stringify(labels)}`);

    if (labels.length > 0) {
      await addLabels(client, prNumber, labels);
    }
  } catch (error) {
    core.error(error);
    core.setFailed(error.message);
  }
}

function getLabelsForAuthor(
  labelToAuthorsMap: Map<string, string[]>,
  author: string
): string[] {
  const labels: string[] = [];

  for (const [label, authors] of labelToAuthorsMap.entries()) {
    if (authors.includes(author)) {
      labels.push(label);
    }
  }

  return labels;
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
